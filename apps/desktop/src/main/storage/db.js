/**
 * @fileoverview SQLite database initialization for the Glimpse desktop app.
 * Uses better-sqlite3 with WAL mode, foreign keys, and prepared statements.
 * @module desktop/storage/db
 */

'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const { app } = require('electron');

let db = null;

/**
 * Get the database file path.
 * Uses Electron's userData directory.
 * @returns {string}
 */
function getDbPath() {
  const userDataPath = app ? app.getPath('userData') : path.resolve(__dirname, '../../../../data');
  return path.join(userDataPath, 'glimpse.db');
}

/**
 * Initialize the database connection and create tables.
 * Called once at application startup.
 * @param {string} [customPath] - Override DB path (for testing)
 * @returns {Database.Database}
 */
function initDatabase(customPath) {
  if (db) return db;

  const dbPath = customPath || getDbPath();

  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development'
      ? (msg) => console.debug('[SQL]', msg)
      : undefined,
  });

  /* Performance pragmas */
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); /* 64MB cache */
  db.pragma('temp_store = MEMORY');

  /* Create tables */
  createTables();

  return db;
}

/**
 * Create all local SQLite tables.
 */
function createTables() {
  db.exec(`
    -- ── Local History ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS local_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      favicon_url TEXT,
      visit_count INTEGER NOT NULL DEFAULT 1,
      last_visited_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT DEFAULT 'direct',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_history_url ON local_history(url);
    CREATE INDEX IF NOT EXISTS idx_history_last_visited ON local_history(last_visited_at);
    CREATE INDEX IF NOT EXISTS idx_history_title ON local_history(title);

    -- ── Local Bookmark Folders ─────────────────────────────────
    CREATE TABLE IF NOT EXISTS local_bookmark_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES local_bookmark_folders(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Local Bookmarks ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS local_bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      favicon_url TEXT,
      folder_id INTEGER REFERENCES local_bookmark_folders(id) ON DELETE SET NULL,
      position INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      server_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bookmarks_folder ON local_bookmarks(folder_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON local_bookmarks(url);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_server_id ON local_bookmarks(server_id);

    -- ── Local Settings (key-value store) ───────────────────────
    CREATE TABLE IF NOT EXISTS local_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ── Local Sessions (auth token cache) ──────────────────────
    CREATE TABLE IF NOT EXISTS local_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      user_id TEXT,
      email TEXT,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Local Downloads ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS local_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      filename TEXT NOT NULL,
      save_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      bytes_downloaded INTEGER NOT NULL DEFAULT 0,
      file_size_bytes INTEGER,
      mime_type TEXT,
      download_speed_bps INTEGER,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_status ON local_downloads(status);
    CREATE INDEX IF NOT EXISTS idx_downloads_created ON local_downloads(created_at);

    -- ── Prefetch Cache Log ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS prefetch_cache_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      prefetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      hit_count INTEGER NOT NULL DEFAULT 0,
      last_hit_at TEXT,
      bytes_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success'
    );

    CREATE INDEX IF NOT EXISTS idx_prefetch_url ON prefetch_cache_log(url);
    CREATE INDEX IF NOT EXISTS idx_prefetch_time ON prefetch_cache_log(prefetched_at);

    -- ── Auth Tokens ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Get the database instance. Throws if not initialized.
 * @returns {Database.Database}
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection gracefully.
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase,
  getDbPath,
};
