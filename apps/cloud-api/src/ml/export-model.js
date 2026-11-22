/**
 * @fileoverview Export a trained GBDT model into a portable, high-performance JSON format.
 *
 * Format guarantees:
 * - Flat arrays per tree: feature, threshold, left, right, value
 * - baseScore / baseMargin
 * - featureNames (from @glimpse/shared/features)
 * - schemaVersion (FEATURE_SCHEMA_VERSION = 2)
 * - domainStats (Bayesian-smoothed CTR lookup table)
 * - Platt calibration parameters (A, B)
 * - sha256 checksum of model JSON
 * - Golden test vectors for train/serve parity verification
 * - Stored directly in ml_model_versions.model_json
 *
 * @module cloud-api/ml/export-model
 */

'use strict';

const crypto = require('node:crypto');
const { FEATURE_NAMES, FEATURE_SCHEMA_VERSION, buildFeatures } = require('@glimpse/shared/features');
const logger = require('../utils/logger');

/**
 * Generate 5 representative golden test vectors and compute their expected probabilities.
 * @param {object} model - Model with predictProba()
 * @param {object} domainStats
 * @returns {Array<{ name: string, input: number[], expectedProba: number }>}
 */
function generateGoldenVectors(model, domainStats) {
  const cases = [
    {
      name: 'top1_google_wikipedia',
      ctx: { position: 1, visibleCount: 10, visibleOnLoad: true, engine: 'google', domain: 'en.wikipedia.org', tld: 'org' },
    },
    {
      name: 'top3_github_code_query',
      ctx: { position: 3, visibleCount: 10, visibleOnLoad: true, engine: 'google', domain: 'github.com', tld: 'com', queryFeatures: { intent: { code: 1 }, wordCount: 4 } },
    },
    {
      name: 'pos6_duckduckgo_generic',
      ctx: { position: 6, visibleCount: 10, visibleOnLoad: false, engine: 'duckduckgo', domain: 'example.org', tld: 'org' },
    },
    {
      name: 'pos10_bottom_unknown',
      ctx: { position: 10, visibleCount: 10, visibleOnLoad: false, engine: 'bing', domain: 'unknown-blog.xyz', tld: 'xyz' },
    },
    {
      name: 'pos2_transactional_amazon',
      ctx: { position: 2, visibleCount: 10, visibleOnLoad: true, engine: 'google', domain: 'amazon.com', tld: 'com', queryFeatures: { intent: { transactional: 1 } } },
    },
  ];

  return cases.map((c) => {
    const vec = buildFeatures(c.ctx, domainStats);
    const prob = model.predictProba([vec])[0];
    return {
      name: c.name,
      input: vec,
      expectedProba: Number(prob.toFixed(6)),
    };
  });
}

/**
 * Compute SHA256 checksum of stringified JSON.
 * @param {string} str
 * @returns {string} Hex hash
 */
function computeSha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Serialize and package model into canonical model_json object.
 *
 * @param {object} params
 * @param {object} params.model - Fitted GBDT instance
 * @param {object} params.metrics - Evaluation metrics from evaluateModel
 * @param {object} params.domainStats - Domain statistics dictionary
 * @param {string} [params.versionString] - e.g. 'v2.1.0'
 * @param {object} [params.config] - Training hyperparameters
 * @param {string} [params.datasetHash] - Hash of training dataset
 * @returns {{ modelJson: object, checksumSha256: string, versionString: string }}
 */
function exportModel(params) {
  const {
    model,
    metrics = {},
    domainStats = {},
    versionString = `v2.${Math.floor(Date.now() / 1000) % 100000}.0`,
    config = {},
    datasetHash = 'dataset_hash_placeholder',
  } = params;

  // 1. Generate golden vectors for parity testing
  const goldenVectors = generateGoldenVectors(model, domainStats);

  // 2. Build model JSON structure with flat arrays
  const modelJson = {
    schemaVersion: FEATURE_SCHEMA_VERSION,
    version: versionString,
    modelType: 'histogram_gbdt',
    createdAt: new Date().toISOString(),
    baseScore: model.baseScore,
    baseMargin: model.baseMargin,
    learningRate: model.learningRate,
    featureNames: FEATURE_NAMES,
    trees: model.trees.map((t) => ({
      feature: t.feature,
      threshold: t.threshold,
      left: t.left,
      right: t.right,
      value: t.value.map((v) => Number(v.toFixed(6))),
    })),
    domainStats,
    // Optional Platt calibration parameters (identity default: A=1, B=0)
    calibration: {
      method: 'platt',
      a: 1.0,
      b: 0.0,
    },
    goldenVectors,
    metrics,
    config,
    datasetHash,
  };

  // 3. Compute checksum over canonical JSON (excluding checksum field itself)
  const canonicalString = JSON.stringify(modelJson);
  const checksumSha256 = computeSha256(canonicalString);
  modelJson.checksumSha256 = checksumSha256;

  logger.info('Model successfully serialized for cloud export', {
    version: versionString,
    treeCount: modelJson.trees.length,
    checksumSha256,
    goldenVectorCount: goldenVectors.length,
  });

  return {
    modelJson,
    checksumSha256,
    versionString,
  };
}

module.exports = {
  exportModel,
  generateGoldenVectors,
  computeSha256,
};
