/**
 * @fileoverview Prefetch IPC handlers.
 * Exposes prefetch cache status, management, and configuration to the renderer.
 * @module desktop/ipc/prefetch-handlers
 */

'use strict';

const { ipcMain } = require('electron');
const { PREFETCH } = require('@glimpse/shared/ipc-types');
const { getDb } = require('../storage/db');
const settings = require('../storage/settings');

let stmts = null;

function prepareStatements() {
  if (stmts) return stmts;
  const db = getDb();

  stmts = {
    getLog: db.prepare(
      'SELECT * FROM prefetch_cache_log ORDER BY prefetched_at DESC LIMIT ?'
    ),
    getStats: db.prepare(`
      SELECT
        COUNT(*) as total_entries,
        SUM(hit_count) as total_hits,
        SUM(bytes_size) as total_bytes,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM prefetch_cache_log
    `),
    clearLog: db.prepare('DELETE FROM prefetch_cache_log'),
    addEntry: db.prepare(`
      INSERT INTO prefetch_cache_log (url, prefetched_at, bytes_size, status)
      VALUES (?, datetime('now'), ?, ?)
    `),
    recordHit: db.prepare(`
      UPDATE prefetch_cache_log
      SET hit_count = hit_count + 1, last_hit_at = datetime('now')
      WHERE url = ?
    `),
  };

  return stmts;
}

/**
 * Register all prefetch-related IPC handlers.
 * @param {object} [cacheManager] - Cache manager instance (optional injection)
 */
function registerPrefetchHandlers(cacheManager) {
  ipcMain.handle(PREFETCH.GET_STATUS, async () => {
    try {
      const s = prepareStatements();
      const stats = s.getStats.get();

      /* If a cache manager is injected, get live stats too */
      let liveStats = {};
      if (cacheManager && typeof cacheManager.getStatus === 'function') {
        liveStats = cacheManager.getStatus();
      }

      return {
        success: true,
        data: {
          cachedUrls: stats?.total_entries || 0,
          totalHits: stats?.total_hits || 0,
          totalBytesCached: stats?.total_bytes || 0,
          totalBytesMb: ((stats?.total_bytes || 0) / (1024 * 1024)).toFixed(2),
          successCount: stats?.success_count || 0,
          failedCount: stats?.failed_count || 0,
          ...liveStats,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(PREFETCH.CLEAR_CACHE, async () => {
    try {
      const s = prepareStatements();
      const result = s.clearLog.run();

      /* Also clear the live cache if available */
      if (cacheManager && typeof cacheManager.clearAll === 'function') {
        cacheManager.clearAll();
      }

      return { success: true, cleared: result.changes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(PREFETCH.GET_LOG, async (_event, limit) => {
    try {
      const s = prepareStatements();
      const entries = s.getLog.all(limit || 100);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(PREFETCH.SET_AGGRESSIVENESS, async (_event, level) => {
    try {
      const validLevels = ['conservative', 'balanced', 'aggressive'];
      if (!validLevels.includes(level)) {
        return { success: false, error: `Invalid level: ${level}. Must be one of: ${validLevels.join(', ')}` };
      }

      settings.set('prefetchAggressiveness', level);

      /* Reconfigure the prefetch engine if available */
      if (cacheManager && typeof cacheManager.setAggressiveness === 'function') {
        cacheManager.setAggressiveness(level);
      }

      return { success: true, level };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

/**
 * Log a prefetch event to the local database.
 * Called by the prefetch engine, not via IPC.
 * @param {string} url
 * @param {number} [bytesSize=0]
 * @param {string} [status='success']
 */
function logPrefetchEntry(url, bytesSize = 0, status = 'success') {
  try {
    const s = prepareStatements();
    s.addEntry.run(url, bytesSize, status);
  } catch {
    /* Best-effort logging — don't crash on failure */
  }
}

/**
 * Record a cache hit for a prefetched URL.
 * @param {string} url
 */
function recordCacheHit(url) {
  try {
    const s = prepareStatements();
    s.recordHit.run(url);
  } catch {
    /* Best-effort — don't crash */
  }
}

module.exports = {
  registerPrefetchHandlers,
  logPrefetchEntry,
  recordCacheHit,
};
