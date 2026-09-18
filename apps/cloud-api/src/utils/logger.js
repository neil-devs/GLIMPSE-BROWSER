/**
 * @fileoverview Winston logger for the cloud API.
 * Structured JSON in production, colorized pretty-print in development.
 * Automatically redacts sensitive fields from log data.
 * @module cloud-api/utils/logger
 */

'use strict';

const winston = require('winston');

/** Fields whose values must never appear in logs */
const SENSITIVE_FIELDS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'oldPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'session_token',
  'sessionToken',
  'authorization',
  'cookie',
  'secret',
  'jwt_secret',
  'jwt_refresh_secret',
  'supabase_service_key',
  'supabase_anon_key',
  'api_key',
  'apiKey',
]);

/**
 * Recursively redact sensitive fields from an object.
 * @param {*} obj - Value to redact
 * @param {number} [depth=0] - Current recursion depth
 * @returns {*} Redacted copy
 */
function redact(obj, depth = 0) {
  if (depth > 8 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase()) || SENSITIVE_FIELDS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redact(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Custom format that redacts sensitive data */
const redactFormat = winston.format((info) => {
  if (info.meta && typeof info.meta === 'object') {
    info.meta = redact(info.meta);
  }
  /* Also redact any top-level sensitive keys on the info object */
  for (const key of Object.keys(info)) {
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(key.toLowerCase())) {
      info[key] = '[REDACTED]';
    }
  }
  return info;
});

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Console format selection:
 * - Production: structured JSON (for log aggregation pipelines)
 * - Development: colorized, human-readable
 */
const consoleFormat = isProduction
  ? winston.format.combine(
      winston.format.timestamp(),
      redactFormat(),
      winston.format.json()
    )
  : winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
      redactFormat(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
        const rid = requestId ? ` [${requestId}]` : '';
        const metaStr = Object.keys(meta).length > 0
          ? ` ${JSON.stringify(redact(meta))}`
          : '';
        return `${timestamp} ${level}${rid}: ${message}${metaStr}`;
      })
    );

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  defaultMeta: { service: 'glimpse-cloud-api' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

/* Add custom colours for dev readability */
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
});

/**
 * Create a morgan-compatible write stream that pipes HTTP logs to winston.
 * @type {{ write: (message: string) => void }}
 */
logger.stream = {
  write(message) {
    /* morgan appends a newline; trim it */
    logger.http(message.trim());
  },
};

module.exports = logger;
