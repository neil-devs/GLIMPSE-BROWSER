/**
 * @fileoverview Downloads IPC handlers.
 * Handles download lifecycle: start, pause, resume, cancel, reveal in folder.
 * @module desktop/ipc/downloads-handlers
 */

'use strict';

const { ipcMain, BrowserWindow, shell, dialog } = require('electron');
const path = require('node:path');
const { DOWNLOADS } = require('@glimpse/shared/ipc-types');
const downloadsStorage = require('../storage/downloads');

/** Map of active download item references (Electron's DownloadItem objects) */
const activeDownloads = new Map();

/**
 * Register all download-related IPC handlers.
 * @param {object} [windowManager] - Window manager instance (optional)
 */
function registerDownloadsHandlers(windowManager) {
  /**
   * Get the main BrowserWindow for triggering downloads.
   */
  function getMainWindow() {
    if (windowManager && typeof windowManager.getMainWindow === 'function') {
      return windowManager.getMainWindow();
    }
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }

  /**
   * downloads:start — Initiate a download.
   * Uses Electron's webContents.downloadURL API.
   */
  ipcMain.handle(DOWNLOADS.START, async (_event, url, savePath) => {
    try {
      const win = getMainWindow();
      if (!win) {
        return { success: false, error: 'No browser window available' };
      }

      /* If no savePath specified, show save dialog */
      let finalSavePath = savePath;
      if (!finalSavePath) {
        const urlObj = new URL(url);
        const defaultName = path.basename(urlObj.pathname) || 'download';
        const result = await dialog.showSaveDialog(win, {
          defaultPath: defaultName,
          title: 'Save Download',
        });

        if (result.canceled) {
          return { success: false, error: 'Download cancelled by user' };
        }
        finalSavePath = result.filePath;
      }

      const filename = path.basename(finalSavePath);

      /* Create download record in storage */
      const record = downloadsStorage.addDownload(url, filename, finalSavePath);

      /* Set up download listener */
      const downloadPromise = new Promise((resolve) => {
        win.webContents.session.once('will-download', (_dlEvent, item) => {
          item.setSavePath(finalSavePath);
          activeDownloads.set(record.id, item);

          /* Update file size if available */
          const totalBytes = item.getTotalBytes();
          if (totalBytes > 0) {
            downloadsStorage.updateProgress(record.id, 0, 0);
          }

          item.on('updated', (_updateEvent, state) => {
            if (state === 'progressing') {
              const received = item.getReceivedBytes();
              const speed = item.getCurrentBytesPerSecond?.() || 0;
              downloadsStorage.updateProgress(record.id, received, speed);

              /* Notify renderer of progress */
              try {
                win.webContents.send(DOWNLOADS.PROGRESS, {
                  id: record.id,
                  bytesDownloaded: received,
                  totalBytes: item.getTotalBytes(),
                  speed,
                  percentComplete: item.getTotalBytes() > 0
                    ? ((received / item.getTotalBytes()) * 100).toFixed(1)
                    : 0,
                });
              } catch {
                /* Window may have been closed */
              }
            }
          });

          item.once('done', (_doneEvent, state) => {
            activeDownloads.delete(record.id);

            if (state === 'completed') {
              downloadsStorage.completeDownload(record.id, item.getReceivedBytes());
              try {
                win.webContents.send(DOWNLOADS.COMPLETED, { id: record.id });
              } catch { /* Window may have been closed */ }
            } else if (state === 'cancelled') {
              downloadsStorage.cancelDownload(record.id);
            } else {
              downloadsStorage.failDownload(record.id, `Download ${state}`);
              try {
                win.webContents.send(DOWNLOADS.FAILED, { id: record.id, reason: state });
              } catch { /* Window may have been closed */ }
            }

            resolve();
          });
        });

        /* Trigger the download */
        win.webContents.downloadURL(url);
      });

      /* Don't await the full download — return immediately with the record ID */
      downloadPromise.catch(() => {});

      return { success: true, data: { id: record.id, filename, savePath: finalSavePath } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * downloads:pause — Pause an active download.
   */
  ipcMain.handle(DOWNLOADS.PAUSE, async (_event, id) => {
    try {
      const item = activeDownloads.get(id);
      if (item && !item.isPaused()) {
        item.pause();
        downloadsStorage.pauseDownload(id);
        return { success: true };
      }
      return { success: false, error: 'Download not found or already paused' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * downloads:resume — Resume a paused download.
   */
  ipcMain.handle(DOWNLOADS.RESUME, async (_event, id) => {
    try {
      const item = activeDownloads.get(id);
      if (item && item.canResume()) {
        item.resume();
        downloadsStorage.resumeDownload(id);
        return { success: true };
      }
      return { success: false, error: 'Download not found or cannot be resumed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * downloads:cancel — Cancel an active download.
   */
  ipcMain.handle(DOWNLOADS.CANCEL, async (_event, id) => {
    try {
      const item = activeDownloads.get(id);
      if (item) {
        item.cancel();
        activeDownloads.delete(id);
      }
      downloadsStorage.cancelDownload(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * downloads:reveal — Show the downloaded file in the system file manager.
   */
  ipcMain.handle(DOWNLOADS.REVEAL, async (_event, id) => {
    try {
      const record = downloadsStorage.getById(id);
      if (!record || !record.save_path) {
        return { success: false, error: 'Download not found' };
      }
      shell.showItemInFolder(record.save_path);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerDownloadsHandlers };
