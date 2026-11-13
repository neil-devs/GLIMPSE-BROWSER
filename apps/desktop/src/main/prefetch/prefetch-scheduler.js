/**
 * @fileoverview Prefetch scheduler.
 * Coordinates the prefetch engine: decides WHICH visible links get prefetched
 * and in what ORDER based on ML predictions and bandwidth constraints.
 *
 * This is the central orchestrator that ties together:
 * - visibility-detector (link detection)
 * - click-predictor (ML scoring)
 * - speculation-injector (net.request prefetch)
 * - bandwidth-guard (network checks)
 * - cache-manager (tracking)
 *
 * @module desktop/prefetch/prefetch-scheduler
 */

'use strict';

const { PREFETCH_CONFIG } = require('@glimpse/shared/constants');
const settings = require('../storage/settings');
const { logger } = require('../utils/logger');
const { injectSpeculationRules } = require('./speculation-injector');
const bandwidthGuard = require('./bandwidth-guard');
const cacheManager = require('./cache-manager');

/** Lazy-load click-predictor to avoid circular deps at startup */
let clickPredictor = null;
function getClickPredictor() {
  if (!clickPredictor) {
    try {
      clickPredictor = require('../ml/click-predictor');
    } catch {
      clickPredictor = null;
    }
  }
  return clickPredictor;
}

/* ── State ──────────────────────────────────────────────────────── */

/** Currently visible URLs on the active search results page.
 *  Values include `firstSeenAt` — the timestamp when the link first became
 *  visible, used to enforce `minVisibilityDuration`. */
const visibleUrls = new Map();

/** URLs that have already been prefetched */
const prefetchedUrls = new Set();

/** Current aggressiveness level */
let aggressiveness = 'balanced';

/** Current max concurrent prefetches */
let maxConcurrent = PREFETCH_CONFIG.balanced.maxConcurrent;

/** Current engine name for ML predictions */
let currentEngine = 'google';

/** Reference to the active tab's webContents for injecting rules */
let activeWebContents = null;

/** Reference to the chrome webContents for sending IPC events */
let chromeWebContents = null;

/** Debounce timer for batching visibility events */
let prefetchTimer = null;

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Set the chrome WebContentsView reference for sending prefetch events to the UI.
 * @param {Electron.WebContents} wc
 */
function setChromeWebContents(wc) {
  chromeWebContents = wc;
}

/**
 * Called when a result link becomes visible in the viewport.
 *
 * @param {string} url - The link's destination URL
 * @param {number} position - 1-indexed position on the page
 * @param {string} domain - The link's domain
 * @param {Electron.WebContents} webContents - The tab's webContents
 */
function onLinkVisible(url, position, domain, webContents) {
  /* Store the active webContents reference */
  activeWebContents = webContents;

  /* Only record firstSeenAt once — don't reset on re-entry */
  if (!visibleUrls.has(url)) {
    visibleUrls.set(url, {
      url,
      position,
      domain,
      addedAt: Date.now(),
      firstSeenAt: Date.now(),
    });
  }

  /* Debounce to batch multiple simultaneous visibility events */
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    triggerPrefetch(webContents);
  }, 200);
}

/**
 * Core prefetch logic — evaluate visibility duration and fire net.request.
 * @param {Electron.WebContents} webContents
 */
async function triggerPrefetch(webContents) {
  if (!webContents || webContents.isDestroyed()) return;

  /* Ensure bandwidth guard has autodetected at least once */
  bandwidthGuard.autoDetectNetwork();

  /* Check bandwidth guard */
  const guard = bandwidthGuard.shouldPrefetch();
  if (!guard.allowed) {
    logger.debug('Prefetch blocked by bandwidth guard', { reason: guard.reason });
    return;
  }

  /* Apply suggested aggressiveness override if bandwidth dictates it */
  const effectiveAggressiveness = guard.suggestedAggressiveness || aggressiveness;
  const config = PREFETCH_CONFIG[effectiveAggressiveness];
  const effectiveMax = config ? config.maxConcurrent : 4;
  const minVisMs = config ? config.minVisibilityDuration : 800;

  /* Don't exceed concurrent limit */
  if (prefetchedUrls.size >= effectiveMax) {
    return;
  }

  const now = Date.now();

  /* Score and rank all pending visible URLs that have been visible long enough */
  const pendingUrls = [];
  for (const [pendingUrl, info] of visibleUrls) {
    if (prefetchedUrls.has(pendingUrl) || cacheManager.isPrefetched(pendingUrl)) {
      continue;
    }
    /* Enforce minimum visibility duration */
    if (now - info.firstSeenAt < minVisMs) {
      continue;
    }
    pendingUrls.push(info);
  }

  if (pendingUrls.length === 0) {
    /* Some links may still be below the duration threshold — reschedule */
    const earliestReady = findEarliestReadyTime(minVisMs, now);
    if (earliestReady > 0) {
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => triggerPrefetch(webContents), earliestReady);
    }
    return;
  }

  /* Use ML click predictor to rank */
  const predictor = getClickPredictor();
  let rankedUrls;
  if (predictor && typeof predictor.rankUrls === 'function') {
    rankedUrls = predictor.rankUrls(pendingUrls, currentEngine);
  } else {
    /* Fallback: sort by position (lower position = higher priority) */
    rankedUrls = pendingUrls.sort((a, b) => a.position - b.position);
  }

  /* Select top N URLs to prefetch */
  const slotsAvailable = effectiveMax - prefetchedUrls.size;
  const toPrefetch = rankedUrls.slice(0, slotsAvailable).map((l) => l.url);

  if (toPrefetch.length === 0) return;

  /* Prefetch via net.request (populates HTTP cache) */
  const result = await injectSpeculationRules(webContents, toPrefetch, 'prefetch');

  if (result && result.succeeded && result.succeeded.length > 0) {
    for (const prefetchUrl of result.succeeded) {
      prefetchedUrls.add(prefetchUrl);
      const sizeBytes = (result.bytes && result.bytes[prefetchUrl]) || 0;
      cacheManager.recordPrefetch(prefetchUrl, sizeBytes);

      /* Log to SQLite (lazy-load to avoid circular deps) */
      try {
        const { logPrefetchEntry } = require('../ipc/prefetch-handlers');
        logPrefetchEntry(prefetchUrl, 0, 'success');
      } catch { /* best effort */ }

      /* Notify the chrome UI */
      notifyChrome('prefetch:completed', { url: prefetchUrl });
    }

    logger.info('Prefetch completed', {
      succeeded: result.succeeded.length,
      failed: result.failed ? result.failed.length : 0,
      totalPrefetched: prefetchedUrls.size,
    });
  }

  /* Log failures */
  if (result && result.failed && result.failed.length > 0) {
    for (const failedUrl of result.failed) {
      try {
        const { logPrefetchEntry } = require('../ipc/prefetch-handlers');
        logPrefetchEntry(failedUrl, 0, 'failed');
      } catch { /* best effort */ }
    }
  }
}

/**
 * Find how many ms until the earliest not-yet-eligible link becomes eligible.
 * Returns 0 if there are none waiting.
 */
function findEarliestReadyTime(minVisMs, now) {
  let earliest = Infinity;
  for (const [url, info] of visibleUrls) {
    if (prefetchedUrls.has(url) || cacheManager.isPrefetched(url)) continue;
    const ready = info.firstSeenAt + minVisMs;
    if (ready > now && ready < earliest) {
      earliest = ready;
    }
  }
  return earliest === Infinity ? 0 : earliest - now + 10; /* +10ms buffer */
}

/**
 * Called when a result link goes out of view.
 *
 * @param {string} url
 */
function onLinkHidden(url) {
  visibleUrls.delete(url);
}

/**
 * Called when the user clicks a search result link.
 *
 * @param {string} url - The clicked URL
 * @param {boolean} fromCache - Whether it was served from the prefetch cache
 */
function onLinkClicked(url, fromCache) {
  if (fromCache || cacheManager.isPrefetched(url)) {
    cacheManager.recordHit(url);
    logger.info('Prefetch cache hit', { url });
  }

  notifyChrome('prefetch:linkClicked', { url, fromCache });
}

/**
 * Called when the user navigates to a new page.
 * Resets all per-page state.
 */
function onPageNavigate() {
  visibleUrls.clear();
  prefetchedUrls.clear();
  activeWebContents = null;
  clearTimeout(prefetchTimer);

  /* Abort in-flight prefetches and reset state from the previous page */
  try {
    const { resetState } = require('./speculation-injector');
    resetState();
  } catch { /* best effort */ }
}

/**
 * Update the aggressiveness level.
 *
 * @param {string} level - 'conservative' | 'balanced' | 'aggressive'
 */
function setAggressiveness(level) {
  if (PREFETCH_CONFIG[level]) {
    aggressiveness = level;
    maxConcurrent = PREFETCH_CONFIG[level].maxConcurrent;
    logger.info('Prefetch aggressiveness changed', { level, maxConcurrent });
  }
}

/**
 * Set the current engine name for ML predictions.
 *
 * @param {string} engineName
 */
function setCurrentEngine(engineName) {
  currentEngine = engineName;
}

/**
 * Get current scheduler state for debugging/status display.
 *
 * @returns {object}
 */
function getState() {
  return {
    visibleCount: visibleUrls.size,
    prefetchedCount: prefetchedUrls.size,
    aggressiveness,
    maxConcurrent,
    currentEngine,
    prefetchedUrls: [...prefetchedUrls],
  };
}

/* ── Internal Helpers ───────────────────────────────────────────── */

/**
 * Send an event to the chrome UI WebContentsView.
 */
function notifyChrome(channel, data) {
  try {
    if (chromeWebContents && !chromeWebContents.isDestroyed()) {
      chromeWebContents.send(channel, data);
    }
  } catch {
    /* Chrome view may have been destroyed */
  }
}

module.exports = {
  setChromeWebContents,
  onLinkVisible,
  onLinkHidden,
  onLinkClicked,
  onPageNavigate,
  setAggressiveness,
  setCurrentEngine,
  getState,
};
