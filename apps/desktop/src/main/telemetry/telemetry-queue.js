/**
 * @fileoverview Offline-first, persistent SQLite telemetry queue.
 * Batches telemetry sessions and sends them with exponential backoff and jitter.
 *
 * Guarantees:
 * - Never blocks the UI or prefetch critical path
 * - Caps backlog at 5,000 rows (drops oldest when capacity exceeded)
 * - HTTPS required in production (allows http only for localhost/127.0.0.1)
 * - 5-second network timeout per flush attempt
 * - Best-effort flush on quit
 *
 * @module desktop/telemetry/telemetry-queue
 */

'use strict';

const { getDb } = require('../storage/db');
const { logger } = require('../utils/logger');

const PREFIX = '[glimpse:telemetry-queue]';
const MAX_QUEUE_SIZE = 5000;
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 20_000; // 20s
const REQUEST_TIMEOUT_MS = 5000; // 5s

let flushTimer = null;
let isFlushing = false;
let apiBaseUrl = process.env.GLIMPSE_API_URL || 'http://localhost:3001';

/**
 * Configure the cloud API base URL.
 * @param {string} url
 */
function setApiBaseUrl(url) {
  if (url && typeof url === 'string') {
    apiBaseUrl = url.replace(/\/+$/, '');
  }
}

/**
 * Get count of rows in the queue.
 * @returns {number}
 */
function getQueueSize() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM telemetry_queue').get();
    return row ? row.count : 0;
  } catch (err) {
    logger.warn(`${PREFIX} Failed to get queue size`, { error: err.message });
    return 0;
  }
}

/**
 * Enqueue a session payload into SQLite.
 * Drops oldest records if backlog exceeds MAX_QUEUE_SIZE.
 *
 * @param {object} session
 */
function enqueue(session) {
  try {
    const db = getDb();
    const payloadStr = JSON.stringify(session);

    db.prepare(`
      INSERT INTO telemetry_queue (payload, created_at, attempts, next_attempt_at)
      VALUES (?, datetime('now'), 0, datetime('now'))
    `).run(payloadStr);

    /* Cap queue to MAX_QUEUE_SIZE */
    const size = getQueueSize();
    if (size > MAX_QUEUE_SIZE) {
      const dropCount = size - MAX_QUEUE_SIZE;
      db.prepare(`
        DELETE FROM telemetry_queue
        WHERE id IN (
          SELECT id FROM telemetry_queue ORDER BY id ASC LIMIT ?
        )
      `).run(dropCount);
      logger.info(`${PREFIX} Dropped ${dropCount} oldest telemetry records (queue capped at ${MAX_QUEUE_SIZE})`);
    }
  } catch (err) {
    logger.warn(`${PREFIX} Failed to enqueue telemetry`, { error: err.message });
  }
}

/**
 * Verify destination protocol satisfies privacy/security rules:
 * HTTPS is mandatory unless target is localhost / 127.0.0.1.
 *
 * @param {string} targetUrl
 * @returns {boolean}
 */
function isAllowedUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Flush up to BATCH_SIZE queued records to the cloud API.
 * @returns {Promise<number>} Number of sessions successfully sent
 */
async function flush() {
  if (isFlushing) return 0;
  isFlushing = true;

  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, payload, attempts
      FROM telemetry_queue
      WHERE datetime(next_attempt_at) <= datetime('now')
      ORDER BY id ASC
      LIMIT ?
    `).all(BATCH_SIZE);

    if (!rows || rows.length === 0) {
      isFlushing = false;
      return 0;
    }

    const sessions = [];
    const ids = [];

    for (const r of rows) {
      try {
        sessions.push(JSON.parse(r.payload));
        ids.push(r.id);
      } catch {
        /* Drop corrupted payload */
        db.prepare('DELETE FROM telemetry_queue WHERE id = ?').run(r.id);
      }
    }

    if (sessions.length === 0) {
      isFlushing = false;
      return 0;
    }

    /* Debug mode check: if GLIMPSE_TELEMETRY_DEBUG=1, print and do not send */
    if (process.env.GLIMPSE_TELEMETRY_DEBUG === '1') {
      logger.info(`${PREFIX} [DEBUG MODE] Telemetry batch payload:`, {
        batchCount: sessions.length,
        sessions,
      });
      // Delete rows in debug mode so queue doesn't blow up
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM telemetry_queue WHERE id IN (${placeholders})`).run(...ids);
      isFlushing = false;
      return sessions.length;
    }

    const endpoint = `${apiBaseUrl}/telemetry/batch`;
    if (!isAllowedUrl(endpoint)) {
      logger.error(`${PREFIX} Security violation: Telemetry endpoint must use HTTPS (${endpoint})`);
      isFlushing = false;
      return 0;
    }

    /* Send batch via fetch with 5s timeout */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GlimpseDesktop/1.0',
        },
        body: JSON.stringify(sessions),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        // Success: delete sent rows
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM telemetry_queue WHERE id IN (${placeholders})`).run(...ids);
        logger.debug(`${PREFIX} Successfully flushed ${sessions.length} sessions`);
        isFlushing = false;
        return sessions.length;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (networkErr) {
      clearTimeout(timeout);
      logger.warn(`${PREFIX} Flush attempt failed, scheduling backoff`, { error: networkErr.message });

      // Update attempts and calculate exponential backoff with jitter
      const updateStmt = db.prepare(`
        UPDATE telemetry_queue
        SET attempts = attempts + 1,
            next_attempt_at = datetime('now', ? || ' seconds')
        WHERE id = ?
      `);

      for (const r of rows) {
        const nextAttempts = r.attempts + 1;
        if (nextAttempts > 8) {
          // Drop permanently failing rows
          db.prepare('DELETE FROM telemetry_queue WHERE id = ?').run(r.id);
        } else {
          // Backoff: 2^attempts * 10s + jitter (0..5s), max 1 hour
          const backoffSec = Math.min(3600, Math.round(Math.pow(2, nextAttempts) * 10 + Math.random() * 5));
          updateStmt.run(`+${backoffSec}`, r.id);
        }
      }
    }
  } catch (err) {
    logger.warn(`${PREFIX} Unexpected flush error`, { error: err.message });
  } finally {
    isFlushing = false;
  }

  return 0;
}

/**
 * Start the recurring flush timer (runs every 20s).
 */
function startQueue() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  if (flushTimer.unref) {
    flushTimer.unref(); // Prevent timer from keeping Node alive
  }
}

/**
 * Stop the recurring flush timer.
 */
function stopQueue() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Delete all queued records from SQLite.
 */
function clearQueue() {
  try {
    const db = getDb();
    db.prepare('DELETE FROM telemetry_queue').run();
    logger.info(`${PREFIX} Local telemetry queue cleared`);
  } catch (err) {
    logger.warn(`${PREFIX} Failed to clear telemetry queue`, { error: err.message });
  }
}

module.exports = {
  setApiBaseUrl,
  enqueue,
  flush,
  startQueue,
  stopQueue,
  clearQueue,
  getQueueSize,
};
