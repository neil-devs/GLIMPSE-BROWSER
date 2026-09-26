/**
 * @fileoverview Auto-updater integration using electron-updater.
 * Checks for updates on startup and notifies the renderer process.
 * @module desktop/utils/auto-updater
 */

'use strict';

const { autoUpdater } = require('electron-updater');
const { logger } = require('./logger');

/** Reference to the chrome WebContentsView for sending IPC events */
let chromeWebContents = null;

/**
 * Initialize the auto-updater.
 * Checks for updates after a short delay to avoid blocking startup.
 *
 * @param {Electron.WebContents} [webContents] - The chrome view's webContents for IPC notifications
 */
function initAutoUpdater(webContents) {
  chromeWebContents = webContents || null;

  /* Don't auto-download — let user decide */
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  /* ── Event Handlers ─────────────────────────────────────────── */

  autoUpdater.on('checking-for-update', () => {
    logger.info('Auto-updater: checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('Auto-updater: update available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
    notifyRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
    /* Auto-download the update */
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', () => {
    logger.debug('Auto-updater: no updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    logger.debug('Auto-updater: download progress', {
      percent: progress.percent?.toFixed(1),
      speed: progress.bytesPerSecond,
    });
    notifyRenderer('update:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Auto-updater: update downloaded', { version: info.version });
    notifyRenderer('update:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (error) => {
    logger.error('Auto-updater error', { message: error.message });
  });

  /* Check for updates after 5 second delay (Disabled due to dead update domain) */
  // setTimeout(() => {
  //   checkForUpdates();
  // }, 5000);
}

/**
 * Manually trigger an update check.
 */
async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    logger.error('Auto-updater: failed to check for updates', {
      message: err.message,
    });
  }
}

/**
 * Quit the application and install the downloaded update.
 */
function quitAndInstall() {
  logger.info('Auto-updater: quitting and installing update');
  autoUpdater.quitAndInstall();
}

/**
 * Send an event to the chrome renderer process.
 * @param {string} channel
 * @param {object} data
 */
function notifyRenderer(channel, data) {
  try {
    if (chromeWebContents && !chromeWebContents.isDestroyed()) {
      chromeWebContents.send(channel, data);
    }
  } catch {
    /* WebContents may have been destroyed */
  }
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  quitAndInstall,
};
