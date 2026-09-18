/**
 * @fileoverview Cryptographic utilities.
 * Password hashing (bcrypt), token hashing (SHA-256), JWT generation,
 * and device fingerprint hashing.
 * @module cloud-api/utils/crypto
 */

'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { BCRYPT_SALT_ROUNDS, TOKEN_EXPIRY } = require('@glimpse/shared/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-do-not-use-in-production';

/* ── Password Hashing (bcrypt) ──────────────────────────────────── */

/**
 * Hash a plaintext password using bcrypt.
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * @param {string} password - Plaintext password
 * @param {string} hash - bcrypt hash to compare against
 * @returns {Promise<boolean>} True if password matches
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/* ── Token Hashing (SHA-256) ────────────────────────────────────── */

/**
 * Generate a cryptographically secure random token.
 * @param {number} [bytes=48] - Number of random bytes
 * @returns {string} Hex-encoded random token
 */
function generateToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token using SHA-256 for safe storage.
 * Refresh tokens and session tokens are never stored in plaintext.
 * @param {string} token - Raw token to hash
 * @returns {string} SHA-256 hex digest
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/* ── JWT Generation ─────────────────────────────────────────────── */

/**
 * Generate an access token (short-lived, 15 minutes).
 * @param {object} payload - Token payload
 * @param {string} payload.userId - User UUID
 * @param {string} payload.email - User email
 * @param {string} payload.sessionId - Session UUID
 * @param {string} [payload.deviceId] - Device UUID
 * @returns {string} Signed JWT
 */
function generateAccessToken({ userId, email, sessionId, deviceId }) {
  return jwt.sign(
    {
      sub: userId,
      email,
      sessionId,
      deviceId: deviceId || null,
      type: 'access',
    },
    JWT_SECRET,
    {
      expiresIn: TOKEN_EXPIRY.access,
      issuer: 'glimpse-cloud-api',
      audience: 'glimpse-desktop',
    }
  );
}

/**
 * Generate a refresh token (long-lived, 7 days).
 * @param {object} payload - Token payload
 * @param {string} payload.userId - User UUID
 * @param {string} payload.sessionId - Session UUID
 * @returns {string} Signed JWT
 */
function generateRefreshToken({ userId, sessionId }) {
  return jwt.sign(
    {
      sub: userId,
      sessionId,
      type: 'refresh',
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: TOKEN_EXPIRY.refresh,
      issuer: 'glimpse-cloud-api',
      audience: 'glimpse-desktop',
    }
  );
}

/**
 * Verify and decode an access token.
 * @param {string} token - JWT to verify
 * @returns {object} Decoded payload
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: 'glimpse-cloud-api',
    audience: 'glimpse-desktop',
  });
}

/**
 * Verify and decode a refresh token.
 * @param {string} token - JWT to verify
 * @returns {object} Decoded payload
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET, {
    issuer: 'glimpse-cloud-api',
    audience: 'glimpse-desktop',
  });
}

/* ── Device Fingerprinting ──────────────────────────────────────── */

/**
 * Create a stable device fingerprint hash from device characteristics.
 * Uses SHA-256 so no PII is stored — only the hash.
 * @param {object} device
 * @param {string} device.os - Operating system
 * @param {string} device.arch - CPU architecture
 * @param {string} device.hostname - Machine hostname
 * @param {string} [device.cpuModel] - CPU model string
 * @returns {string} SHA-256 hex digest
 */
function createDeviceFingerprint({ os, arch, hostname, cpuModel = '' }) {
  const raw = `${os}|${arch}|${hostname}|${cpuModel}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a UUID v4.
 * @returns {string} UUID string
 */
function generateUUID() {
  return crypto.randomUUID();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createDeviceFingerprint,
  generateUUID,
};
