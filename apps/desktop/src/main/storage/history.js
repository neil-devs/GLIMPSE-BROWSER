/**
 * @fileoverview Local browsing history storage.
 * All queries use prepared statements for performance and safety.
 * @module desktop/storage/history
 */

'use strict';

const { getDb } = require('./db');

/** Prepared statement cache — initialized on first call */
let stmts = null;

function prepareStatements() {
  if (stmts) return stmts;

  const db = getDb();

  stmts = {
    findByUrl: db.prepare(
      'SELECT * FROM local_history WHERE url = ? LIMIT 1'
    ),
    incrementVisit: db.prepare(`
      UPDATE local_history
      SET visit_count = visit_count + 1,
          title = COALESCE(?, title),
          favicon_url = COALESCE(?, favicon_url),
          last_visited_at = datetime('now'),
          source = COALESCE(?, source)
      WHERE url = ?
    `),
    insert: db.prepare(`
      INSERT INTO local_history (url, title, favicon_url, source, last_visited_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `),
    getRecent: db.prepare(
      'SELECT * FROM local_history ORDER BY last_visited_at DESC LIMIT ?'
    ),
    searchByText: db.prepare(`
      SELECT * FROM local_history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY last_visited_at DESC
      LIMIT 100
    `),
    deleteById: db.prepare(
      'DELETE FROM local_history WHERE id = ?'
    ),
    clearAll: db.prepare(
      'DELETE FROM local_history'
    ),
    getByUrl: db.prepare(
      'SELECT * FROM local_history WHERE url = ?'
    ),
    getCount: db.prepare(
      'SELECT COUNT(*) as count FROM local_history'
    ),
    deleteOlderThan: db.prepare(
      'DELETE FROM local_history WHERE last_visited_at < ?'
    ),
  };

  return stmts;
}

/**
 * Add a history entry. If the URL already exists, increment visit_count
 * and update last_visited_at (upsert behaviour).
 *
 * @param {string} url
 * @param {string} [title]
 * @param {string} [faviconUrl]
 * @param {string} [source='direct'] - One of: search_result, direct, bookmark, prefetch_click
 * @returns {object} The history entry
 */
function addEntry(url, title = null, faviconUrl = null, source = 'direct') {
  const s = prepareStatements();

  const existing = s.findByUrl.get(url);

  if (existing) {
    s.incrementVisit.run(title, faviconUrl, source, url);
    return s.findByUrl.get(url);
  }

  const result = s.insert.run(url, title, faviconUrl, source);
  return {
    id: result.lastInsertRowid,
    url,
    title,
    favicon_url: faviconUrl,
    visit_count: 1,
    source,
    last_visited_at: new Date().toISOString(),
  };
}

/**
 * Get the most recent history entries.
 * @param {number} [limit=50]
 * @returns {Array<object>}
 */
function getRecent(limit = 50) {
  const s = prepareStatements();
  return s.getRecent.all(limit);
}

/**
 * Search history by URL or title (case-insensitive substring match).
 * @param {string} query
 * @returns {Array<object>}
 */
function search(query) {
  const s = prepareStatements();
  const pattern = `%${query}%`;
  return s.searchByText.all(pattern, pattern);
}

/**
 * Delete a single history entry by ID.
 * @param {number} id
 * @returns {boolean} True if a row was deleted
 */
function deleteEntry(id) {
  const s = prepareStatements();
  const result = s.deleteById.run(id);
  return result.changes > 0;
}

/**
 * Clear all history entries.
 * @returns {number} Number of rows deleted
 */
function clearAll() {
  const s = prepareStatements();
  const result = s.clearAll.run();
  return result.changes;
}

/**
 * Get a history entry by URL.
 * @param {string} url
 * @returns {object|undefined}
 */
function getByUrl(url) {
  const s = prepareStatements();
  return s.getByUrl.get(url);
}

/**
 * Get total history entry count.
 * @returns {number}
 */
function getCount() {
  const s = prepareStatements();
  return s.getCount.get().count;
}

/**
 * Delete entries older than the given ISO date string.
 * Used for history retention enforcement.
 * @param {string} beforeDate - ISO date string
 * @returns {number} Number of rows deleted
 */
function deleteOlderThan(beforeDate) {
  const s = prepareStatements();
  const result = s.deleteOlderThan.run(beforeDate);
  return result.changes;
}

module.exports = {
  addEntry,
  getRecent,
  search,
  deleteEntry,
  clearAll,
  getByUrl,
  getCount,
  deleteOlderThan,
};
