/**
 * @fileoverview Master IPC handler registrar.
 * Imports all sub-handler modules and registers global app-level IPC handlers.
 * Called once from the main process entry point.
 * @module desktop/ipc/handlers
 */

'use strict';

const { ipcMain, app, shell } = require('electron');
const { APP } = require('@glimpse/shared/ipc-types');
const { registerTabsHandlers } = require('./tabs-handlers');
const { registerStorageHandlers } = require('./storage-handlers');
const { registerPrefetchHandlers } = require('./prefetch-handlers');
const { registerDownloadsHandlers } = require('./downloads-handlers');

/**
 * Register all IPC handlers.
 * Called once during app initialization after the database is ready.
 *
 * @param {object} [deps={}] - Optional dependency injection for testing
 * @param {object} [deps.tabManager] - Tab manager instance
 * @param {object} [deps.cacheManager] - Cache manager instance
 * @param {object} [deps.windowManager] - Window manager instance
 */
function registerAllHandlers(deps = {}) {
  /* ── Global App Handlers ──────────────────────────────────── */

  ipcMain.handle(APP.GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(APP.GET_PLATFORM, () => {
    return process.platform;
  });

  ipcMain.handle(APP.OPEN_EXTERNAL, async (_event, url) => {
    /* Validate URL before opening — only allow http/https */
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(APP.IS_MAXIMIZED, (event) => {
    const win = event.sender.getOwnerBrowserWindow?.() ||
      require('electron').BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });

  ipcMain.handle(APP.MINIMIZE, (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.handle(APP.MAXIMIZE, (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle(APP.CLOSE, (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  ipcMain.handle(APP.TOGGLE_FULLSCREEN, (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  /* ── Sub-handler Registrars ───────────────────────────────── */

  registerTabsHandlers(deps.tabManager);
  registerStorageHandlers();
  registerPrefetchHandlers(deps.cacheManager);
  registerDownloadsHandlers(deps.windowManager);
}

/**
 * Remove all registered IPC handlers (for cleanup/testing).
 */
function removeAllHandlers() {
  const allChannels = [
    APP.GET_VERSION,
    APP.GET_PLATFORM,
    APP.OPEN_EXTERNAL,
    APP.IS_MAXIMIZED,
    APP.MINIMIZE,
    APP.MAXIMIZE,
    APP.CLOSE,
    APP.TOGGLE_FULLSCREEN,
  ];

  for (const channel of allChannels) {
    ipcMain.removeHandler(channel);
  }
}

module.exports = {
  registerAllHandlers,
  removeAllHandlers,
};
