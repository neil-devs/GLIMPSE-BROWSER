/**
 * @fileoverview Request logging middleware.
 * Attaches a unique request ID (UUID v4) to every request and
 * provides a morgan stream that pipes into winston.
 * @module cloud-api/middleware/logger
 */

'use strict';

const crypto = require('node:crypto');
const morgan = require('morgan');
const logger = require('../utils/logger');

/**
 * Attach a unique request ID to every incoming request.
 * The ID is available as req.requestId and is also set as
 * the X-Request-Id response header for client-side tracing.
 */
function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

/**
 * Morgan HTTP request logger configured to pipe into winston.
 * Uses 'combined' format in production and 'dev' format in development.
 * Skips logging for health check endpoints to reduce noise.
 */
const httpLogger = morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  {
    stream: logger.stream,
    skip: (req) => {
      /* Skip health check endpoints to avoid log noise */
      return req.originalUrl === '/health' || req.originalUrl === '/api/v1/health';
    },
  }
);

module.exports = {
  requestIdMiddleware,
  httpLogger,
};
