/**
 * @fileoverview Prefetch scheduler.
 * Coordinates the prefetch engine: decides WHICH visible links get prefetched
 * and in what ORDER based on ML predictions and bandwidth constraints.
 *
 * This is the central orchestrator that ties together:
 * - visibility-detector (link detection)
 * - click-predictor (ML scoring)
 * - speculation-injector (Chromium prefetch)
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
const { logPrefetchEntry } = require('../ipc/prefetch-handlers');

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

/**
 * @typedef {object} VisibleLink
 * @property {string} url
 * @property {number} position - 1-indexed position on the page
 * @property {string} domain
 * @property {number} addedAt - Timestamp when the link became visible
 */

/** Currently visible URLs on the active search results page */
const visibleUrls = new Map();

/** URLs that have already been added to speculation rules */
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
async function onLinkVisible(url, position, domain, webContents) {
  /* Store the active webContents reference */
  activeWebContents = webContents;

  /* Add to visible URLs */
  visibleUrls.set(url, {
    url,
    position,
    domain,
    addedAt: Date.now(),
  });

  /* Already prefetched? Skip */
  if (prefetchedUrls.has(url) || cacheManager.isPrefetched(url)) {
    return;
  }

  /* Check bandwidth guard */
  const guard = bandwidthGuard.shouldPrefetch(url);
  if (!guard.allowed) {
    logger.debug('Prefetch blocked by bandwidth guard', { url, reason: guard.reason });
    return;
  }

  /* Apply suggested aggressiveness override if bandwidth dictates it */
  const effectiveAggressiveness = guard.suggestedAggressiveness || aggressiveness;
  const config = PREFETCH_CONFIG[effectiveAggressiveness];
  const effectiveMax = config.maxConcurrent;

  /* Don't exceed concurrent limit */
  if (prefetchedUrls.size >= effectiveMax) {
    return;
  }

  /* Score and rank all pending visible URLs */
  const pendingUrls = [];
  for (const [pendingUrl, info] of visibleUrls) {
    if (!prefetchedUrls.has(pendingUrl) && !cacheManager.isPrefetched(pendingUrl)) {
      pendingUrls.push(info);
    }
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

  /* Inject speculation rules */
  const allPrefetchUrls = [...prefetchedUrls, ...toPrefetch];
  const success = await injectSpeculationRules(webContents, allPrefetchUrls, 'prefetch');

  if (success) {
    for (const prefetchUrl of toPrefetch) {
      prefetchedUrls.add(prefetchUrl);
      cacheManager.recordPrefetch(prefetchUrl, 0);
      logPrefetchEntry(prefetchUrl, 0, 'success');

      /* Notify the chrome UI */
      notifyChrome('prefetch:completed', { url: prefetchUrl });
    }

    logger.info('Prefetch rules updated', {
      newUrls: toPrefetch.length,
      totalPrefetched: prefetchedUrls.size,
    });
  }
}

/**
 * Called when a result link goes out of view.
 * We keep the prefetched content in the speculation rules cache.
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
