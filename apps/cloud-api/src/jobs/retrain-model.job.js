/**
 * @fileoverview Scheduled job: ML model retraining.
 *
 * Runs:
 * - Weekly: every Sunday at 2:00 AM UTC
 * - Daily check: at 3:00 AM UTC, triggers retraining if new clicked searches >= ML_RETRAIN_MIN_NEW (default 500)
 *
 * Uses the complete histogram GBDT pipeline in ml/train.js.
 *
 * @module cloud-api/jobs/retrain-model
 */

'use strict';

const cron = require('node-cron');
const { supabase } = require('../db/client');
const { runTrainingPipeline } = require('../ml/train');
const logger = require('../utils/logger');

const DEFAULT_RETRAIN_MIN_NEW = 500;

/**
 * Check if sufficient new clicked searches have arrived since last active model.
 * @returns {Promise<boolean>}
 */
async function hasSufficientNewData() {
  const minNew = Number(process.env.ML_RETRAIN_MIN_NEW) || DEFAULT_RETRAIN_MIN_NEW;

  try {
    const { data: activeModel } = await supabase
      .from('ml_model_versions')
      .select('trained_at')
      .eq('is_active', true)
      .eq('model_type', 'click_predictor')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const sinceDate = activeModel?.trained_at || new Date(0).toISOString();

    const { count, error } = await supabase
      .from('result_link_events')
      .select('id', { count: 'exact', head: true })
      .eq('was_clicked', true)
      .eq('is_synthetic', false)
      .gt('created_at', sinceDate);

    if (error) throw error;

    const newClicks = count || 0;
    logger.info(`[ML:retrain-job] Daily check: ${newClicks} new clicks since last model (need ${minNew})`);
    return newClicks >= minNew;
  } catch (err) {
    logger.warn('[ML:retrain-job] Daily check failed', { error: err.message });
    return false;
  }
}

/**
 * Daily check runner.
 */
async function runDailyCheck() {
  logger.info('[ML:retrain-job] Running daily data threshold check...');
  const shouldRetrain = await hasSufficientNewData();
  if (shouldRetrain) {
    logger.info('[ML:retrain-job] Threshold reached, triggering retraining pipeline');
    return await runTrainingPipeline();
  } else {
    logger.info('[ML:retrain-job] Threshold not met, skipping retrain');
    return null;
  }
}

/**
 * Execute the full retraining job.
 */
async function runRetraining() {
  logger.info('[ML:retrain-job] Starting scheduled retraining job...');
  try {
    const result = await runTrainingPipeline();
    logger.info('[ML:retrain-job] Retraining job completed', {
      success: result.success,
      promoted: result.promoted,
      version: result.version,
    });
    return result;
  } catch (err) {
    logger.error('[ML:retrain-job] Retraining job error', { error: err.message, stack: err.stack });
    throw err;
  }
}

/**
 * Schedule weekly and daily cron jobs.
 */
function scheduleRetraining() {
  // Weekly full retrain: Sunday 2:00 AM UTC
  const weeklyTask = cron.schedule('0 2 * * 0', runRetraining, {
    scheduled: true,
    timezone: 'UTC',
  });

  // Daily threshold check: 3:00 AM UTC
  const dailyTask = cron.schedule('0 3 * * *', runDailyCheck, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info('ML retraining jobs scheduled: Weekly (Sunday 02:00 UTC) & Daily check (03:00 UTC)');

  return {
    stop: () => {
      weeklyTask.stop();
      dailyTask.stop();
    },
  };
}

if (require.main === module) {
  runRetraining().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = {
  scheduleRetraining,
  runRetraining,
  runDailyCheck,
  hasSufficientNewData,
};
