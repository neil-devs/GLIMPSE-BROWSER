/**
 * @fileoverview Browser window creation and configuration.
 * Creates the main BaseWindow with a chrome WebContentsView for the React UI
 * and manages the window layout.
 *
 * Uses BaseWindow (NOT deprecated BrowserWindow) with WebContentsView.
 *
 * @module desktop/windows/browser-window
 */

'use strict';
const { BaseWindow, WebContentsView, app } = require('electron');

const path = require('node:path');
const { logger } = require('../utils/logger');

/** Chrome height: tabs (40) + addressbar (42) = 82px */
const CHROME_HEIGHT = 82;

/**
 * Create the main browser window with a chrome WebContentsView.
 *
 * @param {object} [options]
 * @param {string} [options.rendererUrl] - URL to load in the chrome view (dev server or file://)
 * @returns {{ window: Electron.BaseWindow, chromeView: Electron.WebContentsView }}
 */
function createMainWindow(options = {}) {
  const win = new BaseWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1b1e2b',
      symbolColor: '#ffffff',
      height: 40
    },
    backgroundColor: '#1b1e2b',
    show: true,
  });

  /* ── Chrome WebContentsView ─────────────────────────────────── */

  const chromeView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(app.getAppPath(), 'out', 'preload', 'index.js'),
    },
  });

  win.contentView.addChildView(chromeView);

  /* Position the chrome view at the top of the window */
  const bounds = win.getContentBounds();
  chromeView.setBounds({
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
  });

  /* ── Load the renderer ──────────────────────────────────────── */

  if (options.rendererUrl) {
    chromeView.webContents.loadURL(options.rendererUrl);
  } else {
    /* Production: load from built files */
    const indexPath = path.join(__dirname, '..', '..', '..', 'out', 'renderer', 'index.html');
    chromeView.webContents.loadFile(indexPath);
  }

  /* Open DevTools in development for debugging */
  if (!require('electron').app.isPackaged) {
    chromeView.webContents.openDevTools({ mode: 'detach' });
  }

  /* ── Window Events ──────────────────────────────────────────── */

  win.on('resize', () => {
    const newBounds = win.getContentBounds();
    chromeView.setBounds({
      x: 0,
      y: 0,
      width: newBounds.width,
      height: newBounds.height,
    });
  });

  chromeView.webContents.once('did-finish-load', () => {
    logger.info('Main window shown');
  });

  win.on('closed', () => {
    logger.info('Main window closed');
  });

  return { window: win, chromeView };
}

module.exports = { createMainWindow, CHROME_HEIGHT };
