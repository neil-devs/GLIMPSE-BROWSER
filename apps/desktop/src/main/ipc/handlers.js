/**
 * @fileoverview Master IPC handler registrar.
 * Imports all sub-handler modules and registers global app-level IPC handlers.
 * Called once from the main process entry point.
 * @module desktop/ipc/handlers
 */

'use strict';

const { ipcMain, app, shell, Menu } = require('electron');
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

  /* ── Native Popup Menu (Chrome ⋮ style) ───────────────────── */

  ipcMain.handle('app:showMenu', (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    const tabManager = deps.tabManager;

    const template = [
      {
        label: 'New Tab',
        accelerator: 'CmdOrCtrl+T',
        click: () => {
          if (tabManager) tabManager.createTab('about:blank');
        },
      },
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'History',
        accelerator: 'CmdOrCtrl+H',
        click: () => {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('menu:action', 'history');
          }
        },
      },
      {
        label: 'Downloads',
        accelerator: 'CmdOrCtrl+J',
        click: () => {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('menu:action', 'downloads');
          }
        },
      },
      {
        label: 'Bookmarks',
        accelerator: 'CmdOrCtrl+D',
        click: () => {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('menu:action', 'bookmarks');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Zoom',
        submenu: [
          {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+Plus',
            click: () => {
              if (event.sender && !event.sender.isDestroyed()) {
                const current = event.sender.getZoomLevel();
                event.sender.setZoomLevel(current + 0.5);
              }
            },
          },
          {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            click: () => {
              if (event.sender && !event.sender.isDestroyed()) {
                const current = event.sender.getZoomLevel();
                event.sender.setZoomLevel(current - 0.5);
              }
            },
          },
          {
            label: 'Reset Zoom',
            accelerator: 'CmdOrCtrl+0',
            click: () => {
              if (event.sender && !event.sender.isDestroyed()) {
                event.sender.setZoomLevel(0);
              }
            },
          },
        ],
      },
      {
        label: 'Full Screen',
        accelerator: 'F11',
        click: () => {
          if (win) win.setFullScreen(!win.isFullScreen());
        },
      },
      { type: 'separator' },
      {
        label: 'Print...',
        accelerator: 'CmdOrCtrl+P',
        enabled: false,
      },
      {
        label: 'Find in Page',
        accelerator: 'CmdOrCtrl+F',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Clear Browsing Data...',
        accelerator: 'CmdOrCtrl+Shift+Delete',
        click: () => {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('menu:action', 'clearData');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('menu:action', 'settings');
          }
        },
      },
      {
        label: 'About Glimpse',
        click: () => {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('menu:action', 'about');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit',
        accelerator: 'Alt+F4',
        click: () => app.quit(),
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win });
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
