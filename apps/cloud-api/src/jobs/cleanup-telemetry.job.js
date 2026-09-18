/**
 * @fileoverview Scheduled job: Telemetry data cleanup.
 * Runs every day at 3am UTC.
 * Removes old telemetry, performance logs, audit logs, and expired sessions.
 * @module cloud-api/jobs/cleanup-telemetry
 */

'use strict';

const cron = require('node-cron');
const { supabase } = require('../db/client');
const logger = require('../utils/logger');

/**
 * Execute the cleanup pipeline.
 */
async function runCleanup() {
  const startTime = Date.now();
  logger.info('Telemetry cleanup job started');

  const results = {
    resultLinkEvents: 0,
    prefetchPerformanceLogs: 0,
    activityAuditLogs: 0,
    expiredSessions: 0,
    mlPredictionsLogs: 0,
  };

  try {
    /* 1. Delete result_link_events older than 90 days */
    const rleCutoff = new Date();
    rleCutoff.setDate(rleCutoff.getDate() - 90);

    const { data: rleDeleted, error: rleError } = await supabase
      .from('result_link_events')
      .delete()
      .lt('created_at', rleCutoff.toISOString())
      .select('id');

    if (rleError) {
      logger.error('Failed to clean result_link_events', { error: rleError.message });
    } else {
      results.resultLinkEvents = rleDeleted?.length || 0;
    }

    /* 2. Delete prefetch_performance_log older than 30 days */
    const ppCutoff = new Date();
    ppCutoff.setDate(ppCutoff.getDate() - 30);

    const { data: ppDeleted, error: ppError } = await supabase
      .from('prefetch_performance_log')
      .delete()
      .lt('created_at', ppCutoff.toISOString())
      .select('id');

    if (ppError) {
      logger.error('Failed to clean prefetch_performance_log', { error: ppError.message });
    } else {
      results.prefetchPerformanceLogs = ppDeleted?.length || 0;
    }

    /* 3. Delete activity_audit_log older than 180 days */
    const auditCutoff = new Date();
    auditCutoff.setDate(auditCutoff.getDate() - 180);

    const { data: auditDeleted, error: auditError } = await supabase
      .from('activity_audit_log')
      .delete()
      .lt('created_at', auditCutoff.toISOString())
      .select('id');

    if (auditError) {
      logger.error('Failed to clean activity_audit_log', { error: auditError.message });
    } else {
      results.activityAuditLogs = auditDeleted?.length || 0;
    }

    /* 4. Delete inactive user_sessions that expired > 30 days ago */
    const sessionCutoff = new Date();
    sessionCutoff.setDate(sessionCutoff.getDate() - 30);

    const { data: sessionsDeleted, error: sessError } = await supabase
      .from('user_sessions')
      .delete()
      .eq('is_active', false)
      .lt('expires_at', sessionCutoff.toISOString())
      .select('id');

    if (sessError) {
      logger.error('Failed to clean expired sessions', { error: sessError.message });
    } else {
      results.expiredSessions = sessionsDeleted?.length || 0;
    }

    /* 5. Delete ml_predictions_log older than 60 days */
    const mlCutoff = new Date();
    mlCutoff.setDate(mlCutoff.getDate() - 60);

    const { data: mlDeleted, error: mlError } = await supabase
      .from('ml_predictions_log')
      .delete()
      .lt('created_at', mlCutoff.toISOString())
      .select('id');

    if (mlError) {
      logger.error('Failed to clean ml_predictions_log', { error: mlError.message });
    } else {
      results.mlPredictionsLogs = mlDeleted?.length || 0;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);

    logger.info(`Telemetry cleanup completed in ${elapsed}s`, {
      totalDeleted,
      ...results,
    });
  } catch (err) {
    logger.error('Telemetry cleanup job failed', {
      error: err.message,
      stack: err.stack,
      elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    });
  }
}

/**
 * Schedule the cleanup job.
 * Cron: every day at 3:00 AM UTC
 */
function scheduleCleanup() {
  const task = cron.schedule('0 3 * * *', runCleanup, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info('Telemetry cleanup job scheduled: daily at 03:00 UTC');
  return task;
}

module.exports = {
  scheduleCleanup,
  runCleanup, /* exported for manual triggering / testing */
};
