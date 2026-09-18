/**
 * @fileoverview Scheduled job: ML model retraining.
 * Runs every Sunday at 2am UTC.
 * Fetches recent training data, trains a new model, evaluates it,
 * and deploys if accuracy meets the threshold.
 * @module cloud-api/jobs/retrain-model
 */

'use strict';

const cron = require('node-cron');
const { supabase } = require('../db/client');
const { trainModel } = require('../ml/train');
const { evaluateModel } = require('../ml/evaluate');
const { exportModel } = require('../ml/export-model');
const logger = require('../utils/logger');

const ACCURACY_THRESHOLD = 0.70;
const MIN_TRAINING_ROWS = 10000;
const TRAINING_WINDOW_DAYS = 30;

/**
 * Execute the retraining pipeline.
 */
async function runRetraining() {
  const startTime = Date.now();
  logger.info('ML retraining job started');

  try {
    /* 1. Fetch training data from the last 30 days */
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - TRAINING_WINDOW_DAYS);

    const { data: trainingRows, error: fetchError } = await supabase
      .from('result_link_events')
      .select(`
        id, url, domain, link_position,
        was_visible_on_load, was_prefetched,
        prefetch_duration_ms, was_clicked,
        search_events!inner(search_engine, query_text)
      `)
      .eq('was_prefetched', true)
      .gte('created_at', cutoffDate.toISOString())
      .not('was_clicked', 'is', null)
      .limit(100000);

    if (fetchError) {
      logger.error('Failed to fetch training data', { error: fetchError.message });
      return;
    }

    const rowCount = trainingRows?.length || 0;
    logger.info(`Fetched ${rowCount} training rows`);

    if (rowCount < MIN_TRAINING_ROWS) {
      logger.warn(
        `Insufficient training data: ${rowCount} rows (need ${MIN_TRAINING_ROWS}). Skipping retraining.`
      );
      return;
    }

    /* 2. Flatten the joined data for the ML pipeline */
    const flattenedRows = trainingRows.map((row) => ({
      url: row.url,
      domain: row.domain,
      linkPosition: row.link_position,
      wasVisibleOnLoad: row.was_visible_on_load,
      wasPrefetched: row.was_prefetched,
      prefetchDurationMs: row.prefetch_duration_ms || 0,
      wasClicked: row.was_clicked,
      searchEngine: row.search_events.search_engine,
      queryText: row.search_events.query_text,
    }));

    /* 3. Train the model */
    logger.info('Starting model training...');
    const { model, testX, testY, featureNames } = await trainModel(flattenedRows);
    logger.info('Model training completed');

    /* 4. Evaluate the model */
    const metrics = evaluateModel(model, testX, testY);
    logger.info('Model evaluation results', { metrics });

    if (metrics.accuracy < ACCURACY_THRESHOLD) {
      logger.warn(
        `Model accuracy ${metrics.accuracy.toFixed(3)} is below threshold ${ACCURACY_THRESHOLD}. Not deploying.`
      );
      /* Still save the model version record, but don't activate it */
      await supabase.from('ml_model_versions').insert({
        version_string: `${Date.now()}`,
        model_type: 'click_predictor',
        training_data_count: rowCount,
        accuracy_score: metrics.accuracy,
        precision_score: metrics.precision,
        recall_score: metrics.recall,
        f1_score: metrics.f1,
        auc_roc_score: metrics.aucRoc,
        is_active: false,
        trained_at: new Date().toISOString(),
      });
      return;
    }

    /* 5. Export the model to JSON */
    const { filePath, fileSizeBytes, versionString } = await exportModel(
      model,
      featureNames,
      metrics
    );
    logger.info('Model exported', { filePath, fileSizeBytes });

    /* 6. Deactivate current active model */
    await supabase
      .from('ml_model_versions')
      .update({ is_active: false })
      .eq('is_active', true)
      .eq('model_type', 'click_predictor');

    /* 7. Insert new model version as active */
    await supabase.from('ml_model_versions').insert({
      version_string: versionString,
      model_type: 'click_predictor',
      training_data_count: rowCount,
      accuracy_score: metrics.accuracy,
      precision_score: metrics.precision,
      recall_score: metrics.recall,
      f1_score: metrics.f1,
      auc_roc_score: metrics.aucRoc,
      model_file_path: 'models/latest.json',
      model_file_size_bytes: fileSizeBytes,
      is_active: true,
      trained_at: new Date().toISOString(),
      deployed_at: new Date().toISOString(),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`ML retraining job completed successfully in ${elapsed}s`, {
      version: versionString,
      accuracy: metrics.accuracy,
      trainingRows: rowCount,
    });
  } catch (err) {
    logger.error('ML retraining job failed', {
      error: err.message,
      stack: err.stack,
      elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    });
  }
}

/**
 * Schedule the retraining job.
 * Cron: every Sunday at 2:00 AM UTC
 */
function scheduleRetraining() {
  const task = cron.schedule('0 2 * * 0', runRetraining, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info('ML retraining job scheduled: every Sunday at 02:00 UTC');
  return task;
}

module.exports = {
  scheduleRetraining,
  runRetraining, /* exported for manual triggering / testing */
};
