/**
 * @fileoverview Rate limiting middleware.
 * Multiple limiters with different thresholds for different endpoint types.
 * Returns standard rate limit headers: Retry-After, X-RateLimit-*.
 * @module cloud-api/middleware/rate-limiter
 */

'use strict';

const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('@glimpse/shared/constants');
const logger = require('../utils/logger');

/**
 * Create a rate limiter with consistent configuration.
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.name - Limiter name for logging
 * @returns {import('express-rate-limit').RateLimitRequestHandler}
 */
function createLimiter({ windowMs, max, name }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,   // Return RateLimit-* headers (draft-6)
    legacyHeaders: true,     // Also return X-RateLimit-* headers
    keyGenerator: (req) => {
      /* Use X-Forwarded-For when behind a proxy, fall back to IP */
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
    handler: (req, res, next, options) => {
      logger.warn('Rate limit exceeded', {
        limiter: name,
        ip: req.ip,
        path: req.originalUrl,
        requestId: req.requestId,
      });

      const retryAfter = Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfter));

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again after ${retryAfter} seconds.`,
          retryAfter,
        },
      });
    },
    skip: (req) => {
      /* Never rate-limit health checks */
      return req.originalUrl === '/health' ||
             req.originalUrl === '/api/v1/health' ||
             req.originalUrl === '/api/v1/health/detailed';
    },
  });
}

/**
 * Global rate limiter: 200 requests per 15 minutes.
 * Applied to all routes as a baseline protection.
 */
const globalLimiter = createLimiter({
  windowMs: RATE_LIMITS.global.windowMs,
  max: RATE_LIMITS.global.max,
  name: 'global',
});

/**
 * Auth rate limiter: 10 requests per 15 minutes.
 * Applied to login/signup/password endpoints to prevent brute force.
 */
const authLimiter = createLimiter({
  windowMs: RATE_LIMITS.auth.windowMs,
  max: RATE_LIMITS.auth.max,
  name: 'auth',
});

/**
 * Telemetry rate limiter: 500 requests per minute.
 * Higher limit since telemetry data is sent in high volume.
 */
const telemetryLimiter = createLimiter({
  windowMs: RATE_LIMITS.telemetry.windowMs,
  max: RATE_LIMITS.telemetry.max,
  name: 'telemetry',
});

/**
 * Sync rate limiter: 60 requests per minute.
 * Moderate limit for sync operations.
 */
const syncLimiter = createLimiter({
  windowMs: RATE_LIMITS.sync.windowMs,
  max: RATE_LIMITS.sync.max,
  name: 'sync',
});

module.exports = {
  globalLimiter,
  authLimiter,
  telemetryLimiter,
  syncLimiter,
};
