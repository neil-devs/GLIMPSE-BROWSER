/**
 * @fileoverview Storage IPC handlers.
 * Wires every local storage function (history, bookmarks, settings, downloads)
 * to an IPC channel for access from the renderer process.
 * @module desktop/ipc/storage-handlers
 */

'use strict';

const { ipcMain } = require('electron');
const { HISTORY, BOOKMARKS, SETTINGS, DOWNLOADS } = require('@glimpse/shared/ipc-types');
const history = require('../storage/history');
const bookmarks = require('../storage/bookmarks');
const settings = require('../storage/settings');
const downloads = require('../storage/downloads');

/**
 * Register all storage-related IPC handlers.
 */
function registerStorageHandlers() {
  /* ── History ──────────────────────────────────────────────── */

  ipcMain.handle(HISTORY.ADD, async (_event, url, title, faviconUrl, source) => {
    try {
      return { success: true, data: history.addEntry(url, title, faviconUrl, source) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(HISTORY.GET_RECENT, async (_event, limit) => {
    try {
      return { success: true, data: history.getRecent(limit || 50) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(HISTORY.SEARCH, async (_event, query) => {
    try {
      return { success: true, data: history.search(query) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(HISTORY.DELETE, async (_event, id) => {
    try {
      const deleted = history.deleteEntry(id);
      return { success: deleted };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(HISTORY.CLEAR, async () => {
    try {
      const count = history.clearAll();
      return { success: true, deleted: count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(HISTORY.GET_BY_URL, async (_event, url) => {
    try {
      return { success: true, data: history.getByUrl(url) || null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /* ── Bookmarks ────────────────────────────────────────────── */

  ipcMain.handle(BOOKMARKS.GET_ALL, async () => {
    try {
      return { success: true, data: bookmarks.getAll() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(BOOKMARKS.ADD, async (_event, url, title, folderId, position) => {
    try {
      const bm = bookmarks.add(url, title, folderId, position);
      return { success: true, data: bm };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(BOOKMARKS.UPDATE, async (_event, id, fields) => {
    try {
      const updated = bookmarks.update(id, fields);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(BOOKMARKS.DELETE, async (_event, id) => {
    try {
      const deleted = bookmarks.delete(id);
      return { success: deleted };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(BOOKMARKS.ADD_FOLDER, async (_event, name, parentId) => {
    try {
      const folder = bookmarks.addFolder(name, parentId);
      return { success: true, data: folder };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(BOOKMARKS.MOVE, async (_event, id, newFolderId, newPosition) => {
    try {
      const moved = bookmarks.moveBookmark(id, newFolderId, newPosition);
      return { success: true, data: moved };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(BOOKMARKS.GET_BY_FOLDER, async (_event, folderId) => {
    try {
      return { success: true, data: bookmarks.getByFolder(folderId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /* ── Settings ─────────────────────────────────────────────── */

  ipcMain.handle(SETTINGS.GET, async (_event, key, defaultValue) => {
    try {
      return { success: true, data: settings.get(key, defaultValue) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(SETTINGS.SET, async (_event, key, value) => {
    try {
      settings.set(key, value);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(SETTINGS.GET_ALL, async () => {
    try {
      return { success: true, data: settings.getAll() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(SETTINGS.RESET, async () => {
    try {
      const defaults = settings.reset();
      return { success: true, data: defaults };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /* ── Downloads (read operations) ──────────────────────────── */

  ipcMain.handle(DOWNLOADS.GET_ALL, async () => {
    try {
      return { success: true, data: downloads.getAll() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(DOWNLOADS.DELETE, async (_event, id) => {
    try {
      const deleted = downloads.delete(id);
      return { success: deleted };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(DOWNLOADS.CLEAR_COMPLETED, async () => {
    try {
      const count = downloads.clearCompleted();
      return { success: true, deleted: count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerStorageHandlers };
