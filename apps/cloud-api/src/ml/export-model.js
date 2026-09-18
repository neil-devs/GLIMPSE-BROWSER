/**
 * @fileoverview Export a trained model to a portable JSON format.
 * The exported format can be loaded on the desktop client and evaluated
 * with a tiny custom evaluator — no ML npm packages needed client-side.
 * @module cloud-api/ml/export-model
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { FEATURE_NAMES } = require('./feature-engineer');
const logger = require('../utils/logger');

/**
 * Recursively serialize a decision tree node to a plain object.
 * ml-decisiontree trees have a root property with .left, .right, .splitColumn,
 * .splitValue, and .distribution (leaf) properties.
 *
 * @param {object} node - ml-decisiontree tree node
 * @returns {object} Serialized node
 */
function serializeTreeNode(node) {
  if (!node) return null;

  /* Leaf node — has a distribution or category */
  if (node.distribution !== undefined || node.left === undefined) {
    return {
      type: 'leaf',
      prediction: node.category !== undefined ? node.category : 0,
      distribution: node.distribution || null,
    };
  }

  /* Internal node — has split condition */
  return {
    type: 'split',
    featureIndex: node.splitColumn,
    threshold: node.splitValue,
    left: serializeTreeNode(node.left),
    right: serializeTreeNode(node.right),
  };
}

/**
 * Serialize a trained gradient boosted model to portable JSON.
 * The client evaluator walks each tree, follows split decisions,
 * gets leaf values, and sums up: initialPrediction + sum(learningRate * leafValue)
 * Then applies sigmoid for the final probability.
 *
 * @param {object} model - Trained model from train.js
 * @param {string[]} featureNames - Feature names in order
 * @param {object} metrics - Evaluation metrics
 * @returns {{ filePath: string, fileSizeBytes: number, versionString: string }}
 */
async function exportModel(model, featureNames, metrics) {
  const versionString = `1.${Math.floor(Date.now() / 1000) % 100000}.0`;

  const exportData = {
    version: versionString,
    trainedAt: new Date().toISOString(),
    modelType: 'gradient_boosted_trees',
    features: featureNames || [...FEATURE_NAMES],
    featureCount: (featureNames || FEATURE_NAMES).length,
    hyperparameters: {
      nEstimators: model.nEstimators,
      maxDepth: model.maxDepth,
      learningRate: model.learningRate,
    },
    metrics: metrics || {},
    initialPrediction: model.initialPrediction,
    learningRate: model.learningRate,
    threshold: model.threshold,
    trees: model.trees.map(({ tree, leafValues, round }) => ({
      round,
      leafValues: Object.fromEntries(
        Object.entries(leafValues).map(([k, v]) => [k, parseFloat(v.toFixed(6))])
      ),
      root: serializeTreeNode(tree.root || tree),
    })),
  };

  /* Write to models/latest.json */
  const outputDir = path.resolve(__dirname, 'models');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, 'latest.json');
  const jsonStr = JSON.stringify(exportData, null, 0); /* compact for file size */

  fs.writeFileSync(filePath, jsonStr, 'utf8');

  const stats = fs.statSync(filePath);

  logger.info('Model exported to JSON', {
    filePath,
    fileSizeBytes: stats.size,
    version: versionString,
    treeCount: exportData.trees.length,
  });

  return {
    filePath,
    fileSizeBytes: stats.size,
    versionString,
  };
}

module.exports = { exportModel };
