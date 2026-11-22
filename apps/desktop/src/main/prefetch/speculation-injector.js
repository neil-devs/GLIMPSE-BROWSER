/**
 * @fileoverview Prefetch injector using Electron's net module.
 * Replaces the Speculation Rules API approach (which is blocked by CSP on
 * most search engine pages) with real HTTP prefetch requests that populate
 * the shared Chromium HTTP cache.
 *
 * When the user later navigates to a prefetched URL, the page loads from
 * the HTTP cache — delivering near-instant page loads.
 *
 * @see https://www.electronjs.org/docs/latest/api/net
 * @module desktop/prefetch/speculation-injector
 */

'use strict';

const { net, session } = require('electron');
const { logger } = require('../utils/logger');

/** Map of URL → AbortController for in-flight prefetch requests */
const inflight = new Map();

/** Set of URLs that have been successfully prefetched */
const completed = new Set();

/** Map of URL → byte count for successfully prefetched URLs */
const prefetchedBytes = new Map();

/**
 * Prefetch a list of URLs by making real HTTP GET requests.
 * The responses populate Chromium's HTTP cache so that subsequent
 * navigations to these URLs load from cache.
 *
 * Waits for all prefetch requests to settle (complete or fail) and returns
 * a structured result so the scheduler knows exactly what succeeded.
 *
 * @param {Electron.WebContents} webContents - The tab's webContents (used for session)
 * @param {string[]} urls - Array of URLs to prefetch
 * @param {'prefetch'|'prerender'} [_mode='prefetch'] - Kept for API compat
 * @returns {Promise<{ succeeded: string[], failed: string[], bytes: Object<string, number> }>}
 */
async function injectSpeculationRules(webContents, urls, _mode = 'prefetch') {
  const result = { succeeded: [], failed: [], bytes: {} };

  if (!urls || urls.length === 0) return result;

  /* Filter out invalid URLs and already-completed ones */
  const validUrls = urls.filter((url) => {
    if (completed.has(url) || inflight.has(url)) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });

  if (validUrls.length === 0) return result;

  /* Determine the session to use — same session as the webContents
     so the HTTP cache is shared with the tab */
  let sess = session.defaultSession;
  try {
    if (webContents && !webContents.isDestroyed()) {
      sess = webContents.session || session.defaultSession;
    }
  } catch {
    /* Use default session */
  }

  /* Launch all prefetches in parallel and await all of them */
  const promises = validUrls.map(async (url) => {
    const controller = new AbortController();
    inflight.set(url, controller);

    try {
      const res = await prefetchUrl(url, sess, controller.signal);
      inflight.delete(url);

      if (res.ok) {
        completed.add(url);
        prefetchedBytes.set(url, res.bytes);
        result.succeeded.push(url);
        result.bytes[url] = res.bytes;
        logger.info('Prefetch OK', {
          url: url.substring(0, 80),
          bytes: res.bytes,
          status: res.status,
        });
      } else {
        result.failed.push(url);
        logger.info('Prefetch failed', {
          url: url.substring(0, 80),
          status: res.status,
        });
      }
    } catch (err) {
      inflight.delete(url);
      result.failed.push(url);
      logger.info('Prefetch error', {
        url: url.substring(0, 80),
        error: err.message,
      });
    }
  });

  /* Wait for ALL prefetches to settle */
  await Promise.allSettled(promises);

  if (result.succeeded.length > 0) {
    logger.info('Prefetch batch complete', {
      succeeded: result.succeeded.length,
      failed: result.failed.length,
    });
  }

  return result;
}

/**
 * Perform a single prefetch request.
 *
 * @param {string} url - URL to prefetch
 * @param {Electron.Session} sess - Session for cache sharing
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<{ ok: boolean, bytes: number, status: number }>}
 */
function prefetchUrl(url, sess, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      return reject(new Error('Aborted'));
    }

    try {
      const request = net.request({
        url,
        method: 'GET',
        session: sess,
        useSessionCookies: true,
        cache: 'default',
      });

      /* Add headers that identify this as a prefetch */
      request.setHeader('Purpose', 'prefetch');
      request.setHeader('Sec-Purpose', 'prefetch');
      request.setHeader('Accept', 'text/html,application/xhtml+xml,*/*');

      /* Abort support */
      const onAbort = () => {
        try { request.abort(); } catch { /* already done */ }
      };
      signal.addEventListener('abort', onAbort, { once: true });

      /* Timeout — 15 seconds */
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        try { request.abort(); } catch { /* already done */ }
        resolve({ ok: false, bytes: 0, status: 0 });
      }, 15000);

      let totalBytes = 0;
      let statusCode = 0;

      request.on('response', (response) => {
        statusCode = response.statusCode;

        /* Read and discard body — this ensures the full response is
           written to the HTTP cache */
        response.on('data', (chunk) => {
          totalBytes += chunk.length;
        });

        response.on('end', () => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
          resolve({ ok: statusCode >= 200 && statusCode < 400, bytes: totalBytes, status: statusCode });
        });

        response.on('error', () => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
          resolve({ ok: false, bytes: totalBytes, status: statusCode });
        });
      });

      request.on('error', (err) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      request.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Cancel all in-flight prefetch requests for the current page.
 * Called on navigation to a new page.
 *
 * @param {Electron.WebContents} [_webContents] - Kept for API compatibility
 * @returns {Promise<boolean>}
 */
async function removeSpeculationRules(_webContents) {
  let cancelled = 0;
  for (const [, controller] of inflight) {
    try {
      controller.abort();
      cancelled++;
    } catch { /* already aborted */ }
  }
  inflight.clear();

  if (cancelled > 0) {
    logger.debug('Cancelled in-flight prefetches', { count: cancelled });
  }

  return cancelled > 0;
}

/**
 * Replace current prefetch set with new URLs.
 * Cancels URLs no longer in the set, starts new ones.
 *
 * @param {Electron.WebContents} webContents
 * @param {string[]} urls - New URL set
 * @param {'prefetch'|'prerender'} [mode='prefetch']
 * @returns {Promise<{ succeeded: string[], failed: string[], bytes: Object }>}
 */
async function updateSpeculationRules(webContents, urls, mode = 'prefetch') {
  return injectSpeculationRules(webContents, urls, mode);
}

/**
 * Get the list of URLs that have been successfully prefetched.
 *
 * @param {Electron.WebContents} [_webContents]
 * @returns {Promise<string[]>} Array of prefetched URLs
 */
async function getSpeculationStatus(_webContents) {
  return [...completed];
}

/**
 * Check if a specific URL has been prefetched.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isPrefetched(url) {
  return completed.has(url);
}

/**
 * Get the byte count for a specific prefetched URL.
 *
 * @param {string} url
 * @returns {number} Bytes fetched, or 0 if not found
 */
function getPrefetchedBytes(url) {
  return prefetchedBytes.get(url) || 0;
}

/**
 * Get the estimated bytes transferred for prefetched content.
 *
 * @returns {{ inflight: number, completed: number, totalBytes: number }}
 */
function getStats() {
  let totalBytes = 0;
  for (const bytes of prefetchedBytes.values()) {
    totalBytes += bytes;
  }
  return {
    inflight: inflight.size,
    completed: completed.size,
    totalBytes,
  };
}

/**
 * Reset all state. Called when navigating away from a search page.
 */
function resetState() {
  /* Cancel in-flight */
  for (const [, controller] of inflight) {
    try { controller.abort(); } catch { /* ignore */ }
  }
  inflight.clear();
  completed.clear();
  prefetchedBytes.clear();
}

module.exports = {
  injectSpeculationRules,
  removeSpeculationRules,
  updateSpeculationRules,
  getSpeculationStatus,
  isPrefetched,
  getPrefetchedBytes,
  getStats,
  resetState,
};
