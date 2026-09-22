/**
 * @fileoverview Window manager.
 * Manages multiple browser windows (currently single-window,
 * but architected for multi-window support).
 * @module desktop/windows/window-manager
 */

'use strict';

const { createMainWindow } = require('./browser-window');
const { logger } = require('../utils/logger');

/** @type {Map<number, { window: Electron.BaseWindow, chromeView: Electron.WebContentsView }>} */
const windows = new Map();

/** ID of the main (first) window */
let mainWindowId = null;

/**
 * Create a new browser window.
 *
 * @param {object} [options]
 * @param {string} [options.rendererUrl] - Dev server URL or production file path
 * @returns {{ window: Electron.BaseWindow, chromeView: Electron.WebContentsView }}
 */
function createWindow(options = {}) {
  const { window: win, chromeView } = createMainWindow(options);
  const id = win.id;

  windows.set(id, { window: win, chromeView });

  if (mainWindowId === null) {
    mainWindowId = id;
  }

  win.on('closed', () => {
    windows.delete(id);
    if (mainWindowId === id) {
      mainWindowId = windows.size > 0 ? [...windows.keys()][0] : null;
    }
    logger.info('Window removed from manager', { id });
  });

  logger.info('Window created', { id });
  return { window: win, chromeView };
}

/**
 * Get a window by its ID.
 * @param {number} id
 * @returns {{ window: Electron.BaseWindow, chromeView: Electron.WebContentsView }|null}
 */
function getWindow(id) {
  return windows.get(id) || null;
}

/**
 * Get the main window.
 * @returns {Electron.BaseWindow|null}
 */
function getMainWindow() {
  if (mainWindowId === null) return null;
  const entry = windows.get(mainWindowId);
  return entry ? entry.window : null;
}

/**
 * Get the main window's chrome WebContentsView.
 * @returns {Electron.WebContentsView|null}
 */
function getMainChromeView() {
  if (mainWindowId === null) return null;
  const entry = windows.get(mainWindowId);
  return entry ? entry.chromeView : null;
}

/**
 * Get all open windows.
 * @returns {{ id: number, window: Electron.BaseWindow }[]}
 */
function getAllWindows() {
  return [...windows.entries()].map(([id, entry]) => ({
    id,
    window: entry.window,
  }));
}

/**
 * Focus a window by its ID.
 * @param {number} id
 */
function focusWindow(id) {
  const entry = windows.get(id);
  if (entry && !entry.window.isDestroyed()) {
    entry.window.focus();
  }
}

/**
 * Close a window by its ID.
 * @param {number} id
 */
function closeWindow(id) {
  const entry = windows.get(id);
  if (entry && !entry.window.isDestroyed()) {
    entry.window.close();
  }
}

/**
 * Get the count of open windows.
 * @returns {number}
 */
function getWindowCount() {
  return windows.size;
}

module.exports = {
  createWindow,
  getWindow,
  getMainWindow,
  getMainChromeView,
  getAllWindows,
  focusWindow,
  closeWindow,
  getWindowCount,
};
