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
const MIN_TRAINING_ROWS = 100;
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
 * Generate synthetic seed data for initial model training.
 * Creates realistic click patterns based on known user behavior:
 * - Top 3 results get ~60-70% of clicks
 * - Higher positions get more clicks
 * - Well-known domains get more clicks
 *
 * @param {number} [count=500] - Number of synthetic rows to generate
 * @returns {Array<object>}
 */
function generateSeedData(count = 500) {
  const engines = ['google', 'bing', 'duckduckgo', 'yahoo'];
  const domains = [
    'wikipedia.org', 'stackoverflow.com', 'github.com', 'medium.com',
    'reddit.com', 'youtube.com', 'amazon.com', 'nytimes.com',
    'bbc.com', 'developer.mozilla.org', 'docs.python.org',
    'example.com', 'randomsite.io', 'unknown-blog.net',
  ];
  const queries = [
    'how to learn javascript', 'best programming language 2024',
    'react vs vue', 'node.js tutorial', 'python machine learning',
    'css flexbox guide', 'rest api design', 'git merge vs rebase',
    'docker tutorial', 'kubernetes basics', 'aws vs gcp',
    'typescript handbook', 'next.js tutorial', 'web security best practices',
  ];

  const rows = [];
  for (let i = 0; i < count; i++) {
    const position = Math.floor(Math.random() * 10) + 1;
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const engine = engines[Math.floor(Math.random() * engines.length)];
    const query = queries[Math.floor(Math.random() * queries.length)];
    const isTopDomain = ['wikipedia.org', 'stackoverflow.com', 'github.com',
      'developer.mozilla.org'].includes(domain);
    const isTop3 = position <= 3;

    /* Click probability model: position + domain + randomness */
    let clickProb = Math.max(0, 0.8 - position * 0.08);
    if (isTopDomain) clickProb += 0.15;
    if (isTop3) clickProb += 0.10;
    clickProb = Math.min(1, clickProb);

    const wasClicked = Math.random() < clickProb;

    rows.push({
      url: `https://${domain}/page-${i}`,
      domain,
      linkPosition: position,
      wasVisibleOnLoad: Math.random() < (isTop3 ? 0.95 : 0.6),
      wasPrefetched: true,
      prefetchDurationMs: Math.floor(Math.random() * 2000) + 100,
      wasClicked,
      searchEngine: engine,
      queryText: query,
    });
  }

  return rows;
}

/**
 * Run retraining with synthetic seed data.
 * Used for initial model bootstrap when no real telemetry data exists yet.
 */
async function runSeedTraining() {
  logger.info('Running seed training with synthetic data...');
  const seedData = generateSeedData(500);

  try {
    const { model, testX, testY, featureNames } = await trainModel(seedData);
    const metrics = evaluateModel(model, testX, testY);
    logger.info('Seed model evaluation', { metrics });

    const { filePath, fileSizeBytes, versionString } = await exportModel(
      model, featureNames, metrics
    );
    logger.info('Seed model exported', { filePath, fileSizeBytes });

    /* Deactivate any existing active model */
    await supabase
      .from('ml_model_versions')
      .update({ is_active: false })
      .eq('is_active', true)
      .eq('model_type', 'click_predictor');

    /* Insert seed model as active */
    await supabase.from('ml_model_versions').insert({
      version_string: versionString,
      model_type: 'click_predictor',
      training_data_count: seedData.length,
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

    logger.info('Seed model deployed successfully', { version: versionString });
  } catch (err) {
    logger.error('Seed training failed', { error: err.message, stack: err.stack });
  }
}

/* CLI support: node retrain-model.job.js --seed */
if (require.main === module) {
  if (process.argv.includes('--seed')) {
    runSeedTraining().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    runRetraining().then(() => process.exit(0)).catch(() => process.exit(1));
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
  runRetraining,
  runSeedTraining,
  generateSeedData,
};
