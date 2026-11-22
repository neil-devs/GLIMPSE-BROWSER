/**
 * @fileoverview Tab lifecycle manager using WebContentsView.
 * Creates, destroys, and orchestrates tab WebContentsViews within the main window.
 * Wires up all navigation events, injects the prefetch engine on search result pages,
 * and keeps tab state in sync with the renderer.
 *
 * @module desktop/tabs/tab-manager
 */

'use strict';

const { WebContentsView, ipcMain, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { logger } = require('../utils/logger');
const tabState = require('./tab-state');
const { getAdapter, isSearchResultsPage } = require('./engine-adapters');
const { buildVisibilityDetectorScript } = require('../prefetch/visibility-detector');
const prefetchScheduler = require('../prefetch/prefetch-scheduler');
const pool = require('../prefetch/preload-pool');
const history = require('../storage/history');
const { buildErrorPageHtml } = require('../utils/error-handler');
const sessionTracker = require('../telemetry/session-tracker');

const PREFIX = '[glimpse:prefetch]';

/**
 * Find tab ID from webContents instance.
 * @param {Electron.WebContents} wc
 * @returns {string|null}
 */
function getTabIdByWebContents(wc) {
  if (!wc) return null;
  if (wc._glimpseTabId) return wc._glimpseTabId;
  for (const [id, view] of tabViews) {
    if (view && view.webContents === wc) return id;
  }
  return tabState.getActiveId() || null;
}

/** Lazy-load telemetry client to avoid circular deps */
let _telemetry = null;
function getTelemetry() {
  if (!_telemetry) {
    try { _telemetry = require('../sync/sync-client'); } catch { _telemetry = null; }
  }
  return _telemetry;
}

/** Map of tabId → WebContentsView */
const tabViews = new Map();

/** Map of tabId → { viewStack: WebContentsView[], currentPoolHref: string|null, adapter: object|null } */
const tabSwapState = new Map();

/** Reference to the BaseWindow */
let mainWindow = null;

/** Reference to the chrome WebContentsView */
let chromeView = null;

/** Chrome height in pixels (tabs + addressbar) */
const CHROME_HEIGHT = 82;

/** Path to the tab preload script */
const TAB_PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'tab-preload.js');

/**
 * Initialize the tab manager with the main window reference.
 * @param {Electron.BaseWindow} win
 * @param {Electron.WebContentsView} chrome
 */
function init(win, chrome) {
  mainWindow = win;
  chromeView = chrome;

  /* ── Give the pool a reference to the window so pool views are attached ── */
  pool.setMainWindow(win);

  /* Listen for prefetch IPC events from tab preload bridge (__glimpseIPC) */
  ipcMain.on('prefetch:link-visible', (event, data) => {
    logger.info(`${PREFIX} [2] link-visible`, { url: (data.url || '').substring(0, 60), position: data.position });
    prefetchScheduler.onLinkVisible(data.url, data.position, data.domain, event.sender);

    const tabId = getTabIdByWebContents(event.sender);
    if (tabId) {
      sessionTracker.recordLinkSeen(tabId, {
        url: data.url,
        position: data.position,
        domain: data.domain,
        linkTextLength: data.linkTextLength || 0,
        firstVisibleMs: data.firstVisibleMs || 0,
        visibleOnLoad: data.visibleOnLoad || false,
      });
    }
  });

  ipcMain.on('prefetch:link-hidden', (_event, data) => {
    prefetchScheduler.onLinkHidden(data.url);
  });

  ipcMain.on('prefetch:link-hover', (event, data) => {
    logger.debug(`${PREFIX} link-hover boost`, { url: (data.url || '').substring(0, 60), position: data.position });
    prefetchScheduler.onLinkHover(data.url, data.position, data.domain, event.sender);
  });

  ipcMain.on('prefetch:viewport-info', (_event, data) => {
    logger.info('Viewport info', {
      screen: `${data.screenWidth}x${data.screenHeight}`,
      window: `${data.windowWidth}x${data.windowHeight}`,
      dpr: data.devicePixelRatio,
    });
  });

  ipcMain.on('prefetch:link-clicked', (event, data) => {
    logger.info(`${PREFIX} [5] click event from renderer`, { url: (data.url || '').substring(0, 60), fromCache: data.fromCache });
    prefetchScheduler.onLinkClicked(data.url, data.fromCache);

    const tabId = getTabIdByWebContents(event.sender);
    if (tabId) {
      sessionTracker.recordLinkClick(tabId, data.url, {
        clickClass: data.fromCache ? 'HIT_READY' : 'MISS_NOT_POOLED',
      });
    }
  });

  /* ── prefetch:getStats IPC handler (Step 6) ───────────────── */
  ipcMain.handle('prefetch:getStats', () => {
    return pool.getStats();
  });
}

/**
 * Inject the visibility detector into a webContents if it's on a search results page.
 * Made into a standalone function so it can be called from both did-finish-load
 * and did-navigate-in-page (search engines update results via pushState).
 * @param {Electron.WebContents} wc
 * @param {string} tabId
 */
function injectDetectorIfSearch(wc, tabId) {
  const currentUrl = wc.getURL();
  const adapter = getAdapter(currentUrl);
  if (!adapter) return;

  logger.info(`${PREFIX} [1] detector injecting`, { engine: adapter.name, url: currentUrl });

  /* Store adapter on the swap state for this tab */
  const ss = tabSwapState.get(tabId);
  if (ss) ss.adapter = adapter;

  /* Set the engine for the prefetch scheduler */
  prefetchScheduler.setCurrentEngine(adapter.name);

  /* Inject visibility detector script */
  const script = buildVisibilityDetectorScript(adapter.resultLinkSelector);
  wc.executeJavaScript(script).then(() => {
    /* Count links found */
    wc.executeJavaScript(`document.querySelectorAll(${JSON.stringify(adapter.resultLinkSelector)}).length`)
      .then((count) => {
        logger.info(`${PREFIX} [1] detector injected`, { engine: adapter.name, selector: adapter.resultLinkSelector.substring(0, 40), linkCount: count });
      })
      .catch(() => {});
  }).catch((err) => {
    logger.error(`${PREFIX} Failed to inject visibility detector`, { message: err.message });
  });

  /* Inject viewport info reporter */
  const viewportScript = `
    (function() {
      if (typeof window.__glimpseIPC !== 'function') return;
      window.__glimpseIPC('viewport-info', {
        screenWidth: screen.width,
        screenHeight: screen.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      window.addEventListener('resize', function() {
        window.__glimpseIPC('viewport-info', {
          screenWidth: screen.width,
          screenHeight: screen.height,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        });
      });
    })();
  `;
  wc.executeJavaScript(viewportScript).catch(() => { /* best effort */ });

  /* Start search session on sessionTracker */
  try {
    const parsed = new URL(currentUrl);
    const queryText = parsed.searchParams.get('q')
      || parsed.searchParams.get('p')
      || parsed.searchParams.get('text')
      || parsed.searchParams.get('wd')
      || '';
    const bounds = mainWindow ? mainWindow.getContentBounds() : { width: 1280, height: 800 };
    sessionTracker.startSession(tabId, {
      engine: adapter.name,
      queryText,
      windowWidth: bounds.width,
      windowHeight: bounds.height,
      modelVersion: 'v2.0.0',
      appVersion: app.getVersion() || '1.0.0',
    });
  } catch { /* best effort */ }
}

/**
 * Try to do an instant swap from the pool for a navigation URL.
 * @param {string} tabId
 * @param {string} href - The URL being navigated to
 * @returns {boolean} true if swap happened (caller should preventDefault)
 */
function tryInstantSwap(tabId, href) {
  const ss = tabSwapState.get(tabId);
  if (!ss) return false;

  const adapter = ss.adapter;
  const entry = pool.resolveEntry(href, adapter);

  if (!entry) {
    logger.info(`${PREFIX} [5] click: MISS`, { url: href.substring(0, 60), reason: 'not-in-pool' });
    pool.recordMiss();
    return false;
  }

  /* Allow both 'ready' and 'loading' entries — a half-loaded page
   * is still faster than starting navigation from scratch */
  if (entry.state === 'failed') {
    logger.info(`${PREFIX} [5] click: MISS`, { url: href.substring(0, 60), reason: 'failed' });
    pool.recordMiss();
    return false;
  }

  /* ── HIT: swap the pool view into the tab area ────────────── */
  const swapStart = Date.now();
  const currentView = tabViews.get(tabId);
  if (!currentView || !mainWindow) return false;

  logger.info(`${PREFIX} [5] click: HIT`, { url: href.substring(0, 60) });

  /* Push the current view onto the view stack for Back navigation */
  ss.viewStack.push({ view: currentView, url: currentView.webContents.getURL() });

  /* Remove current view from window */
  try { mainWindow.contentView.removeChildView(currentView); } catch { /* ok */ }
  currentView.setVisible(false);

  /* Get the pool view and set it up */
  const poolView = entry.view;
  const poolWc = entry.wc;

  /* ── STEP 1: Bring the pool view to the top of the z-order ──────
   * Calling addChildView on an existing child reorders it to topmost
   * WITHOUT removing/tearing down the DirectComposition surface. */
  mainWindow.contentView.addChildView(poolView);

  /* ── STEP 2: Set bounds + make visible ───────────────────────── */
  const bounds = mainWindow.getContentBounds();
  poolView.setBounds({
    x: 0,
    y: CHROME_HEIGHT,
    width: bounds.width || 1280,
    height: Math.max((bounds.height || 800) - CHROME_HEIGHT, 100),
  });
  poolView.setVisible(true);

  /* Set a white background color on the view so even if the compositor hasn't
   * painted yet the user sees white instead of black */
  try { poolView.setBackgroundColor('#ffffff'); } catch { /* ok */ }

  /* ── STEP 3: Focus + unmute + ensure no background throttling ── */
  poolWc.setBackgroundThrottling(false);
  poolWc.setAudioMuted(false);
  poolWc.focus();

  /* ── STEP 4: Force repaint AFTER positioning and z-order are final.
   * Do NOT set background throttling to true — this is now the active foreground tab! */
  poolWc.invalidate();

  /* Follow-up invalidate to catch slow-hydrating SPAs / late CSS */
  setTimeout(() => {
    if (!poolWc.isDestroyed()) {
      poolWc.invalidate();
    }
  }, 100);

  /* Update tab state */
  tabViews.set(tabId, poolView);
  ss.currentPoolHref = href;
  tabState.setActive(tabId);

  const resolvedUrl = poolWc.getURL();
  tabState.update(tabId, {
    url: resolvedUrl,
    title: poolWc.getTitle() || resolvedUrl,
    isLoading: entry.state !== 'ready',
    canGoBack: true,
    canGoForward: false,
    isSecure: resolvedUrl.startsWith('https://'),
  });

  /* If the pool view was still loading when swapped, listen for load
   * completion so we can force a repaint and update the loading state */
  if (entry.state === 'loading') {
    const onceLoad = () => {
      if (!poolWc.isDestroyed()) {
        poolWc.invalidate();
        tabState.update(tabId, { isLoading: false });
      }
    };
    poolWc.once('did-finish-load', onceLoad);
  }

  /* Attach standard tab event listeners to the swapped-in view */
  attachTabListeners(tabId, poolView, poolWc);

  /* Detach from pool (don't destroy — we're using it now) */
  pool.detachUrl(href);
  poolWc._glimpseTabId = tabId;

  const swapMs = Date.now() - swapStart;
  pool.recordHit(swapMs);
  logger.info(`${PREFIX} [6] swap done`, { ms: swapMs, url: resolvedUrl.substring(0, 60) });

  /* Record click on sessionTracker */
  sessionTracker.recordLinkClick(tabId, href, {
    clickClass: entry.state === 'ready' ? 'HIT_READY' : 'HIT_LOADING',
    msToUsable: swapMs,
  });

  /* Add to history */
  try {
    if (resolvedUrl !== 'about:blank' && !resolvedUrl.startsWith('data:')) {
      history.addEntry(resolvedUrl, poolWc.getTitle() || resolvedUrl, null, 'prefetch-swap');
      const tel = getTelemetry();
      if (tel) tel.logHistoryVisit({ url: resolvedUrl, title: poolWc.getTitle(), source: 'prefetch-swap' });
    }
  } catch { /* best effort */ }

  return true;
}

/**
 * Attach standard navigation/media/keyboard event listeners to a tab view.
 * Used for both newly created tabs and swapped-in pool views.
 * @param {string} tabId
 * @param {Electron.WebContentsView} view
 * @param {Electron.WebContents} wc
 */
function attachTabListeners(tabId, view, wc) {
  /* Guard against double-attaching — pool views get this called on swap,
   * but may still have listeners from a previous attachTabListeners call */
  if (wc._glimpseTabListenersAttached) return;
  wc._glimpseTabListenersAttached = true;

  wc.on('did-start-loading', () => {
    tabState.update(tabId, { isLoading: true });
  });

  wc.on('did-stop-loading', () => {
    tabState.update(tabId, { isLoading: false });
  });

  wc.on('did-navigate', (_event, navUrl) => {
    tabState.update(tabId, {
      url: navUrl,
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isSecure: navUrl.startsWith('https://'),
    });

    /* Reset prefetch state on navigation */
    prefetchScheduler.onPageNavigate();
    sessionTracker.onTabNavigated(tabId);

    /* Add to browsing history */
    try {
      const title = wc.getTitle() || navUrl;
      if (navUrl !== 'about:blank' && !navUrl.startsWith('data:')) {
        history.addEntry(navUrl, title, null, 'direct');
        const tel = getTelemetry();
        if (tel) {
          tel.logHistoryVisit({ url: navUrl, title, source: 'direct' });
        }
      }
    } catch {
      /* Best effort */
    }
  });

  wc.on('did-navigate-in-page', (_event, navUrl) => {
    tabState.update(tabId, {
      url: navUrl,
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    });

    /* Re-inject detector on in-page navigation (search engines use pushState) */
    injectDetectorIfSearch(wc, tabId);
  });

  wc.on('page-title-updated', (_event, title) => {
    tabState.update(tabId, { title });
  });

  wc.on('page-favicon-updated', (_event, favicons) => {
    if (favicons && favicons.length > 0) {
      tabState.update(tabId, { favicon: favicons[0] });
    }
  });

  wc.on('did-finish-load', () => {
    injectDetectorIfSearch(wc, tabId);
    /* Track miss render-time for pages that weren't a pool HIT */
    try { prefetchScheduler.onPageLoaded(wc.getURL()); } catch { /* best effort */ }
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; /* Ignore sub-frame / ad / tracker failures */
    if (errorCode === -3) return; /* ERR_ABORTED — user navigated away */

    const errorCodeStr = errorDescription || `ERR_${Math.abs(errorCode)}`;
    const html = buildErrorPageHtml(errorCodeStr, errorDescription, validatedURL);

    wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  /* ── Media Events ───────────────────────────────────────────── */

  wc.on('media-started-playing', () => {
    tabState.update(tabId, { isAudioPlaying: true });
  });

  wc.on('media-paused', () => {
    tabState.update(tabId, { isAudioPlaying: false });
  });

  /* ── New Window / Navigation Interception ──────────────────── */

  wc.setWindowOpenHandler(({ url: openUrl }) => {
    /* Try instant swap for pool hit */
    if (tryInstantSwap(tabId, openUrl)) {
      return { action: 'deny' };
    }
    /* Open in a new tab instead of a new window */
    createTab(openUrl);
    return { action: 'deny' };
  });

  /* Intercept will-navigate for instant swap on search result clicks */
  wc.on('will-navigate', (event, navUrl) => {
    /* Only intercept if we're on a search results page */
    const ss = tabSwapState.get(tabId);
    if (ss && ss.adapter) {
      const currentUrl = wc.getURL();
      /* Don't intercept navigation FROM a non-search page */
      if (isSearchResultsPage(currentUrl)) {
        if (tryInstantSwap(tabId, navUrl)) {
          event.preventDefault();
        }
      }
    }
  });

  /* ── Context Menu (Chrome-style) ─────────────────────────────── */

  const { Menu, MenuItem, shell, clipboard } = require('electron');

  wc.on('context-menu', (event, params) => {
    const menu = new Menu();

    // Navigation
    menu.append(new MenuItem({
      label: 'Back',
      accelerator: 'Alt+Left',
      enabled: wc.navigationHistory.canGoBack(),
      click: () => goBack(tabId)
    }));

    menu.append(new MenuItem({
      label: 'Forward',
      accelerator: 'Alt+Right',
      enabled: wc.navigationHistory.canGoForward(),
      click: () => wc.goForward()
    }));

    menu.append(new MenuItem({
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: () => wc.reload()
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Selection/clipboard options
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        click: () => wc.copy()
      }));

      menu.append(new MenuItem({
        label: `Search Google for "${params.selectionText.substring(0, 30)}${params.selectionText.length > 30 ? '...' : ''}"`,
        click: () => {
          const query = encodeURIComponent(params.selectionText);
          wc.loadURL(`https://www.google.com/search?q=${query}`);
        }
      }));

      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.editFlags.canPaste) {
      menu.append(new MenuItem({
        label: 'Paste',
        accelerator: 'CmdOrCtrl+V',
        click: () => wc.paste()
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Link options
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Open link in new tab',
        click: () => {
          createTab(params.linkURL);
        }
      }));

      menu.append(new MenuItem({
        label: 'Copy link address',
        click: () => clipboard.writeText(params.linkURL)
      }));

      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Image options
    if (params.mediaType === 'image') {
      menu.append(new MenuItem({
        label: 'Save image as...',
        click: () => wc.downloadURL(params.srcURL)
      }));

      menu.append(new MenuItem({
        label: 'Copy image address',
        click: () => clipboard.writeText(params.srcURL)
      }));

      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Save and print
    menu.append(new MenuItem({
      label: 'Save as...',
      accelerator: 'CmdOrCtrl+S',
      click: () => wc.downloadURL(wc.getURL())
    }));

    menu.append(new MenuItem({
      label: 'Print...',
      accelerator: 'CmdOrCtrl+P',
      click: () => openPrintPreview(wc)
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Page source and DevTools
    menu.append(new MenuItem({
      label: 'View page source',
      accelerator: 'CmdOrCtrl+U',
      click: () => {
        const currentUrl = wc.getURL();
        wc.loadURL(`view-source:${currentUrl}`);
      }
    }));

    menu.append(new MenuItem({
      label: 'Inspect',
      accelerator: 'F12',
      click: () => {
        if (wc.isDevToolsOpened()) {
          wc.closeDevTools();
        } else {
          wc.openDevTools({ mode: 'detach' });
        }
      }
    }));

    menu.popup();
  });

  /* ── Keyboard Shortcuts ─────────────────────────────────────── */

  wc.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
      } else {
        wc.openDevTools({ mode: 'detach' });
      }
    }
    if (input.key === 'r' && input.control && input.type === 'keyDown') {
      wc.reload();
    }
    if (input.key === 'p' && input.control && input.type === 'keyDown') {
      event.preventDefault();
      openPrintPreview(wc);
    }
  });
}

/**
 * Open a print preview as an inline overlay inside the main window.
 * @param {Electron.WebContents} webContents
 */
let printPreviewView = null;

function openPrintPreview(webContents) {
  if (printPreviewView) return;

  webContents.printToPDF({ printBackground: true }).then((pdfData) => {
    const tmpPath = path.join(app.getPath('temp'), `glimpse-print-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, pdfData);

    printPreviewView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (mainWindow) {
      let { width, height } = mainWindow.getContentBounds();
      if (width === 0 || height === 0) { width = 1280; height = 800; }
      printPreviewView.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: height - CHROME_HEIGHT });
      mainWindow.contentView.addChildView(printPreviewView);
    }

    printPreviewView.webContents.loadURL(`file://${tmpPath.replace(/\\/g, '/')}`);

    printPreviewView.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') {
        closePrintPreview(tmpPath);
      }
    });

    const onResize = () => {
      if (!printPreviewView || !mainWindow) return;
      let { width, height } = mainWindow.getContentBounds();
      if (width === 0 || height === 0) { width = 1280; height = 800; }
      printPreviewView.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: height - CHROME_HEIGHT });
    };
    mainWindow.on('resize', onResize);

    printPreviewView._onResize = onResize;
    printPreviewView._tmpPath = tmpPath;

  }).catch((err) => {
    logger.error('Print preview failed', { message: err.message });
  });
}

function closePrintPreview(tmpPath) {
  if (!printPreviewView) return;

  if (mainWindow) {
    try {
      mainWindow.contentView.removeChildView(printPreviewView);
      if (printPreviewView._onResize) {
        mainWindow.removeListener('resize', printPreviewView._onResize);
      }
    } catch {}
  }

  try { printPreviewView.webContents.close(); } catch {}
  printPreviewView = null;

  const fileToDelete = tmpPath || '';
  if (fileToDelete) {
    try { fs.unlinkSync(fileToDelete); } catch {}
  }
}

/**
 * Create a new tab and load a URL.
 *
 * @param {string} [url='about:blank'] - Initial URL to load
 * @returns {string} The new tab's ID
 */
function createTab(url = 'about:blank') {
  const tabId = randomUUID();

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: TAB_PRELOAD_PATH,
    },
  });

  tabViews.set(tabId, view);

  /* Initialize swap state for this tab */
  tabSwapState.set(tabId, { viewStack: [], currentPoolHref: null, adapter: null });

  /* Initial tab state */
  tabState.add({
    id: tabId,
    url: url,
    title: 'New Tab',
    favicon: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isAudioPlaying: false,
    isMuted: false,
    isPinned: false,
    isSecure: url.startsWith('https://'),
    createdAt: Date.now(),
  });

  const wc = view.webContents;
  wc._glimpseTabId = tabId;

  /* Attach all event listeners */
  attachTabListeners(tabId, view, wc);

  /* ── Position the view ──────────────────────────────────────── */

  if (mainWindow) {
    let { width, height } = mainWindow.getContentBounds();
    if (width === 0 || height === 0) {
      width = 1280;
      height = 800;
    }
    view.setBounds({
      x: 0,
      y: CHROME_HEIGHT,
      width: width,
      height: height - CHROME_HEIGHT,
    });

    mainWindow.contentView.addChildView(view);
  }

  /* Load the URL */
  if (url && url !== 'about:blank') {
    wc.loadURL(url);
  }

  /* Set as active tab */
  setActiveTab(tabId);

  /* Hide the tab view for about:blank so the chrome NTP overlay is clickable */
  if (!url || url === 'about:blank') {
    view.setVisible(false);
  }

  logger.info('Tab created', { tabId, url });
  return tabId;
}

/**
 * Close a tab and destroy its WebContentsView.
 * @param {string} tabId
 */
function closeTab(tabId) {
  const view = tabViews.get(tabId);
  if (!view) return;

  /* Clean up pool entries and swap state — destroy all pool entries */
  pool.clearAll();
  prefetchScheduler.onPageNavigate();
  sessionTracker.onTabClosed(tabId);
  const ss = tabSwapState.get(tabId);
  if (ss) {
    /* Close all stacked views */
    for (const item of ss.viewStack) {
      try {
        if (!item.view.webContents.isDestroyed()) {
          item.view.webContents.close();
        }
      } catch { /* ok */ }
    }
    tabSwapState.delete(tabId);
  }

  /* Remove from window */
  if (mainWindow) {
    try {
      mainWindow.contentView.removeChildView(view);
    } catch {
      /* View may already be removed */
    }
  }

  /* Destroy the webContents */
  try {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  } catch {
    /* Already destroyed */
  }

  tabViews.delete(tabId);
  tabState.remove(tabId);

  /* If no tabs left, close the browser window */
  if (tabViews.size === 0 && mainWindow) {
    mainWindow.close();
    return;
  }

  logger.info('Tab closed', { tabId });
}

/**
 * Navigate a tab to a new URL.
 * @param {string} tabId
 * @param {string} url
 */
function navigate(tabId, url) {
  const view = tabViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) return;

  /* Show the tab view when navigating to a real URL (was hidden for about:blank NTP) */
  if (url && url !== 'about:blank') {
    view.setVisible(true);
  }

  view.webContents.loadURL(url);
}

/**
 * Go back in the tab's navigation history.
 * Checks the view stack first (for swapped pool views), then webContents history.
 * @param {string} tabId
 */
function goBack(tabId) {
  const ss = tabSwapState.get(tabId);

  /* If we have swapped views on the stack, pop back to the previous one */
  if (ss && ss.viewStack.length > 0) {
    const currentView = tabViews.get(tabId);
    const prev = ss.viewStack.pop();

    if (currentView && mainWindow) {
      try { mainWindow.contentView.removeChildView(currentView); } catch { /* ok */ }
      currentView.setVisible(false);
      /* Destroy the swapped-in view since we're going back */
      try {
        if (!currentView.webContents.isDestroyed()) {
          currentView.webContents.close();
        }
      } catch { /* ok */ }
    }

    /* Restore previous view */
    tabViews.set(tabId, prev.view);
    if (mainWindow) {
      const bounds = mainWindow.getContentBounds();
      prev.view.setBounds({
        x: 0,
        y: CHROME_HEIGHT,
        width: bounds.width,
        height: bounds.height - CHROME_HEIGHT,
      });
      mainWindow.contentView.addChildView(prev.view);
      prev.view.setVisible(true);
      prev.view.webContents.focus();
    }

    tabState.update(tabId, {
      url: prev.url,
      title: prev.view.webContents.getTitle() || prev.url,
      canGoBack: prev.view.webContents.canGoBack() || ss.viewStack.length > 0,
      canGoForward: true,
      isSecure: prev.url.startsWith('https://'),
    });

    ss.currentPoolHref = null;
    logger.info(`${PREFIX} goBack: popped view stack`, { url: prev.url });
    return;
  }

  /* Normal webContents back */
  const view = tabViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) return;
  if (view.webContents.canGoBack()) {
    view.webContents.goBack();
  }
}

/**
 * Go forward in the tab's navigation history.
 * @param {string} tabId
 */
function goForward(tabId) {
  const view = tabViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) return;
  if (view.webContents.canGoForward()) {
    view.webContents.goForward();
  }
}

/**
 * Reload the current page in a tab.
 * @param {string} tabId
 */
function reload(tabId) {
  const view = tabViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) return;
  view.webContents.reload();
}

/**
 * Set a tab as the active (visible) tab.
 * @param {string} tabId
 */
function setActiveTab(tabId) {
  const targetView = tabViews.get(tabId);
  if (!targetView) return;

  const targetState = tabState.get(tabId);
  const isBlank = !targetState?.url || targetState.url === 'about:blank';

  /* Hide all other tab views, show the target */
  for (const [id, view] of tabViews) {
    if (id === tabId) {
      view.setVisible(!isBlank);
      if (mainWindow) {
        const bounds = mainWindow.getContentBounds();
        view.setBounds({
          x: 0,
          y: CHROME_HEIGHT,
          width: bounds.width,
          height: bounds.height - CHROME_HEIGHT,
        });
      }
    } else {
      view.setVisible(false);
    }
  }

  tabState.setActive(tabId);
}

/**
 * Duplicate a tab by creating a new tab with the same URL.
 * @param {string} tabId
 * @returns {string|null} The new tab's ID
 */
function duplicateTab(tabId) {
  const state = tabState.get(tabId);
  if (!state) return null;
  return createTab(state.url);
}

/**
 * Mute or unmute a tab's audio.
 * @param {string} tabId
 * @param {boolean} muted
 */
function muteTab(tabId, muted) {
  const view = tabViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) return;
  view.webContents.setAudioMuted(muted);
  tabState.update(tabId, { isMuted: muted });
}

/**
 * Pin or unpin a tab.
 * @param {string} tabId
 */
function pinTab(tabId) {
  const state = tabState.get(tabId);
  if (!state) return;
  tabState.update(tabId, { isPinned: !state.isPinned });
}

/**
 * Get serializable state for all tabs.
 * @returns {{ tabs: object[], activeTabId: string|null }}
 */
function getAllTabState() {
  return tabState.getAll();
}

/**
 * Resize all tab views when the window is resized.
 */
function onWindowResize() {
  if (!mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  const activeId = tabState.getActiveId();

  for (const [id, view] of tabViews) {
    if (id === activeId) {
      view.setBounds({
        x: 0,
        y: CHROME_HEIGHT,
        width: bounds.width || 1280,
        height: Math.max((bounds.height || 800) - CHROME_HEIGHT, 100),
      });
    }
  }

  /* Keep all pooled views in sync with the window size */
  if (pool && typeof pool.onWindowResize === 'function') {
    pool.onWindowResize(bounds);
  }
}

/**
 * Get the WebContentsView for a specific tab.
 * @param {string} tabId
 * @returns {Electron.WebContentsView|null}
 */
function getTabView(tabId) {
  return tabViews.get(tabId) || null;
}

/**
 * Set the overlay active state.
 * @param {boolean} active 
 */
function setOverlayActive(active) {
  if (!mainWindow || !chromeView) return;

  if (active) {
    mainWindow.contentView.removeChildView(chromeView);
    mainWindow.contentView.addChildView(chromeView);
  } else {
    const activeTabId = tabState.getActiveId();
    if (activeTabId) {
      const view = tabViews.get(activeTabId);
      if (view) {
        mainWindow.contentView.removeChildView(view);
        mainWindow.contentView.addChildView(view);
      }
    }
  }
}

module.exports = {
  init,
  createTab,
  closeTab,
  navigate,
  goBack,
  goForward,
  reload,
  setActiveTab,
  duplicateTab,
  muteTab,
  pinTab,
  getAllTabState,
  onWindowResize,
  getTabView,
  setOverlayActive,
};
