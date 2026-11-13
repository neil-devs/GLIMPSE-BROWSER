/**
 * @fileoverview Telemetry sync client.
 * Sends anonymous usage data to the Glimpse cloud API so the ML model can be
 * retrained over time. All telemetry is opt-in (controlled by the
 * `telemetryEnabled` setting which defaults to false).
 *
 * Data is batched in memory and flushed periodically or when the batch
 * reaches a configurable size. All network calls are fire-and-forget —
 * failures are silently dropped so they never affect browser performance.
 *
 * @module desktop/sync/sync-client
 */

'use strict';

const settings = require('../storage/settings');
const { logger } = require('../utils/logger');
const { TELEMETRY_BATCH_SIZE } = require('@glimpse/shared/constants');

/* ── Configuration ──────────────────────────────────────────────── */

/** How often to flush the queue (ms) */
const FLUSH_INTERVAL_MS = 30_000;

/** Maximum items per batch before an early flush is triggered */
const MAX_BATCH = TELEMETRY_BATCH_SIZE || 50;

/** Cloud API base URL (set via .env or fallback) */
function getApiBase() {
  return process.env.CLOUD_API_URL || 'http://localhost:3001/api/v1';
}

/* ── Queues ─────────────────────────────────────────────────────── */

/** @type {Array<{ endpoint: string, payload: object }>} */
let queue = [];

/** Flush timer reference */
let flushTimer = null;

/** Whether the client has been initialised */
let initialised = false;

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Initialise the telemetry client.
 * Starts the periodic flush timer. Safe to call multiple times.
 */
function init() {
  if (initialised) return;
  initialised = true;

  /* Start the periodic flush */
  flushTimer = setInterval(() => {
    flush().catch(() => { /* swallow */ });
  }, FLUSH_INTERVAL_MS);

  /* Don't prevent the process from exiting */
  if (flushTimer.unref) flushTimer.unref();

  logger.debug('Telemetry client initialised', {
    enabled: isEnabled(),
    flushIntervalMs: FLUSH_INTERVAL_MS,
  });
}

/**
 * Shut down the telemetry client.
 * Attempts a final flush before stopping.
 */
async function shutdown() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flush();
  initialised = false;
}

/**
 * Check whether telemetry is enabled in user settings.
 * @returns {boolean}
 */
function isEnabled() {
  return settings.get('telemetryEnabled', false);
}

/* ── Event Loggers ──────────────────────────────────────────────── */

/**
 * Log a search event (user performed a search on an engine).
 *
 * @param {object} data
 * @param {string} data.searchEngine - Engine name (google, bing, …)
 * @param {string} data.queryText - The search query
 * @param {number} [data.resultCount] - Number of results detected
 */
function logSearchEvent(data) {
  enqueue('/telemetry/search', {
    search_engine: data.searchEngine,
    query_text: data.queryText || '',
    result_count: data.resultCount || 0,
    searched_at: new Date().toISOString(),
  });
}

/**
 * Log link visibility / click events for a batch of links on one page.
 *
 * @param {object} data
 * @param {string} data.searchEventId - Reference to the search event (or empty)
 * @param {Array<{ url: string, domain: string, position: number, wasVisible: boolean, wasClicked: boolean }>} data.links
 */
function logLinkEvents(data) {
  if (!data.links || data.links.length === 0) return;

  enqueue('/telemetry/link-events', {
    search_event_id: data.searchEventId || null,
    links: data.links.map((l) => ({
      url: l.url,
      domain: l.domain,
      link_position: l.position,
      was_visible_on_load: l.wasVisible ?? true,
      was_clicked: l.wasClicked ?? false,
    })),
  });
}

/**
 * Log a prefetch performance event (a URL was prefetched — record timing).
 *
 * @param {object} data
 * @param {string} data.url - The prefetched URL
 * @param {string} data.domain - Domain of the URL
 * @param {number} data.position - Position in search results
 * @param {number} data.durationMs - How long the prefetch took
 * @param {number} data.sizeBytes - Response size in bytes
 * @param {string} data.status - 'success' | 'failed'
 * @param {number} [data.clickProbability] - ML-predicted click probability
 */
function logPrefetchPerformance(data) {
  enqueue('/telemetry/prefetch-performance', {
    url: data.url,
    domain: data.domain || '',
    link_position: data.position || 0,
    prefetch_duration_ms: data.durationMs || 0,
    size_bytes: data.sizeBytes || 0,
    status: data.status || 'success',
    click_probability: data.clickProbability || 0,
    prefetched_at: new Date().toISOString(),
  });
}

/**
 * Log a page load event (user clicked a link — record whether it was a cache hit).
 *
 * @param {object} data
 * @param {string} data.url - The URL the user navigated to
 * @param {boolean} data.fromCache - Whether the page was served from prefetch cache
 * @param {number} [data.loadTimeMs] - Total page load time (if measured)
 * @param {number} [data.position] - Position in search results
 */
function logPageLoad(data) {
  enqueue('/telemetry/page-load', {
    url: data.url,
    from_cache: data.fromCache || false,
    load_time_ms: data.loadTimeMs || 0,
    link_position: data.position || 0,
    loaded_at: new Date().toISOString(),
  });
}

/* ── Internal Helpers ───────────────────────────────────────────── */

/**
 * Add an item to the queue. Triggers an early flush when the queue
 * reaches MAX_BATCH.
 *
 * @param {string} endpoint - API path (appended to base URL)
 * @param {object} payload - Event data
 */
function enqueue(endpoint, payload) {
  if (!isEnabled()) return;

  queue.push({ endpoint, payload });

  if (queue.length >= MAX_BATCH) {
    flush().catch(() => { /* swallow */ });
  }
}

/**
 * Flush the queue — group items by endpoint, POST each batch.
 * Errors are silently swallowed so they never affect the browser.
 */
async function flush() {
  if (queue.length === 0) return;
  if (!isEnabled()) {
    queue = [];
    return;
  }

  /* Drain the queue */
  const items = queue.splice(0);

  /* Group by endpoint */
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.endpoint)) {
      groups.set(item.endpoint, []);
    }
    groups.get(item.endpoint).push(item.payload);
  }

  /* POST each group */
  const base = getApiBase();
  for (const [endpoint, payloads] of groups) {
    try {
      const url = `${base}${endpoint}`;
      const body = JSON.stringify({ events: payloads });

      await fetchPost(url, body);
      logger.debug('Telemetry flushed', { endpoint, count: payloads.length });
    } catch (err) {
      /* Fire-and-forget — log and move on */
      logger.debug('Telemetry flush failed', {
        endpoint,
        error: err.message,
      });
    }
  }
}

/**
 * POST JSON to a URL. Uses Node's built-in fetch (available in Electron 28+).
 * Falls back to the Electron net module if fetch is unavailable.
 *
 * @param {string} url
 * @param {string} body - JSON string
 */
async function fetchPost(url, body) {
  if (typeof globalThis.fetch === 'function') {
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return;
  }

  /* Fallback: Electron net module */
  const { net: electronNet } = require('electron');
  return new Promise((resolve, reject) => {
    try {
      const request = electronNet.request({
        url,
        method: 'POST',
      });
      request.setHeader('Content-Type', 'application/json');
      request.on('response', (response) => {
        response.on('data', () => {});
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 400) {
            resolve();
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        });
        response.on('error', reject);
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Get queue size for debugging/status display.
 * @returns {number}
 */
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
  flush,
  getQueueSize,
};
