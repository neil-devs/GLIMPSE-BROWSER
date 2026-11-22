/**
 * @fileoverview Preload pool for instant-open prefetching.
 * Maintains a Map of hidden WebContentsViews keyed by URL, each pre-rendered
 * and ready to be swapped into a visible window when the user clicks a link.
 *
 * Entries are LRU-evicted when the pool reaches its limit (driven by the
 * user's prefetchAggressiveness setting: conservative 3, balanced 6,
 * aggressive 12). A memory guard stops adding entries when the total
 * working-set exceeds ~1.5 GB and evicts the oldest entry.
 *
 * TTL: 120 s. All entries are destroyed when the search tab navigates away
 * or is closed.
 *
 * @module desktop/prefetch/preload-pool
 */

'use strict';

const { WebContentsView, app } = require('electron');
const path = require('node:path');
const { PREFETCH_CONFIG, ENGINE_URLS } = require('@glimpse/shared/constants');
const settings = require('../storage/settings');
const bandwidthGuard = require('./bandwidth-guard');
const { logger } = require('../utils/logger');

const TAB_PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'tab-preload.js');

/* ── Constants ──────────────────────────────────────────────────── */

const PREFIX = '[glimpse:prefetch]';

/** Time-to-live for pool entries (ms) */
const TTL_MS = 120_000;

/** Memory ceiling for all Electron renderer processes (~1.5 GB) */
const MEMORY_CEILING_BYTES = 1.5 * 1024 * 1024 * 1024;

/** File extensions that look like downloads — skip these */
const DOWNLOAD_EXTENSIONS = new Set([
  '.pdf', '.zip', '.exe', '.apk', '.dmg', '.msi',
  '.deb', '.rpm', '.tar', '.gz', '.7z', '.rar',
]);

/** Pool limits — read from shared constants, changeable via Settings */
const POOL_LIMITS = Object.freeze({
  conservative: PREFETCH_CONFIG.conservative.maxConcurrent,  // 3
  balanced:     PREFETCH_CONFIG.balanced.maxConcurrent,       // 6
  aggressive:   PREFETCH_CONFIG.aggressive.maxConcurrent,     // 12
});

/** Chrome height in pixels (tabs + addressbar) */
const CHROME_HEIGHT = 82;

/** Reference to the main window — needed to attach pool views as hidden children */
let mainWindow = null;

/* ── Window reference ───────────────────────────────────────────── */

/**
 * Set the main window reference so pool views can be attached as hidden children.
 * This is CRITICAL: Chromium's compositor does not render content for
 * WebContentsViews that are not part of a window's view hierarchy.
 * @param {Electron.BaseWindow} win
 */
function setMainWindow(win) {
  mainWindow = win;
}

/* ── Pool State ─────────────────────────────────────────────────── */

/**
 * @typedef {Object} PoolEntry
 * @property {Electron.WebContentsView} view
 * @property {Electron.WebContents}     wc
 * @property {'loading'|'ready'|'failed'} state
 * @property {number}  startedAt   - Date.now() when loadURL was called
 * @property {number|null} readyAt - Date.now() when did-finish-load fired
 * @property {number}  position    - link position (lower = higher priority)
 */

/** @type {Map<string, PoolEntry>} */
const pool = new Map();

/** TTL timers keyed by href so we can clear them on removal */
const ttlTimers = new Map();

/* ── Stats ──────────────────────────────────────────────────────── */

let totalHits = 0;
let totalMisses = 0;
let hitSwapMsAccumulator = 0;
let hitSwapCount = 0;
let missRenderMsAccumulator = 0;
let missRenderCount = 0;

/* ── Helpers ────────────────────────────────────────────────────── */

/**
 * Resolve the max concurrent entries from the user's aggressiveness setting.
 * @returns {number}
 */
function getMaxEntries() {
  const envSize = parseInt(process.env.PREFETCH_POOL_SIZE || '', 10);
  if (!isNaN(envSize) && envSize > 0) return envSize;
  const custom = settings.get('poolSize', null);
  if (typeof custom === 'number' && custom > 0) return custom;
  const level = settings.get('prefetchAggressiveness', 'balanced');
  return POOL_LIMITS[level] ?? POOL_LIMITS.balanced;
}

/**
 * Extract the hostname from a URL string (returns '' on failure).
 * @param {string} href
 * @returns {string}
 */
function hostnameOf(href) {
  try {
    return new URL(href).hostname;
  } catch {
    return '';
  }
}

/**
 * Collect the set of search-engine hostnames to exclude from prefetching.
 * @returns {Set<string>}
 */
function buildEngineHosts() {
  const hosts = new Set();
  for (const url of Object.values(ENGINE_URLS)) {
    const h = hostnameOf(url);
    if (h) hosts.add(h);
  }
  return hosts;
}

/** Lazily cached engine hosts */
let engineHosts = null;
function getEngineHosts() {
  if (!engineHosts) engineHosts = buildEngineHosts();
  return engineHosts;
}

/**
 * Returns true when the href should be skipped (not prefetch-worthy).
 * @param {string} href
 * @returns {boolean}
 */
function shouldSkip(href) {
  /* Non-HTTP(S) */
  if (!/^https?:\/\//i.test(href)) {
    return true;
  }

  /* Same domain as a search engine host — but allow redirect URLs (/url, /goto) through */
  const host = hostnameOf(href);
  if (getEngineHosts().has(host)) {
    try {
      const pathname = new URL(href).pathname;
      /* Google /url?q=... and /goto?url=... are result redirects, not search pages */
      if (pathname !== '/url' && pathname !== '/goto') {
        return true;
      }
    } catch {
      return true;
    }
  }

  /* Download-looking extension */
  try {
    const pathname = new URL(href).pathname.toLowerCase();
    for (const ext of DOWNLOAD_EXTENSIONS) {
      if (pathname.endsWith(ext)) return true;
    }
  } catch {
    return true;
  }

  /* Bandwidth guard says no */
  const bw = bandwidthGuard.shouldPrefetch();
  if (!bw.allowed) {
    logger.debug(`${PREFIX} bandwidth guard blocked`, { href, reason: bw.reason });
    return true;
  }

  return false;
}

/**
 * Memory guard — returns true when the sum of all Electron process
 * workingSetSize exceeds the ceiling (~1.5 GB).
 * @returns {boolean}
 */
function isMemoryPressure() {
  try {
    const metrics = app.getAppMetrics();
    let totalBytes = 0;
    for (const m of metrics) {
      totalBytes += (m.memory.workingSetSize || 0) * 1024; // KB → B
    }
    if (totalBytes > MEMORY_CEILING_BYTES) {
      logger.warn(`${PREFIX} memory pressure`, {
        totalMB: Math.round(totalBytes / (1024 * 1024)),
        ceilingMB: Math.round(MEMORY_CEILING_BYTES / (1024 * 1024)),
      });
      return true;
    }
  } catch {
    /* getAppMetrics may throw in edge cases — allow prefetch to continue */
  }
  return false;
}

/**
 * Find the entry with the highest position value (lowest priority) for eviction.
 * @returns {string|null} href to evict, or null if pool is empty
 */
function findEvictionCandidate() {
  let worstHref = null;
  let worstPos = -1;
  for (const [href, entry] of pool) {
    if (entry.position > worstPos) {
      worstPos = entry.position;
      worstHref = href;
    }
  }
  return worstHref;
}

/**
 * Find the oldest entry for memory-pressure eviction.
 * @returns {string|null}
 */
function findOldestEntry() {
  let oldestHref = null;
  let oldestTime = Infinity;
  for (const [href, entry] of pool) {
    if (entry.startedAt < oldestTime) {
      oldestTime = entry.startedAt;
      oldestHref = href;
    }
  }
  return oldestHref;
}

/**
 * Destroy a single pool entry (close webContents, clear timers).
 * @param {string} href
 */
function destroyEntry(href) {
  const entry = pool.get(href);
  if (!entry) return;

  /* Clear TTL timer */
  const timer = ttlTimers.get(href);
  if (timer) {
    clearTimeout(timer);
    ttlTimers.delete(href);
  }

  /* Remove from the window's view tree */
  if (mainWindow) {
    try { mainWindow.contentView.removeChildView(entry.view); } catch { /* ok */ }
  }

  /* Close the web contents */
  try {
    if (!entry.wc.isDestroyed()) {
      entry.wc.close();
    }
  } catch (err) {
    logger.warn(`${PREFIX} error closing webContents`, { href, error: err.message });
  }

  pool.delete(href);
}

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Add a URL to the preload pool.
 *
 * Creates a hidden WebContentsView in the same session as the owner tab,
 * preconnects, and starts loading the page. Entries are position-evicted when
 * the pool reaches its max size, and TTL-expired after 120 s.
 *
 * A memory guard prevents adding when total workingSetSize > ~1.5 GB and
 * evicts the oldest entry to make room.
 *
 * @param {string} href       - Full URL to preload
 * @param {Electron.Session} ownerSession - Session of the owner tab
 * @param {number} [position=0] - Link position on the page (lower = higher priority)
 */
function addUrl(href, ownerSession, position = 0) {
  /* Already in pool */
  if (pool.has(href)) {
    logger.debug(`${PREFIX} already pooled`, { href });
    return;
  }

  /* Skip ineligible URLs */
  if (shouldSkip(href)) {
    logger.debug(`${PREFIX} skipping`, { href });
    return;
  }

  /* ── Memory guard ─────────────────────────────────────────────── */
  if (isMemoryPressure()) {
    /* Try to free one slot by evicting the oldest entry */
    const oldest = findOldestEntry();
    if (oldest) {
      logger.info(`${PREFIX} memory evict`, { victim: oldest });
      destroyEntry(oldest);
    }
    /* Re-check after eviction — still too high? bail out */
    if (isMemoryPressure()) {
      logger.info(`${PREFIX} still over memory ceiling — skipping`, { href });
      return;
    }
  }

  /* Evict lowest-priority entry if at capacity */
  const max = getMaxEntries();
  while (pool.size >= max) {
    const victim = findEvictionCandidate();
    if (!victim) break;
    logger.debug(`${PREFIX} evicting`, { victim });
    destroyEntry(victim);
  }

  /* Preconnect to the destination with 3 sockets for parallel asset fetching */
  try {
    ownerSession.preconnect({ url: href, numSockets: 3 });
  } catch (err) {
    logger.warn(`${PREFIX} preconnect failed`, { href, error: err.message });
  }

  /* Create a hidden WebContentsView */
  const view = new WebContentsView({
    webPreferences: {
      session: ownerSession,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: TAB_PRELOAD_PATH,
    },
  });

  const wc = view.webContents;

  /* Set a clean white background color */
  try { view.setBackgroundColor('#ffffff'); } catch { /* ok */ }

  /* CRITICAL FOR INSTANT SWAP & ZERO BLACK SCREEN:
   * Chromium's compositor requires the view to be part of the window hierarchy
   * AND within the viewport to generate raster tiles and DirectComposition surfaces.
   * We attach it directly at the actual window bounds, inserted behind the active tab
   * (index 1, right above chromeView). It renders and rasters at full GPU speed
   * without being visible to the user until swap. */
  const winBounds = mainWindow ? mainWindow.getContentBounds() : { width: 1280, height: 800 };
  const targetW = winBounds.width || 1280;
  const targetH = Math.max((winBounds.height || 800) - CHROME_HEIGHT, 100);

  view.setBounds({ x: 0, y: CHROME_HEIGHT, width: targetW, height: targetH });

  if (mainWindow) {
    /* Insert at index 1: behind the active tab so it doesn't obscure search results */
    mainWindow.contentView.addChildView(view, 1);
    logger.debug(`${PREFIX} attached pool view to window (pre-rendered)`, { href });
  } else {
    logger.warn(`${PREFIX} no mainWindow — pool view will NOT render`, { href });
  }

  /* Disable background throttling so Chromium fully renders even though
   * the view is off-screen / not focused */
  wc.setBackgroundThrottling(false);

  /* Security hardening */
  wc.setAudioMuted(true);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  /* Cancel any downloads initiated by this pool webContents */
  wc.on('will-download', (_event, item) => {
    item.cancel();
  });

  /* Build entry */
  /** @type {PoolEntry} */
  const entry = {
    view,
    wc,
    state: 'loading',
    startedAt: Date.now(),
    readyAt: null,
    position,
  };

  pool.set(href, entry);

  /* State transitions: support readyMode ('usable' vs 'load') & throttleAfterReady */
  const readyMode = settings.get('readyMode', process.env.PREFETCH_READY_MODE || 'usable');
  const throttleAfterReady = settings.get('throttleAfterReady', process.env.PREFETCH_THROTTLE_AFTER_READY !== 'false');

  const markReady = (trigger) => {
    if (pool.has(href) && pool.get(href) === entry && entry.state !== 'ready') {
      entry.state = 'ready';
      entry.readyAt = Date.now();

      /* Force Chromium to paint the content NOW so compositor frames are ready */
      try { wc.invalidate(); } catch { /* ok */ }

      setTimeout(() => {
        if (!wc.isDestroyed()) {
          try { wc.invalidate(); } catch { /* ok */ }
        }
      }, 100);

      /* Throttle background timers once ready so idle pooled views conserve CPU */
      if (throttleAfterReady) {
        try { wc.setBackgroundThrottling(true); } catch { /* ok */ }
      }

      logger.info(`${PREFIX} [4] pool ready (${trigger})`, {
        href,
        loadMs: entry.readyAt - entry.startedAt,
      });
    }
  };

  if (readyMode === 'usable') {
    wc.once('dom-ready', () => markReady('dom-ready'));
  }
  wc.on('did-finish-load', () => markReady('did-finish-load'));

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;           /* sub-frame failures are irrelevant */
    if (errorCode === -3) return;       /* ERR_ABORTED — navigated away */
    if (pool.has(href) && pool.get(href) === entry) {
      logger.warn(`${PREFIX} failed to load`, {
        href: validatedURL,
        errorCode,
        errorDescription,
      });
      entry.state = 'failed';
      destroyEntry(href);
    }
  });

  /* TTL — auto-expire after 120 s */
  const timer = setTimeout(() => {
    if (pool.has(href)) {
      logger.info(`${PREFIX} TTL expired (120 s)`, { href });
      destroyEntry(href);
    }
  }, TTL_MS);
  ttlTimers.set(href, timer);

  /* Start loading */
  logger.info(`${PREFIX} [3] pool load started`, { href, position, poolSize: pool.size });
  wc.loadURL(href).catch((err) => {
    logger.warn(`${PREFIX} loadURL rejected`, { href, error: err.message });
    if (pool.has(href) && pool.get(href) === entry) {
      entry.state = 'failed';
      destroyEntry(href);
    }
  });
}

/**
 * Get a pool entry by exact URL match.
 * @param {string} href
 * @returns {PoolEntry|null}
 */
function getEntry(href) {
  return pool.get(href) ?? null;
}

/**
 * Resolve a pool entry by exact match first, then via adapter.resolveDestination.
 * @param {string} href
 * @param {object} [adapter] - Search engine adapter with optional resolveDestination(href)
 * @returns {PoolEntry|null}
 */
function resolveEntry(href, adapter) {
  /* Exact match */
  const exact = pool.get(href);
  if (exact) return exact;

  /* Adapter-resolved destination */
  if (adapter && typeof adapter.resolveDestination === 'function') {
    const resolved = adapter.resolveDestination(href);
    if (resolved && pool.has(resolved)) {
      return pool.get(resolved);
    }
  }

  return null;
}

/**
 * Remove and destroy a single URL from the pool.
 * @param {string} href
 */
function removeUrl(href) {
  destroyEntry(href);
}

/**
 * Detach a URL from the pool WITHOUT destroying its view.
 * Used when the view is being swapped into a tab — it's still alive,
 * just no longer managed by the pool.
 * @param {string} href
 */
function detachUrl(href) {
  const entry = pool.get(href);
  if (!entry) return;

  /* Clear TTL timer */
  const timer = ttlTimers.get(href);
  if (timer) {
    clearTimeout(timer);
    ttlTimers.delete(href);
  }

  /* Note: do NOT remove from window or close — tab-manager takes ownership */
  pool.delete(href);
}

/**
 * Close and remove ALL pool entries.
 * Called when the owner search tab navigates away or closes.
 */
function clearAll() {
  logger.info(`${PREFIX} clearing all entries`, { count: pool.size });
  for (const href of [...pool.keys()]) {
    destroyEntry(href);
  }
}

/**
 * Record a successful swap (HIT) with the click-to-visible duration in ms.
 * @param {number} ms - Time from click to view swap
 */
function recordHit(ms) {
  totalHits++;
  hitSwapMsAccumulator += ms;
  hitSwapCount++;
  logger.debug(`${PREFIX} hit recorded`, { ms });
}

/**
 * Record a cache miss, optionally with click-to-render duration.
 * @param {number} [renderMs] - Time from click until page finished loading (miss path)
 */
function recordMiss(renderMs) {
  totalMisses++;
  if (typeof renderMs === 'number' && renderMs > 0) {
    missRenderMsAccumulator += renderMs;
    missRenderCount++;
  }
  logger.debug(`${PREFIX} miss recorded`, { renderMs });
}

/**
 * Get pool statistics including avg click-to-render for HIT vs MISS.
 * @returns {object}
 */
function getStats() {
  let readyCount = 0;
  for (const entry of pool.values()) {
    if (entry.state === 'ready') readyCount++;
  }

  return {
    entries: pool.size,
    ready: readyCount,
    hits: totalHits,
    misses: totalMisses,
    avgHitMs: hitSwapCount > 0 ? Math.round(hitSwapMsAccumulator / hitSwapCount) : 0,
    avgMissMs: missRenderCount > 0 ? Math.round(missRenderMsAccumulator / missRenderCount) : 0,
  };
}

/**
 * Handle window resizing by updating bounds of all pooled views.
 * @param {Electron.Rectangle} bounds
 */
function onWindowResize(bounds) {
  const w = bounds.width || 1280;
  const h = Math.max((bounds.height || 800) - CHROME_HEIGHT, 100);
  for (const entry of pool.values()) {
    try {
      entry.view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: h });
    } catch { /* best effort */ }
  }
}

/* ── Exports ────────────────────────────────────────────────────── */

module.exports = {
  setMainWindow,
  addUrl,
  getEntry,
  resolveEntry,
  removeUrl,
  detachUrl,
  clearAll,
  onWindowResize,
  getStats,
  recordHit,
  recordMiss,
};
