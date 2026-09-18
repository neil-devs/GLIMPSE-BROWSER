/**
 * @fileoverview Local auth session/token cache.
 * Caches the current access and refresh tokens locally so the desktop
 * app can restore authentication state on restart without re-login.
 * @module desktop/storage/sessions
 */

'use strict';

const { getDb } = require('./db');

let stmts = null;

function prepareStatements() {
  if (stmts) return stmts;
  const db = getDb();

  stmts = {
    upsert: db.prepare(`
      INSERT INTO auth_tokens (id, access_token, refresh_token, expires_at, user_id, updated_at)
      VALUES (1, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        user_id = excluded.user_id,
        updated_at = datetime('now')
    `),
    get: db.prepare(
      'SELECT * FROM auth_tokens WHERE id = 1'
    ),
    clear: db.prepare(
      'DELETE FROM auth_tokens'
    ),
  };

  return stmts;
}

/**
 * Store authentication tokens.
 * Only one set of tokens is stored at a time (singleton row with id=1).
 *
 * @param {object} tokens
 * @param {string} tokens.accessToken
 * @param {string} tokens.refreshToken
 * @param {string} tokens.expiresAt - ISO date string
 * @param {string} tokens.userId
 */
function store(tokens) {
  const s = prepareStatements();
  s.upsert.run(
    tokens.accessToken,
    tokens.refreshToken,
    tokens.expiresAt,
    tokens.userId
  );
}

/**
 * Get the stored authentication tokens.
 * @returns {object|null} Token data or null if no tokens stored
 */
function get() {
  const s = prepareStatements();
  const row = s.get.get();

  if (!row) return null;

  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    userId: row.user_id,
    updatedAt: row.updated_at,
  };
}

/**
 * Clear all stored tokens (logout).
 */
function clear() {
  const s = prepareStatements();
  s.clear.run();
}

/**
 * Check if the stored access token has expired.
 * @returns {boolean} True if expired or no tokens stored
 */
function isExpired() {
  const tokens = get();
  if (!tokens || !tokens.expiresAt) return true;

  return new Date(tokens.expiresAt) <= new Date();
}

/**
 * Check if the user is currently authenticated (has valid tokens).
 * @returns {boolean}
 */
function isAuthenticated() {
  const tokens = get();
  return tokens !== null && tokens.accessToken !== null;
}

module.exports = {
  store,
  get,
  clear,
  isExpired,
  isAuthenticated,
};
