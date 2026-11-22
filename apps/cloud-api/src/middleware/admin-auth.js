/**
 * @fileoverview Admin authentication middleware.
 * Uses timingSafeEqual to verify ADMIN_API_KEY.
 * Disables the route if ADMIN_API_KEY is unset in the environment.
 *
 * @module cloud-api/middleware/admin-auth
 */

'use strict';

const crypto = require('node:crypto');
const logger = require('../utils/logger');

function adminAuth(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;

  /* If ADMIN_API_KEY is unset, admin endpoints are strictly disabled */
  if (!adminKey || typeof adminKey !== 'string' || adminKey.trim().length === 0) {
    logger.warn('Admin endpoint accessed but ADMIN_API_KEY is not configured');
    return res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_DISABLED',
        message: 'Admin API is disabled (ADMIN_API_KEY is not configured).',
      },
    });
  }

  /* Extract key from X-Admin-Key header or Authorization: Bearer <key> */
  const header = req.headers['x-admin-key'] || req.headers['authorization'] || '';
  let providedKey = '';

  if (typeof header === 'string') {
    if (header.startsWith('Bearer ')) {
      providedKey = header.slice(7).trim();
    } else {
      providedKey = header.trim();
    }
  }

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin key required.',
      },
    });
  }

  const expectedBuf = Buffer.from(adminKey.trim());
  const providedBuf = Buffer.from(providedKey);

  /* Constant-time comparison to prevent timing attacks */
  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    logger.warn('Invalid admin key attempt', { ip: req.ip });
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid admin key.',
      },
    });
  }

  next();
}

module.exports = {
  adminAuth,
};
