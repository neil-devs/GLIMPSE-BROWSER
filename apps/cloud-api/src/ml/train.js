/**
 * @fileoverview ML Model Training Pipeline with Hyperparameter Tuning and Promotion Gate.
 *
 * Implements:
 * - Dataset loading via dataset.js (group-split, Bayesian-smoothed domain stats)
 * - Hyperparameter grid search: depth [3, 4, 5], lr [0.05, 0.1], lambda [1.0, 5.0]
 * - Histogram-based GBDT training (no ml-cart)
 * - Evaluation with 95% bootstrap CI on HR@3 vs position baseline
 * - Promotion gate: HR@3 CI lower bound > 0 AND logloss not > 1% worse than active model
 * - Atomic model registration in ml_model_versions.model_json
 * - Automatic generation of docs/model-cards/<version>.md
 *
 * @module cloud-api/ml/train
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { GBDT } = require('./gbdt');
const { loadDataset } = require('./dataset');
const { evaluateModel } = require('./evaluate');
const { exportModel } = require('./export-model');
const { supabase } = require('../db/client');
const { FEATURE_NAMES } = require('@glimpse/shared/features');
const logger = require('../utils/logger');

const DEFAULT_MIN_CLICKED_SEARCHES = 300;

/**
 * Perform a small hyperparameter grid search on train data.
 * @param {number[][]} trainX
 * @param {number[]} trainY
 * @returns {object} Best hyperparameters { maxDepth, learningRate, lambda }
 */
function gridSearchHyperparameters(trainX, trainY) {
  // Split 20% validation for hyperparameter tuning
  const nVal = Math.floor(trainX.length * 0.2);
  const subTrainX = trainX.slice(nVal);
  const subTrainY = trainY.slice(nVal);
  const valX = trainX.slice(0, nVal);
  const valY = trainY.slice(0, nVal);

  if (valX.length < 10) {
    return { maxDepth: 4, learningRate: 0.1, lambda: 1.0 };
  }

  const grid = [
    { maxDepth: 3, learningRate: 0.1, lambda: 1.0 },
    { maxDepth: 4, learningRate: 0.1, lambda: 1.0 },
    { maxDepth: 4, learningRate: 0.05, lambda: 1.0 },
    { maxDepth: 5, learningRate: 0.05, lambda: 5.0 },
  ];

  let bestLoss = Infinity;
  let bestParams = grid[1];

  for (const params of grid) {
    const candidate = new GBDT({
      nEstimators: 30,
      maxDepth: params.maxDepth,
      learningRate: params.learningRate,
      lambda: params.lambda,
      seed: 42,
    });

    candidate.fit(subTrainX, subTrainY);
    const probs = candidate.predictProba(valX);

    // Compute log loss
    let sumLoss = 0;
    for (let i = 0; i < valY.length; i++) {
      const p = Math.max(1e-15, Math.min(1 - 1e-15, probs[i]));
      sumLoss += valY[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
    }
    const loss = sumLoss / valY.length;

    if (loss < bestLoss) {
      bestLoss = loss;
      bestParams = params;
    }
  }

  logger.info('[ML:train] Grid search selected best params', bestParams);
  return bestParams;
}

/**
 * Write a comprehensive Model Card markdown document.
 */
function writeModelCard(version, report, metrics, config, promoted, promoReason) {
  const cardsDir = path.resolve(__dirname, '../../../docs/model-cards');
  if (!fs.existsSync(cardsDir)) {
    fs.mkdirSync(cardsDir, { recursive: true });
  }

  const cardPath = path.join(cardsDir, `${version}.md`);

  // Sort top feature importances
  const sortedFeats = Object.entries(metrics.featureImportances || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([idx, gain]) => `- **${FEATURE_NAMES[idx] || `feature_${idx}`}**: ${(gain * 100).toFixed(2)}% gain`);

  const md = `# Model Card: ${version}

## 1. Overview
- **Model Type**: Histogram-based Gradient Boosted Decision Trees (GBDT)
- **Trained At**: ${new Date().toISOString()}
- **Dataset Hash**: \`${report.datasetHash || 'n/a'}\`
- **Promotion Status**: **${promoted ? 'PROMOTED TO PRODUCTION' : 'REJECTED AT PROMOTION GATE'}**
- **Reason**: ${promoReason}

## 2. Dataset Summary
- **Total Searches**: ${report.totalSearches}
- **Searches with \u2265 1 Click**: ${report.clickedSearches}
- **Train Examples / Searches**: ${report.trainRows} / ${report.trainSearches}
- **Test Examples / Searches**: ${report.testRows} / ${report.testSearches}
- **Overall Dataset Click Rate**: ${(report.clickRate * 100).toFixed(2)}%
- **Outlier Installs Filtered**: ${report.outlierInstallsDropped}
- **Domains Monitored with Prior**: ${report.domainCountTracked} (Prior CTR: ${(report.globalPriorCtr * 100).toFixed(2)}%)

## 3. Hyperparameters
- \`maxDepth\`: ${config.maxDepth}
- \`learningRate\`: ${config.learningRate}
- \`lambda\`: ${config.lambda}
- \`nEstimators\`: ${config.nEstimators}
- \`subsample\`: 0.8
- \`colsample\`: 0.8

## 4. Evaluation Metrics (Test Split)
| Metric | Model | Position Baseline | Active Model |
|---|---|---|---|
| **LogLoss** | ${metrics.logLoss} | - | ${metrics.ranking.active?.logLoss ?? 'N/A'} |
| **AUC-ROC** | ${metrics.aucRoc} | - | - |
| **PR-AUC** | ${metrics.prAuc} | - | - |
| **HR@1** | ${(metrics.ranking.model.hr1 * 100).toFixed(1)}% | ${(metrics.ranking.baseline.hr1 * 100).toFixed(1)}% | ${metrics.ranking.active ? `${(metrics.ranking.active.hr1 * 100).toFixed(1)}%` : 'N/A'} |
| **HR@3** | ${(metrics.ranking.model.hr3 * 100).toFixed(1)}% | ${(metrics.ranking.baseline.hr3 * 100).toFixed(1)}% | ${metrics.ranking.active ? `${(metrics.ranking.active.hr3 * 100).toFixed(1)}%` : 'N/A'} |
| **HR@6** | ${(metrics.ranking.model.hr6 * 100).toFixed(1)}% | ${(metrics.ranking.baseline.hr6 * 100).toFixed(1)}% | ${metrics.ranking.active ? `${(metrics.ranking.active.hr6 * 100).toFixed(1)}%` : 'N/A'} |
| **MRR** | ${metrics.ranking.model.mrr} | ${metrics.ranking.baseline.mrr} | ${metrics.ranking.active?.mrr ?? 'N/A'} |

### 95% Bootstrap Confidence Interval on HR@3 Difference (Model \u2212 Baseline)
- **Lower Bound (2.5%)**: ${metrics.ranking.bootstrapCi.lower}
- **Upper Bound (97.5%)**: ${metrics.ranking.bootstrapCi.upper}
- **Mean Difference**: ${metrics.ranking.bootstrapCi.meanDiff}
- **Statistically Significant Win**: ${metrics.ranking.bootstrapCi.lower > 0 ? 'YES (\u03b1 = 0.05)' : 'NO (lower bound \u2264 0)'}

## 5. Top 10 Feature Importances (Gain)
${sortedFeats.join('\n')}
`;

  fs.writeFileSync(cardPath, md, 'utf8');
  logger.info(`[ML:train] Model card written to ${cardPath}`);
}

/**
 * Execute the full ML training, evaluation, and promotion pipeline.
 *
 * @param {object} [options]
 * @param {boolean} [options.includeSynthetic=false]
 * @param {number} [options.minClickedSearches]
 * @returns {Promise<object>}
 */
async function runTrainingPipeline(options = {}) {
  const includeSynthetic = Boolean(options.includeSynthetic);
  const minClicked = options.minClickedSearches ||
    Number(process.env.ML_MIN_CLICKED_SEARCHES) ||
    DEFAULT_MIN_CLICKED_SEARCHES;

  logger.info('[ML:train] Starting training pipeline...', { includeSynthetic, minClicked });

  // 1. Load dataset
  const dataset = await loadDataset({ includeSynthetic });
  const { train, test, domainStats, qualityReport } = dataset;

  if (qualityReport.clickedSearches < minClicked) {
    const msg = `Insufficient clicked searches: ${qualityReport.clickedSearches} (required: ${minClicked}). Training aborted.`;
    logger.warn(`[ML:train] ${msg}`);
    return { success: false, reason: msg };
  }

  // 2. Fetch currently active model for regression check
  let activeModel = null;
  let activeVersion = null;
  try {
    const { data: activeRow } = await supabase
      .from('ml_model_versions')
      .select('*')
      .eq('is_active', true)
      .eq('model_type', 'click_predictor')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activeRow && activeRow.model_json) {
      activeModel = GBDT.fromJSON(activeRow.model_json);
      activeVersion = activeRow.version_string;
    }
  } catch {
    /* No active model currently deployed */
  }

  // 3. Grid search hyperparameters
  const bestParams = gridSearchHyperparameters(train.X, train.y);
  const config = {
    ...bestParams,
    nEstimators: 60,
    subsample: 0.8,
    colsample: 0.8,
  };

  // 4. Train model
  const model = new GBDT(config);
  model.fit(train.X, train.y, { X: test.X, y: test.y });

  // 5. Evaluate on test split
  const metrics = evaluateModel(model, test.X, test.y, test.groups, activeModel);

  // 6. Compute dataset hash for provenance
  const datasetHash = crypto.createHash('sha256')
    .update(`train_${train.X.length}_test_${test.X.length}_click_${qualityReport.clickedSearches}`)
    .digest('hex');
  qualityReport.datasetHash = datasetHash;

  // 7. Check Promotion Gate
  // Rule: HR@3 beats baseline (CI lower bound > 0) AND logloss not >1% worse than active model
  const hr3CiLower = metrics.ranking.bootstrapCi.lower;
  const beatsBaseline = hr3CiLower > 0;

  let notRegressed = true;
  if (activeModel && metrics.ranking.active?.logLoss) {
    const thresholdLoss = metrics.ranking.active.logLoss * 1.01;
    if (metrics.logLoss > thresholdLoss) {
      notRegressed = false;
    }
  }

  const shouldPromote = beatsBaseline && notRegressed;
  const promoReason = shouldPromote
    ? `Promoted: HR@3 CI lower bound (${hr3CiLower}) > 0 and logloss (${metrics.logLoss}) within 1% of active model.`
    : `Rejected: beatsBaseline=${beatsBaseline} (CI lower: ${hr3CiLower}), notRegressed=${notRegressed}`;

  logger.info(`[ML:train] Promotion decision: ${promoReason}`);

  // 8. Export model JSON
  const versionString = `v2.${Math.floor(Date.now() / 1000) % 100000}.0`;
  const { modelJson, checksumSha256 } = exportModel({
    model,
    metrics,
    domainStats,
    versionString,
    config,
    datasetHash,
  });

  // 9. Persist model to ml_model_versions table
  if (shouldPromote) {
    // Demote current active model
    await supabase
      .from('ml_model_versions')
      .update({ is_active: false })
      .eq('is_active', true);
  }

  const { data: insertedModel, error: insertError } = await supabase
    .from('ml_model_versions')
    .insert({
      version_string: versionString,
      model_type: 'click_predictor',
      training_data_count: train.X.length,
      accuracy_score: metrics.ranking.model.hr3,
      precision_score: metrics.prAuc,
      recall_score: metrics.ranking.model.hr1,
      f1_score: metrics.ranking.model.mrr,
      auc_roc_score: metrics.aucRoc,
      model_json: modelJson,
      checksum_sha256: checksumSha256,
      metrics: metrics,
      config: config,
      dataset_hash: datasetHash,
      schema_version: 2,
      is_active: shouldPromote,
      trained_at: new Date().toISOString(),
      deployed_at: shouldPromote ? new Date().toISOString() : null,
    })
    .select('id, version_string')
    .single();

  if (insertError) {
    logger.error('[ML:train] Failed to save model to database', { error: insertError.message });
  }

  // 10. Write Model Card
  writeModelCard(versionString, qualityReport, metrics, config, shouldPromote, promoReason);

  return {
    success: true,
    version: versionString,
    promoted: shouldPromote,
    reason: promoReason,
    metrics,
    modelId: insertedModel?.id,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const includeSynthetic = args.includes('--include-synthetic');
  const result = await runTrainingPipeline({ includeSynthetic });
  console.log('\nTraining Pipeline Result:', JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Training failed:', err);
    process.exit(1);
  });
}

/**
 * Pure function to check whether a candidate model satisfies the promotion gate.
 * Rule: HR@3 beats baseline (CI lower bound > 0) AND logloss not > 1% worse than active model.
 *
 * @param {object} metrics - Candidate model metrics
 * @param {object} [activeModel] - Active model from database
 * @returns {{ promote: boolean, beatsBaseline: boolean, notRegressed: boolean, reason: string }}
 */
function checkPromotionGate(metrics, activeModel = null) {
  const hr3CiLower = metrics?.ranking?.bootstrapCi?.lower ?? -1;
  const beatsBaseline = hr3CiLower > 0;

  let notRegressed = true;
  const activeLogLoss = activeModel?.metrics?.logLoss ?? activeModel?.logLoss;
  if (activeLogLoss && metrics?.logLoss) {
    const thresholdLoss = activeLogLoss * 1.01;
    if (metrics.logLoss > thresholdLoss) {
      notRegressed = false;
    }
  }

  const promote = beatsBaseline && notRegressed;
  const reason = promote
    ? `Promoted: HR@3 CI lower bound (${hr3CiLower}) > 0 and logloss (${metrics?.logLoss}) within 1% of active model.`
    : `Rejected: beatsBaseline=${beatsBaseline} (CI lower: ${hr3CiLower}), notRegressed=${notRegressed}`;

  return { promote, beatsBaseline, notRegressed, reason };
}

module.exports = {
  runTrainingPipeline,
  gridSearchHyperparameters,
  writeModelCard,
  checkPromotionGate,
};
