/**
 * @fileoverview Application error classes and pre-defined error instances.
 * Used by both cloud-api (thrown in controllers, caught by error-handler
 * middleware) and desktop (for IPC error responses).
 * @module @glimpse/shared/errors
 */

'use strict';

/**
 * Structured application error.
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code (e.g. 'UNAUTHORIZED')
   * @param {boolean} [isOperational=true] - Whether this is an expected error.
   *   Operational errors are handled gracefully; non-operational errors
   *   indicate programmer bugs and should trigger alerts.
   * @param {object} [details=null] - Additional context (field errors, etc.)
   */
  constructor(message, statusCode, code, isOperational = true, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date().toISOString();

    /* Preserve proper stack trace in V8 */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialise to a plain object suitable for JSON responses.
   * Never includes stack traces — those are logged server-side only.
   */
  toJSON() {
    const obj = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
      },
    };
    if (this.details) {
      obj.error.details = this.details;
    }
    return obj;
  }

  /**
   * Create an AppError with additional field-level details (validation errors).
   * @param {string} message
   * @param {object} fieldErrors - e.g. { email: 'Invalid email', password: 'Too short' }
   * @returns {AppError}
   */
  static validationError(message, fieldErrors) {
    return new AppError(message, 400, 'VALIDATION_ERROR', true, fieldErrors);
  }

  /**
   * Create an AppError from a generic Error (wrapping unknown errors).
   * Marked as non-operational since we didn't expect it.
   * @param {Error} err
   * @returns {AppError}
   */
  static fromError(err) {
    if (err instanceof AppError) {
      return err;
    }
    return new AppError(
      err.message || 'An unexpected error occurred',
      500,
      'INTERNAL_SERVER_ERROR',
      false
    );
  }
}

/* ── Pre-defined Error Instances ────────────────────────────────── */
/* These are factory functions so each throw creates a fresh instance
   with a unique timestamp and stack trace.                         */

const Errors = Object.freeze({
  /** 401 — No valid authentication credentials */
  UNAUTHORIZED: (message = 'Authentication required') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  /** 403 — Authenticated but not permitted */
  FORBIDDEN: (message = 'Access denied') =>
    new AppError(message, 403, 'FORBIDDEN'),

  /** 404 — Resource not found */
  NOT_FOUND: (message = 'Resource not found') =>
    new AppError(message, 404, 'NOT_FOUND'),

  /** 400 — Generic validation error */
  VALIDATION_ERROR: (message = 'Invalid request data', details = null) =>
    new AppError(message, 400, 'VALIDATION_ERROR', true, details),

  /** 429 — Rate limit exceeded */
  RATE_LIMIT_EXCEEDED: (message = 'Too many requests, please try again later') =>
    new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'),

  /** 500 — Internal server error */
  INTERNAL_SERVER_ERROR: (message = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_SERVER_ERROR', false),

  /** 409 — Sync conflict detected */
  SYNC_CONFLICT: (message = 'Sync conflict detected', details = null) =>
    new AppError(message, 409, 'SYNC_CONFLICT', true, details),

  /** 401 — Access token has expired */
  TOKEN_EXPIRED: (message = 'Token has expired') =>
    new AppError(message, 401, 'TOKEN_EXPIRED'),

  /** 401 — Invalid email or password */
  INVALID_CREDENTIALS: (message = 'Invalid email or password') =>
    new AppError(message, 401, 'INVALID_CREDENTIALS'),

  /** 403 — Account is suspended */
  ACCOUNT_SUSPENDED: (message = 'Account has been suspended') =>
    new AppError(message, 403, 'ACCOUNT_SUSPENDED'),

  /** 403 — Account is deleted */
  ACCOUNT_DELETED: (message = 'Account has been deleted') =>
    new AppError(message, 403, 'ACCOUNT_DELETED'),

  /** 409 — Email already registered */
  EMAIL_ALREADY_EXISTS: (message = 'An account with this email already exists') =>
    new AppError(message, 409, 'EMAIL_ALREADY_EXISTS'),

  /** 400 — Invalid or expired refresh token */
  INVALID_REFRESH_TOKEN: (message = 'Invalid or expired refresh token') =>
    new AppError(message, 400, 'INVALID_REFRESH_TOKEN'),

  /** 404 — Session not found */
  SESSION_NOT_FOUND: (message = 'Session not found') =>
    new AppError(message, 404, 'SESSION_NOT_FOUND'),

  /** 404 — Device not found */
  DEVICE_NOT_FOUND: (message = 'Device not found') =>
    new AppError(message, 404, 'DEVICE_NOT_FOUND'),

  /** 400 — Invalid password confirmation */
  INCORRECT_PASSWORD: (message = 'Incorrect password') =>
    new AppError(message, 400, 'INCORRECT_PASSWORD'),

  /** 503 — Service unavailable (e.g. database down) */
  SERVICE_UNAVAILABLE: (message = 'Service temporarily unavailable') =>
    new AppError(message, 503, 'SERVICE_UNAVAILABLE'),

  /** 413 — Payload too large */
  PAYLOAD_TOO_LARGE: (message = 'Request payload too large') =>
    new AppError(message, 413, 'PAYLOAD_TOO_LARGE'),

  /** 423 — Account locked (too many failed login attempts) */
  ACCOUNT_LOCKED: (message = 'Account temporarily locked due to too many failed login attempts') =>
    new AppError(message, 423, 'ACCOUNT_LOCKED'),

  /** 404 — Model not found */
  MODEL_NOT_FOUND: (message = 'No active model version found') =>
    new AppError(message, 404, 'MODEL_NOT_FOUND'),
});

module.exports = { AppError, Errors };
