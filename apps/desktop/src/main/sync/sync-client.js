/**
 * @fileoverview Telemetry and Cloud Sync client.
 * Automatically synchronizes all browser activities to Supabase:
 * - Search events (engine, query, visible counts)
 * - Result link events (position, visibility, prefetch status, click, cache hit)
 * - Prefetch performance (duration, byte size, network type, status)
 * - Browsing history (all navigated URLs, titles, visit count)
 * - Bookmarks (added/updated bookmarks)
 * - Downloads (url, filename, bytes downloaded, status)
 * - Activity audit logs (app start, settings change, navigation)
 *
 * All operations are non-blocking, asynchronous, and fire-and-forget
 * so they NEVER slow down the browser.
 *
 * @module desktop/sync/sync-client
 */

'use strict';

const https = require('node:https');
const { randomUUID } = require('node:crypto');
const settings = require('../storage/settings');
const { logger } = require('../utils/logger');

/* ── Configuration ──────────────────────────────────────────────── */

const SUPABASE_HOST = 'hzeaygkwuszvbsrsntgf.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6ZWF5Z2t3dXN6dmJzcnNudGdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTc0MzcxMywiZXhwIjoyMTA1MzE5NzEzfQ.DuZMc3xy_ea92lDec1-2zN5EoYU2UBBorSmgtJOZhoo';

const DEFAULT_USER_ID =
  process.env.DEFAULT_USER_ID || 'b9a7bce1-e7a4-4fff-a83c-f0e2cdb0eae4';

/** Flush batch every 2 seconds for near-real-time storage in cloud */
const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH = 20;

/* ── In-Memory Queue ────────────────────────────────────────────── */

/** @type {Array<{ table: string, payload: object, endpoint?: string }>} */
let queue = [];
let flushTimer = null;
let initialised = false;
let lastSearchEventId = null;

/* ── Helper Functions ───────────────────────────────────────────── */

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function isEnabled() {
  const envEnabled = process.env.TELEMETRY_ENABLED;
  if (envEnabled === 'true' || envEnabled === '1') return true;
  try {
    return settings.get('telemetryEnabled', true);
  } catch {
    return true;
  }
}

/* ── Core Supabase REST API Caller ──────────────────────────────── */

/**
 * Insert a row or array of rows directly into a Supabase table.
 * Uses native Node https request with keep-alive agent.
 */
function sendToSupabase(table, payload) {
  return new Promise((resolve) => {
    try {
      const data = JSON.stringify(payload);
      const req = https.request(
        {
          hostname: SUPABASE_HOST,
          port: 443,
          path: `/rest/v1/${table}`,
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            Prefer: 'return=minimal',
          },
          timeout: 5000,
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              logger.info(`[CloudDB] Synced to ${table}`, { status: res.statusCode });
            } else {
              logger.debug(`[CloudDB] Insert to ${table} returned ${res.statusCode}`);
            }
            resolve(res.statusCode);
          });
        }
      );

      req.on('error', (err) => {
        logger.debug(`[CloudDB] Error writing to ${table}: ${err.message}`);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.write(data);
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Enqueue an item for cloud storage.
 */
function enqueue(table, payload, endpoint = null) {
  if (!isEnabled()) return;
  queue.push({ table, payload, endpoint });

  if (queue.length >= MAX_BATCH) {
    flush().catch(() => {});
  }
}

/**
 * Flush all queued items to Supabase.
 */
async function flush() {
  if (queue.length === 0) return;
  const items = queue.splice(0);

  for (const item of items) {
    try {
      await sendToSupabase(item.table, item.payload);
    } catch {
      /* ignore */
    }
  }
}

/* ── Public API ─────────────────────────────────────────────────── */

function init() {
  if (initialised) return;
  initialised = true;

  flushTimer = setInterval(() => {
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  if (flushTimer.unref) flushTimer.unref();

  logger.info('[CloudDB] Telemetry & Sync client initialised — storing to Supabase', {
    host: SUPABASE_HOST,
    userId: DEFAULT_USER_ID,
  });

  /* Log app startup audit event */
  logActivityAudit('DEVICE_REGISTERED', {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    appVersion: '1.0.0',
    startedAt: new Date().toISOString(),
  });
}

async function shutdown() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flush();
  initialised = false;
}

/**
 * Log a search event (user performed a search).
 * Returns the searchEventId UUID for linking with result_link_events.
 */
function logSearchEvent(data) {
  const eventId = data.id || randomUUID();
  lastSearchEventId = eventId;
  const payload = {
    id: eventId,
    user_id: DEFAULT_USER_ID,
    search_engine: data.searchEngine || 'google',
    query_text: (data.queryText || '').slice(0, 500),
    result_count_visible: data.resultCount || 0,
    screen_resolution: data.screenResolution || null,
    window_width: data.windowWidth || null,
    window_height: data.windowHeight || null,
    searched_at: new Date().toISOString(),
  };

  enqueue('search_events', payload, '/telemetry/search');
  return eventId;
}

/**
 * Log visible/clicked search result links.
 */
function logLinkEvents(data) {
  if (!data.links || data.links.length === 0) return;

  let searchEventId = data.searchEventId || lastSearchEventId;
  if (!searchEventId) {
    searchEventId = logSearchEvent({ searchEngine: 'google', queryText: '_browsing_' });
  }

  for (const l of data.links) {
    const payload = {
      search_event_id: searchEventId,
      user_id: DEFAULT_USER_ID,
      url: l.url,
      domain: l.domain || extractDomain(l.url),
      link_position: l.position || 1,
      was_visible_on_load: l.wasVisible ?? true,
      was_prefetched: l.wasPrefetched ?? false,
      was_clicked: l.wasClicked ?? false,
      cache_hit: l.cacheHit ?? false,
      prefetch_duration_ms: l.prefetchDurationMs || null,
    };
    enqueue('result_link_events', payload, '/telemetry/link-events');
  }
}

/**
 * Log a prefetch performance event.
 */
function logPrefetchPerformance(data) {
  const payload = {
    user_id: DEFAULT_USER_ID,
    url: data.url,
    domain: data.domain || extractDomain(data.url),
    engine: data.engine || 'google',
    prefetch_triggered_at: data.triggeredAt || new Date().toISOString(),
    prefetch_completed_at: data.completedAt || new Date().toISOString(),
    bytes_transferred: data.sizeBytes || 0,
    status: data.status || 'success',
    failure_reason: data.failureReason || null,
    network_type: data.networkType || 'wifi',
    available_bandwidth_mbps: data.bandwidthMbps || 10,
  };

  enqueue('prefetch_performance_log', payload, '/telemetry/prefetch-performance');
}

/**
 * Log page load (cache hit vs cold load).
 */
function logPageLoad(data) {
  logActivityAudit('TELEMETRY_SUBMITTED', {
    type: 'page_load',
    url: data.url,
    fromCache: data.fromCache || false,
    loadTimeMs: data.loadTimeMs || 0,
  });
}

/**
 * Log a browsing history visit.
 */
function logHistoryVisit(data) {
  if (!data.url || data.url.startsWith('about:') || data.url.startsWith('data:')) return;

  const payload = {
    user_id: DEFAULT_USER_ID,
    url: data.url,
    title: (data.title || '').slice(0, 500),
    favicon_url: data.faviconUrl || null,
    visit_count: 1,
    source: data.source || 'direct',
    search_event_id: data.searchEventId || null,
    last_visited_at: new Date().toISOString(),
  };

  enqueue('browsing_history', payload);
}

/**
 * Log a bookmark creation/update.
 */
function logBookmark(data) {
  if (!data.url) return;

  const payload = {
    user_id: DEFAULT_USER_ID,
    title: (data.title || 'Untitled').slice(0, 500),
    url: data.url,
    favicon_url: data.faviconUrl || null,
    position: data.position || 0,
    is_synced: true,
    last_synced_at: new Date().toISOString(),
  };

  enqueue('bookmarks', payload);
}

/**
 * Log a download event.
 */
function logDownload(data) {
  if (!data.url) return;

  const payload = {
    user_id: DEFAULT_USER_ID,
    url: data.url,
    filename: (data.filename || 'download').slice(0, 500),
    file_size_bytes: data.fileSize || null,
    status: data.status || 'completed',
    bytes_downloaded: data.bytesDownloaded || 0,
  };

  enqueue('downloads', payload);
}

/**
 * Log an audit action to activity_audit_log.
 */
function logActivityAudit(actionType, metadata = {}) {
  const payload = {
    user_id: DEFAULT_USER_ID,
    action_type: actionType,
    metadata: metadata,
  };

  enqueue('activity_audit_log', payload);
}

function getQueueSize() {
  return queue.length;
}

module.exports = {
  init,
  shutdown,
  isEnabled,
  logSearchEvent,
  logLinkEvents,
  logPrefetchPerformance,
  logPageLoad,
  logHistoryVisit,
  logBookmark,
  logDownload,
  logActivityAudit,
  flush,
  getQueueSize,
};
