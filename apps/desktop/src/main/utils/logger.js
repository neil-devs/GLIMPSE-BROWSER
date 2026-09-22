/**
 * @fileoverview Centralized logging via electron-log.
 * Provides structured logging with file rotation and console output.
 * @module desktop/utils/logger
 */

'use strict';

const log = require('electron-log');
const path = require('node:path');

/* ── Configuration ──────────────────────────────────────────────── */

/** Max log file size before rotation (10 MB) */
log.transports.file.maxSize = 10 * 1024 * 1024;

/** Keep 3 rotated log files */
log.transports.file.archiveLogFn = (oldFile) => {
  const info = path.parse(oldFile.path);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(info.dir, `${info.name}-${timestamp}${info.ext}`);
};

/** Log format: [timestamp] [level] message */
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

/** Only log to console in development */
log.transports.console.level = process.env.NODE_ENV === 'production' ? false : 'debug';

/** File transport always active */
log.transports.file.level = 'info';

/* ── Logger Interface ───────────────────────────────────────────── */

/**
 * Structured logger that wraps electron-log.
 * All methods accept a message string and optional context object.
 *
 * @example
 *   logger.info('Server started', { port: 3001 });
 *   logger.error('Failed to load', { error: err.message });
 */
const logger = {
  /**
   * Log informational message.
   * @param {string} message
   * @param {object} [context]
   */
  info(message, context) {
    if (context) {
      log.info(`${message} ${JSON.stringify(context)}`);
    } else {
      log.info(message);
    }
  },

  /**
   * Log warning message.
   * @param {string} message
   * @param {object} [context]
   */
  warn(message, context) {
    if (context) {
      log.warn(`${message} ${JSON.stringify(context)}`);
    } else {
      log.warn(message);
    }
  },

  /**
   * Log error message.
   * @param {string} message
   * @param {object} [context]
   */
  error(message, context) {
    if (context) {
      log.error(`${message} ${JSON.stringify(context)}`);
    } else {
      log.error(message);
    }
  },

  /**
   * Log debug message (console-only in development).
   * @param {string} message
   * @param {object} [context]
   */
  debug(message, context) {
    if (context) {
      log.debug(`${message} ${JSON.stringify(context)}`);
    } else {
      log.debug(message);
    }
  },

  /** Get the path to the current log file */
  getLogPath() {
    return log.transports.file.getFile().path;
  },
};

module.exports = { logger };
