/**
 * @fileoverview Cloud API server entry point.
 * Loads environment variables, verifies database connectivity,
 * starts the Express server, schedules cron jobs, and registers
 * graceful shutdown handlers.
 * @module cloud-api/index
 */

'use strict';

/* Load environment variables from .env file (development only) */
require('dotenv').config();

const { createApp } = require('./app');
const { testConnection } = require('./db/client');
const { scheduleRetraining } = require('./jobs/retrain-model.job');
const { scheduleCleanup } = require('./jobs/cleanup-telemetry.job');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Start the server.
 */
async function start() {
  logger.info('────────────────────────────────────────');
  logger.info('  Glimpse Browser Cloud API');
  logger.info(`  Environment: ${NODE_ENV}`);
  logger.info(`  Port: ${PORT}`);
  logger.info('────────────────────────────────────────');

  /* Verify database connection */
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }

  /* Create Express app */
  const app = createApp();

  /* Start HTTP server */
  const server = app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`API base: http://localhost:${PORT}/api/v1`);
  });

  /* Configure server timeouts */
  server.keepAliveTimeout = 65 * 1000; /* 65 seconds */
  server.headersTimeout = 66 * 1000;   /* slightly above keepAliveTimeout */

  /* Schedule cron jobs */
  const retrainTask = scheduleRetraining();
  const cleanupTask = scheduleCleanup();

  /* ── Graceful Shutdown ────────────────────────────────────── */
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    /* Stop accepting new connections */
    server.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: err.message });
      } else {
        logger.info('HTTP server closed');
      }
    });

    /* Stop cron jobs */
    try {
      retrainTask.stop();
      cleanupTask.stop();
      logger.info('Cron jobs stopped');
    } catch (err) {
      logger.error('Error stopping cron jobs', { error: err.message });
    }

    /* Allow existing requests to finish (max 30 seconds) */
    const forceExitTimeout = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);

    forceExitTimeout.unref(); /* Don't keep the process alive just for this timer */

    /* Wait a moment for in-flight requests */
    setTimeout(() => {
      logger.info('Graceful shutdown complete');
      process.exit(0);
    }, 2000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /* ── Unhandled error handlers ─────────────────────────────── */
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    /* Exit after logging — the process is in an undefined state */
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  return server;
}

/* Auto-start when run directly */
start().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
