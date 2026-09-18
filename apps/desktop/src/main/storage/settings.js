/**
 * @fileoverview Local settings storage (key-value store).
 * Settings are stored as JSON-serialized strings.
 * @module desktop/storage/settings
 */

'use strict';

const { getDb } = require('./db');
const { DEFAULT_SETTINGS } = require('@glimpse/shared/constants');

let stmts = null;

function prepareStatements() {
  if (stmts) return stmts;
  const db = getDb();

  stmts = {
    get: db.prepare('SELECT value FROM local_settings WHERE key = ?'),
    set: db.prepare(`
      INSERT INTO local_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),
    getAll: db.prepare('SELECT key, value FROM local_settings'),
    deleteKey: db.prepare('DELETE FROM local_settings WHERE key = ?'),
    clearAll: db.prepare('DELETE FROM local_settings'),
  };

  return stmts;
}

/**
 * Get a setting value by key.
 * @param {string} key
 * @param {*} [defaultValue] - Returned if key doesn't exist.
 *   Falls back to DEFAULT_SETTINGS[key] if no defaultValue provided.
 * @returns {*} Parsed JSON value
 */
function get(key, defaultValue = undefined) {
  const s = prepareStatements();
  const row = s.get.get(key);

  if (!row) {
    if (defaultValue !== undefined) return defaultValue;
    return DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : null;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * Set a setting value.
 * Values are JSON-serialized for storage.
 * @param {string} key
 * @param {*} value
 */
function set(key, value) {
  const s = prepareStatements();
  const serialized = JSON.stringify(value);
  s.set.run(key, serialized);
}

/**
 * Get all settings as a flat object.
 * Missing keys are filled in from DEFAULT_SETTINGS.
 * @returns {object}
 */
function getAll() {
  const s = prepareStatements();
  const rows = s.getAll.all();

  /* Start with defaults */
  const result = { ...DEFAULT_SETTINGS };

  /* Override with stored values */
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }

  return result;
}

/**
 * Reset all settings to defaults.
 * Clears the settings table and re-inserts all default values.
 * @returns {object} The default settings object
 */
function reset() {
  const s = prepareStatements();
  const db = getDb();

  const resetTransaction = db.transaction(() => {
    s.clearAll.run();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      s.set.run(key, JSON.stringify(value));
    }
  });

  resetTransaction();
  return { ...DEFAULT_SETTINGS };
}

/**
 * Delete a single setting (revert to default).
 * @param {string} key
 */
function remove(key) {
  const s = prepareStatements();
  s.deleteKey.run(key);
}

module.exports = {
  get,
  set,
  getAll,
  reset,
  remove,
};
