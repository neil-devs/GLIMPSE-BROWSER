/**
 * @fileoverview Prefetch scheduler.
 * Coordinates the prefetch engine: decides WHICH visible links get prefetched
 * and in what ORDER based on ML predictions and bandwidth constraints.
 *
 * Rewired to use preload-pool (WebContentsView pool) for instant-open,
 * instead of the old net.request speculation-injector.
 *
 * Links are ranked (ML score → position fallback) and only the top-N are
 * pooled — never every visible result. N comes from PREFETCH_CONFIG
 * (conservative 3, balanced 6, aggressive 12).
 *
 * @module desktop/prefetch/prefetch-scheduler
 */

'use strict';

const { PREFETCH_CONFIG } = require('@glimpse/shared/constants');
const settings = require('../storage/settings');
const { logger } = require('../utils/logger');
const pool = require('./preload-pool');
const bandwidthGuard = require('./bandwidth-guard');
const cacheManager = require('./cache-manager');

const PREFIX = '[glimpse:prefetch]';

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

/** Currently visible URLs on the active search results page. */
const visibleUrls = new Map();

/** URLs that have already been sent to the pool */
const pooledUrls = new Set();

/** Current aggressiveness level */
let aggressiveness = 'balanced';

/** Current engine name for ML predictions */
let currentEngine = 'google';

/** Reference to the active tab's webContents */
let activeWebContents = null;

/** Reference to the chrome webContents for sending IPC events */
let chromeWebContents = null;

/** Debounce timer for batching visibility events */
let prefetchTimer = null;

/** Track click timestamps for MISS render-time measurement */
const missClickTimestamps = new Map();

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
  activeWebContents = webContents;

  if (!visibleUrls.has(url)) {
    visibleUrls.set(url, {
      url,
      position,
      domain,
      addedAt: Date.now(),
      firstSeenAt: Date.now(),
    });

    /* Eagerly preconnect (DNS + TCP + TLS) to visible domains if preconnectAll is enabled */
    const preconnectAll = settings.get('preconnectAll', process.env.PREFETCH_PRECONNECT_ALL !== 'false');
    if (preconnectAll) {
      try {
        webContents.session.preconnect({ url, numSockets: 3 });
      } catch { /* best effort */ }
    }
  }

  /* Ultra-short debounce: batch IntersectionObserver bursts but fire ASAP */
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    triggerPrefetch(webContents);
  }, 10);
}

/**
 * Handle user hovering over a search result link (>80ms).
 * Eagerly preconnects and pools the link with top priority.
 * @param {string} url
 * @param {number} position
 * @param {string} domain
 * @param {Electron.WebContents} webContents
 */
function onLinkHover(url, position, domain, webContents) {
  const hoverBoostEnabled = settings.get('hoverBoost', process.env.PREFETCH_HOVER_BOOST !== 'false');
  if (!hoverBoostEnabled || !webContents || webContents.isDestroyed()) return;

  activeWebContents = webContents;
  if (!visibleUrls.has(url)) {
    visibleUrls.set(url, {
      url,
      position,
      domain,
      addedAt: Date.now(),
      firstSeenAt: Date.now(),
    });
  }

  try {
    webContents.session.preconnect({ url, numSockets: 3 });
  } catch { /* best effort */ }

  if (!pooledUrls.has(url)) {
    logger.info(`${PREFIX} hover boost pooling`, { url: url.substring(0, 50), position });
    pool.addUrl(url, webContents.session, 0);
    pooledUrls.add(url);
    notifyChrome('prefetch:completed', { url });
  }
}

/**
 * Core prefetch logic — rank visible links and pool the top-N.
 * Never pools every visible result; ranking decides which get preloaded.
 * @param {Electron.WebContents} webContents
 */
async function triggerPrefetch(webContents) {
  if (!webContents || webContents.isDestroyed()) return;

  logger.info(`${PREFIX} triggerPrefetch called`, {
    visibleCount: visibleUrls.size,
    alreadyPooled: pooledUrls.size,
  });

  /* Ensure bandwidth guard has autodetected at least once */
  bandwidthGuard.autoDetectNetwork();

  /* Check bandwidth guard */
  const guard = bandwidthGuard.shouldPrefetch();
  if (!guard.allowed) {
    logger.info(`${PREFIX} Prefetch blocked by bandwidth guard`, { reason: guard.reason });
    return;
  }

  /* Apply suggested aggressiveness override if bandwidth dictates it */
  const effectiveAggressiveness = guard.suggestedAggressiveness || aggressiveness;
  const config = PREFETCH_CONFIG[effectiveAggressiveness];
  const effectiveMax = config ? config.maxConcurrent : PREFETCH_CONFIG.balanced.maxConcurrent;

  /* Zero visibility threshold — pool links the INSTANT they're seen.
   * WebContentsView loading takes 1-3 seconds anyway; every ms of head
   * start matters for the "click and it's already there" experience. */
  const minVisMs = 0;

  /* Don't exceed concurrent limit */
  if (pooledUrls.size >= effectiveMax) {
    return;
  }

  const now = Date.now();

  /* Collect all pending visible URLs that have been visible long enough */
  const pendingUrls = [];
  for (const [pendingUrl, info] of visibleUrls) {
    if (pooledUrls.has(pendingUrl)) {
      continue;
    }
    /* Enforce minimum visibility duration */
    if (now - info.firstSeenAt < minVisMs) {
      continue;
    }
    pendingUrls.push(info);
  }

  if (pendingUrls.length === 0) {
    logger.info(`${PREFIX} No URLs ready for pool`, {
      totalVisible: visibleUrls.size,
      alreadyPooled: pooledUrls.size,
      minVisMs,
    });
    /* Some links may still be below the duration threshold — reschedule */
    const earliestReady = findEarliestReadyTime(minVisMs, now);
    if (earliestReady > 0) {
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => triggerPrefetch(webContents), earliestReady);
    }
    return;
  }

  /* ── Rank by ML model score, fall back to position order ────── */
  const predictor = getClickPredictor();
  let rankedUrls;
  if (predictor && typeof predictor.rankUrls === 'function') {
    rankedUrls = predictor.rankUrls(pendingUrls, currentEngine);
  } else {
    /* Fallback: sort by position (lower position = higher priority) */
    rankedUrls = pendingUrls.sort((a, b) => a.position - b.position);
  }

  /* Select only the top-N to pool — never all visible results.
   * Respect stagedConcurrency to prevent network bufferbloat. */
  const slotsAvailable = effectiveMax - pooledUrls.size;
  const stagedLimit = settings.get('stagedConcurrency', parseInt(process.env.PREFETCH_STAGED_CONCURRENCY || '2', 10));
  const maxToPool = Math.min(slotsAvailable, stagedLimit > 0 ? stagedLimit : slotsAvailable);
  const toPool = rankedUrls.slice(0, maxToPool);

  if (toPool.length === 0) return;

  logger.info(`${PREFIX} [3] pool load started`, {
    count: toPool.length,
    limit: effectiveMax,
    poolSize: pool.getStats().entries,
    urls: toPool.map(l => l.url.substring(0, 50)),
  });

  /* Add each URL to the preload pool */
  const ownerSession = webContents.session;
  for (const linkInfo of toPool) {
    pool.addUrl(linkInfo.url, ownerSession, linkInfo.position);
    pooledUrls.add(linkInfo.url);

    /* Record in cache manager for compatibility */
    cacheManager.recordPrefetch(linkInfo.url, 0);

    /* Log to SQLite (best effort) */
    try {
      const { logPrefetchEntry } = require('../ipc/prefetch-handlers');
      logPrefetchEntry(linkInfo.url, 0, 'pool-loading');
    } catch { /* best effort */ }

    /* Update session tracker */
    try {
      const sessionTracker = require('../telemetry/session-tracker');
      const tabId = webContents._glimpseTabId;
      if (tabId) {
        sessionTracker.updateLinkPreload(tabId, linkInfo.url, {
          preloadState: 'loading',
          modelScore: linkInfo.score,
          modelRank: linkInfo.rank,
        });
      }
    } catch { /* best effort */ }

    /* Notify the chrome UI */
    notifyChrome('prefetch:completed', { url: linkInfo.url });
  }

  logger.info(`${PREFIX} [4] pool updated`, {
    added: toPool.length,
    totalPooled: pooledUrls.size,
    poolStats: pool.getStats(),
  });
}

/**
 * Find how many ms until the earliest not-yet-eligible link becomes eligible.
 * Returns 0 if there are none waiting.
 */
function findEarliestReadyTime(minVisMs, now) {
  let earliest = Infinity;
  for (const [url, info] of visibleUrls) {
    if (pooledUrls.has(url)) continue;
    const ready = info.firstSeenAt + minVisMs;
    if (ready > now && ready < earliest) {
      earliest = ready;
    }
  }
  return earliest === Infinity ? 0 : earliest - now + 10;
}

/**
 * Called when a result link goes out of view.
 * @param {string} url
 */
function onLinkHidden(url) {
  visibleUrls.delete(url);
}

/**
 * Called when the user clicks a search result link.
 * @param {string} url - The clicked URL
 * @param {boolean} fromCache - Whether it was served from the prefetch cache
 */
function onLinkClicked(url, fromCache) {
  if (fromCache || cacheManager.isPrefetched(url)) {
    cacheManager.recordHit(url);
    logger.info(`${PREFIX} Prefetch cache hit`, { url });
  } else {
    /* Start timing for MISS render measurement */
    missClickTimestamps.set(url, Date.now());
  }

  notifyChrome('prefetch:linkClicked', { url, fromCache });
}

/**
 * Called when a navigated page finishes loading (for MISS render-time tracking).
 * @param {string} url
 */
function onPageLoaded(url) {
  const clickTime = missClickTimestamps.get(url);
  if (clickTime) {
    const renderMs = Date.now() - clickTime;
    pool.recordMiss(renderMs);
    missClickTimestamps.delete(url);
    logger.info(`${PREFIX} miss render complete`, { url, renderMs });
  }
}

/**
 * Called when the user navigates to a new page.
 * Resets all per-page state and destroys ALL pool entries.
 */
function onPageNavigate() {
  visibleUrls.clear();
  pooledUrls.clear();
  missClickTimestamps.clear();
  activeWebContents = null;
  clearTimeout(prefetchTimer);

  /* Destroy all pool entries — search tab is gone */
  pool.clearAll();
}

/**
 * Update the aggressiveness level.
 * @param {string} level - 'conservative' | 'balanced' | 'aggressive'
 */
function setAggressiveness(level) {
  if (PREFETCH_CONFIG[level]) {
    aggressiveness = level;
    logger.info(`${PREFIX} Prefetch aggressiveness changed`, {
      level,
      maxConcurrent: PREFETCH_CONFIG[level].maxConcurrent,
    });
  }
}

/**
 * Set the current engine name for ML predictions.
 * @param {string} engineName
 */
function setCurrentEngine(engineName) {
  currentEngine = engineName;
}

/**
 * Get current scheduler state for debugging/status display.
 * @returns {object}
 */
function getState() {
  return {
    visibleCount: visibleUrls.size,
    pooledCount: pooledUrls.size,
    aggressiveness,
    maxConcurrent: PREFETCH_CONFIG[aggressiveness]?.maxConcurrent,
    currentEngine,
    poolStats: pool.getStats(),
    pooledUrls: [...pooledUrls],
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
  onLinkHover,
  onLinkHidden,
  onLinkClicked,
  onPageLoaded,
  onPageNavigate,
  setAggressiveness,
  setCurrentEngine,
  getState,
};
