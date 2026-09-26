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
const { randomUUID } = require('node:crypto');
const { logger } = require('../utils/logger');
const tabState = require('./tab-state');
const { getAdapter, isSearchResultsPage } = require('./engine-adapters');
const { buildVisibilityDetectorScript } = require('../prefetch/visibility-detector');
const prefetchScheduler = require('../prefetch/prefetch-scheduler');
const history = require('../storage/history');
const { buildErrorPageHtml } = require('../utils/error-handler');

/** Map of tabId → WebContentsView */
const tabViews = new Map();

/** Reference to the BaseWindow */
let mainWindow = null;

/** Reference to the chrome WebContentsView */
let chromeView = null;

/** Chrome height in pixels (tabs + addressbar) */
const CHROME_HEIGHT = 82;

/** Path to the tab preload script */
const TAB_PRELOAD_PATH = path.join(app.getAppPath(), 'out', 'preload', 'tab-preload.js');

/**
 * Initialize the tab manager with the main window reference.
 * @param {Electron.BaseWindow} win
 * @param {Electron.WebContentsView} chrome
 */
function init(win, chrome) {
  mainWindow = win;
  chromeView = chrome;

  /* Listen for tab-level IPC events from tab preload scripts */
  ipcMain.on('tab:link-visible', (event, data) => {
    prefetchScheduler.onLinkVisible(data.url, data.position, data.domain, event.sender);
  });

  ipcMain.on('tab:link-hidden', (_event, data) => {
    prefetchScheduler.onLinkHidden(data.url);
  });

  ipcMain.on('tab:link-clicked', (_event, data) => {
    prefetchScheduler.onLinkClicked(data.url, data.fromCache);
  });
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

  /* ── Navigation Events ──────────────────────────────────────── */

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

    /* Add to browsing history */
    try {
      const title = wc.getTitle() || navUrl;
      if (navUrl !== 'about:blank' && !navUrl.startsWith('data:')) {
        history.addEntry(navUrl, title, null, 'direct');
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
    const currentUrl = wc.getURL();

    /* Check if this is a search results page */
    const adapter = getAdapter(currentUrl);
    if (adapter) {
      logger.info('Search results page detected', { engine: adapter.name, url: currentUrl });

      /* Set the engine for the prefetch scheduler */
      prefetchScheduler.setCurrentEngine(adapter.name);

      /* Inject visibility detector script */
      const script = buildVisibilityDetectorScript(adapter.resultLinkSelector);
      wc.executeJavaScript(script).catch((err) => {
        logger.error('Failed to inject visibility detector', { message: err.message });
      });
    }
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
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

  /* ── New Window Handling ────────────────────────────────────── */

  wc.setWindowOpenHandler(({ url: openUrl }) => {
    /* Open in a new tab instead of a new window */
    createTab(openUrl);
    return { action: 'deny' };
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
      click: () => wc.goBack()
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
      click: () => wc.executeJavaScript('window.print()')
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
      wc.executeJavaScript('window.print()');
    }
  });

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

    /* Only add and show if this is the first tab or we're making it active */
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
 * @param {string} tabId
 */
function goBack(tabId) {
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
      /* Hide tab view for about:blank so chrome NTP overlay is clickable */
      view.setVisible(!isBlank);
      /* Resize to fit the window */
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
        width: bounds.width,
        height: bounds.height - CHROME_HEIGHT,
      });
    }
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
 * When true, brings the chrome view to the top so modals/dropdowns render over the webpage.
 * When false, brings the active tab back to the top.
 * @param {boolean} active 
 */
function setOverlayActive(active) {
  if (!mainWindow || !chromeView) return;

  if (active) {
    /* Bring chrome view to front */
    mainWindow.contentView.removeChildView(chromeView);
    mainWindow.contentView.addChildView(chromeView);
  } else {
    /* Bring active tab view to front */
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
