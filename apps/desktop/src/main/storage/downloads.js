/**
 * @fileoverview Local downloads storage.
 * Tracks download lifecycle: pending → in_progress → completed/failed/cancelled.
 * @module desktop/storage/downloads
 */

'use strict';

const { getDb } = require('./db');

let stmts = null;

function prepareStatements() {
  if (stmts) return stmts;
  const db = getDb();

  stmts = {
    insert: db.prepare(`
      INSERT INTO local_downloads (url, filename, save_path, file_size_bytes, mime_type, status, started_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
    `),
    updateProgress: db.prepare(`
      UPDATE local_downloads
      SET bytes_downloaded = ?,
          download_speed_bps = ?,
          status = 'in_progress'
      WHERE id = ?
    `),
    complete: db.prepare(`
      UPDATE local_downloads
      SET status = 'completed',
          bytes_downloaded = COALESCE(?, bytes_downloaded),
          completed_at = datetime('now')
      WHERE id = ?
    `),
    fail: db.prepare(`
      UPDATE local_downloads
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `),
    cancel: db.prepare(`
      UPDATE local_downloads SET status = 'cancelled' WHERE id = ?
    `),
    pause: db.prepare(`
      UPDATE local_downloads SET status = 'pending' WHERE id = ? AND status = 'in_progress'
    `),
    resume: db.prepare(`
      UPDATE local_downloads SET status = 'in_progress' WHERE id = ? AND status = 'pending'
    `),
    getAll: db.prepare(
      'SELECT * FROM local_downloads ORDER BY created_at DESC'
    ),
    getById: db.prepare(
      'SELECT * FROM local_downloads WHERE id = ?'
    ),
    deleteById: db.prepare(
      'DELETE FROM local_downloads WHERE id = ?'
    ),
    clearCompleted: db.prepare(
      "DELETE FROM local_downloads WHERE status IN ('completed', 'failed', 'cancelled')"
    ),
    getActive: db.prepare(
      "SELECT * FROM local_downloads WHERE status IN ('pending', 'in_progress') ORDER BY created_at DESC"
    ),
  };

  return stmts;
}

/**
 * Add a new download entry.
 * @param {string} url
 * @param {string} filename
 * @param {string} savePath
 * @param {number|null} [fileSize=null]
 * @param {string|null} [mimeType=null]
 * @returns {object} The download record
 */
function addDownload(url, filename, savePath, fileSize = null, mimeType = null) {
  const s = prepareStatements();
  const info = s.insert.run(url, filename, savePath, fileSize, mimeType);
  return s.getById.get(info.lastInsertRowid);
}

/**
 * Update download progress.
 * @param {number} id
 * @param {number} bytesDownloaded
 * @param {number} [speed=0] - Bytes per second
 */
function updateProgress(id, bytesDownloaded, speed = 0) {
  const s = prepareStatements();
  s.updateProgress.run(bytesDownloaded, speed, id);
}

/**
 * Mark a download as completed.
 * @param {number} id
 * @param {number} [finalBytes] - Final byte count (optional)
 */
function completeDownload(id, finalBytes = null) {
  const s = prepareStatements();
  s.complete.run(finalBytes, id);
}

/**
 * Mark a download as failed.
 * @param {number} id
 * @param {string} [reason='Unknown error']
 */
function failDownload(id, reason = 'Unknown error') {
  const s = prepareStatements();
  s.fail.run(reason, id);
}

/**
 * Cancel a download.
 * @param {number} id
 */
function cancelDownload(id) {
  const s = prepareStatements();
  s.cancel.run(id);
}

/**
 * Pause a download (set status back to pending).
 * @param {number} id
 */
function pauseDownload(id) {
  const s = prepareStatements();
  s.pause.run(id);
}

/**
 * Resume a paused download.
 * @param {number} id
 */
function resumeDownload(id) {
  const s = prepareStatements();
  s.resume.run(id);
}

/**
 * Get all downloads, sorted by created_at DESC.
 * @returns {Array<object>}
 */
function getAll() {
  const s = prepareStatements();
  return s.getAll.all();
}

/**
 * Get a download by ID.
 * @param {number} id
 * @returns {object|undefined}
 */
function getById(id) {
  const s = prepareStatements();
  return s.getById.get(id);
}

/**
 * Delete a download record.
 * @param {number} id
 * @returns {boolean}
 */
function deleteDownload(id) {
  const s = prepareStatements();
  const result = s.deleteById.run(id);
  return result.changes > 0;
}

/**
 * Clear all completed, failed, and cancelled downloads.
 * @returns {number} Number of rows deleted
 */
function clearCompleted() {
  const s = prepareStatements();
  const result = s.clearCompleted.run();
  return result.changes;
}

/**
 * Get active (pending + in_progress) downloads.
 * @returns {Array<object>}
 */
function getActive() {
  const s = prepareStatements();
  return s.getActive.all();
}

module.exports = {
  addDownload,
  updateProgress,
  completeDownload,
  failDownload,
  cancelDownload,
  pauseDownload,
  resumeDownload,
  getAll,
  getById,
  delete: deleteDownload,
  clearCompleted,
  getActive,
};
