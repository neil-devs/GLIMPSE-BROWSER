/**
 * @fileoverview Global Express error handler.
 * Catches all errors and returns a consistent JSON response shape.
 * Handles: AppError, ZodError, JWT errors, Supabase errors, unknown errors.
 * Never leaks stack traces in production.
 * @module cloud-api/middleware/error-handler
 */

'use strict';

const { ZodError } = require('zod');
const { AppError } = require('@glimpse/shared/errors');
const logger = require('../utils/logger');

/**
 * Map known error types to consistent response shapes.
 * @param {Error} err
 * @returns {{ statusCode: number, code: string, message: string, details?: object }}
 */
function normalizeError(err) {
  /* ── AppError (our custom errors) ──────────────────────────── */
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details || undefined,
    };
  }

  /* ── Zod validation errors ────────────────────────────────── */
  if (err instanceof ZodError) {
    const fieldErrors = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || '_root';
      if (!fieldErrors[path]) {
        fieldErrors[path] = [];
      }
      fieldErrors[path].push(issue.message);
    }
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: fieldErrors,
    };
  }

  /* ── JWT errors ────────────────────────────────────────────── */
  if (err.name === 'JsonWebTokenError') {
    return {
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
    };
  }
  if (err.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired',
    };
  }
  if (err.name === 'NotBeforeError') {
    return {
      statusCode: 401,
      code: 'TOKEN_NOT_ACTIVE',
      message: 'Authentication token is not yet active',
    };
  }

  /* ── Supabase / PostgreSQL errors ──────────────────────────── */
  if (err.code && typeof err.code === 'string' && err.code.length === 5) {
    /* PostgreSQL error codes are 5-char strings (e.g. '23505' = unique violation) */
    switch (err.code) {
      case '23505': /* unique_violation */
        return {
          statusCode: 409,
          code: 'DUPLICATE_ENTRY',
          message: 'A record with this value already exists',
        };
      case '23503': /* foreign_key_violation */
        return {
          statusCode: 400,
          code: 'INVALID_REFERENCE',
          message: 'Referenced record does not exist',
        };
      case '23502': /* not_null_violation */
        return {
          statusCode: 400,
          code: 'MISSING_REQUIRED_FIELD',
          message: 'A required field is missing',
        };
      default:
        return {
          statusCode: 500,
          code: 'DATABASE_ERROR',
          message: 'A database error occurred',
        };
    }
  }

  /* ── Express body-parser errors ────────────────────────────── */
  if (err.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    };
  }
  if (err.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON',
    };
  }

  /* ── Unknown errors ────────────────────────────────────────── */
  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  };
}

/**
 * Global error handling middleware.
 * Must be registered LAST in the middleware chain (after all routes).
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, req, res, _next) {
  const normalized = normalizeError(err);
  const isServerError = normalized.statusCode >= 500;

  /* Log with appropriate severity */
  const logData = {
    statusCode: normalized.statusCode,
    code: normalized.code,
    path: req.originalUrl,
    method: req.method,
    requestId: req.requestId,
    ip: req.ip,
  };

  if (isServerError) {
    /* Include stack trace for 5xx errors — critical for debugging */
    logger.error(err.message, { ...logData, stack: err.stack });
  } else if (normalized.statusCode === 429) {
    logger.warn(err.message, logData);
  } else {
    logger.debug(err.message, logData);
  }

  /* Build response — never include stack traces for the client */
  const response = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };

  if (normalized.details) {
    response.error.details = normalized.details;
  }

  /* In development, include the original error message for easier debugging */
  if (process.env.NODE_ENV !== 'production' && isServerError) {
    response.error._devMessage = err.message;
    response.error._devStack = err.stack;
  }

  res.status(normalized.statusCode).json(response);
}

/**
 * 404 handler for unmatched routes.
 * Register AFTER all route mounts but BEFORE the error handler.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
