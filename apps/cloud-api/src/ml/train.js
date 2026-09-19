/**
 * @fileoverview ML model training.
 * Implements a Gradient Boosted Decision Tree ensemble in pure JavaScript.
 * Uses ml-cart for individual decision tree stumps and builds the ensemble
 * via gradient boosting with logistic loss.
 * @module cloud-api/ml/train
 */

'use strict';

const { DecisionTreeClassifier } = require('ml-cart');
const { buildTrainingDataset, FEATURE_NAMES } = require('./feature-engineer');
const logger = require('../utils/logger');

/**
 * Shuffle an array in place using Fisher-Yates.
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Split dataset into train and test sets.
 * @param {number[][]} X - Feature matrix
 * @param {number[]} y - Labels
 * @param {number} testRatio - Fraction for test set (0-1)
 * @returns {{ trainX, trainY, testX, testY }}
 */
function trainTestSplit(X, y, testRatio = 0.2) {
  const indices = shuffle([...Array(X.length).keys()]);
  const splitIdx = Math.floor(X.length * (1 - testRatio));

  const trainX = [];
  const trainY = [];
  const testX = [];
  const testY = [];

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (i < splitIdx) {
      trainX.push(X[idx]);
      trainY.push(y[idx]);
    } else {
      testX.push(X[idx]);
      testY.push(y[idx]);
    }
  }

  return { trainX, trainY, testX, testY };
}

/**
 * Sigmoid function.
 * @param {number} x
 * @returns {number}
 */
function sigmoid(x) {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

/**
 * Train a Gradient Boosted Decision Tree classifier.
 *
 * Algorithm:
 * 1. Start with initial predictions (log-odds of base rate)
 * 2. For each iteration:
 *    a. Compute pseudo-residuals (negative gradient of log-loss)
 *    b. Fit a shallow decision tree to the residuals
 *    c. Add the tree's predictions scaled by learning_rate
 *
 * @param {Array<object>} rawRows - Raw link event rows from the database
 * @param {object} [options]
 * @param {number} [options.nEstimators=100] - Number of boosting rounds
 * @param {number} [options.maxDepth=4] - Max depth of individual trees
 * @param {number} [options.learningRate=0.1] - Shrinkage factor
 * @returns {{ model: object, testX: number[][], testY: number[], featureNames: string[] }}
 */
async function trainModel(rawRows, options = {}) {
  const nEstimators = options.nEstimators || 100;
  const maxDepth = options.maxDepth || 4;
  const learningRate = options.learningRate || 0.1;

  logger.info('Building training dataset...');
  const { X, y, featureNames } = buildTrainingDataset(rawRows);

  logger.info(`Dataset built: ${X.length} samples, ${featureNames.length} features`);
  logger.info(`Positive class ratio: ${(y.filter(v => v === 1).length / y.length * 100).toFixed(1)}%`);

  /* Split 80/20 */
  const { trainX, trainY, testX, testY } = trainTestSplit(X, y, 0.2);

  logger.info(`Train: ${trainX.length}, Test: ${testX.length}`);

  /* Gradient Boosting implementation */
  const trees = [];

  /* Initial prediction: log-odds of the base rate */
  const positiveRate = trainY.filter(v => v === 1).length / trainY.length;
  const initialPrediction = Math.log(positiveRate / (1 - positiveRate + 1e-10));

  /* Current predictions (raw logits) for each training sample */
  const F = new Float64Array(trainX.length).fill(initialPrediction);

  for (let round = 0; round < nEstimators; round++) {
    /* Compute probabilities */
    const probs = F.map(sigmoid);

    /* Compute pseudo-residuals (negative gradient of log-loss) */
    const residuals = new Array(trainX.length);
    for (let i = 0; i < trainX.length; i++) {
      residuals[i] = trainY[i] - probs[i];
    }

    /* Fit a decision tree to the residuals */
    const tree = new DecisionTreeClassifier({
      maxDepth,
      minNumSamples: 5,
    });

    /* Convert residuals to binary labels for the tree */
    const residualLabels = residuals.map(r => r >= 0 ? 1 : 0);

    try {
      tree.train(trainX, residualLabels);
    } catch (err) {
      logger.debug(`Tree ${round} training failed, skipping`, { error: err.message });
      continue;
    }

    /* Get tree predictions and compute leaf values */
    const treePreds = tree.predict(trainX);

    /* Calculate the average residual per leaf prediction class */
    const leafSums = {};
    const leafCounts = {};
    for (let i = 0; i < trainX.length; i++) {
      const pred = treePreds[i];
      if (!leafSums[pred]) {
        leafSums[pred] = 0;
        leafCounts[pred] = 0;
      }
      leafSums[pred] += residuals[i];
      leafCounts[pred] += 1;
    }

    const leafValues = {};
    for (const key of Object.keys(leafSums)) {
      leafValues[key] = leafSums[key] / leafCounts[key];
    }

    /* Update F with scaled tree predictions */
    for (let i = 0; i < trainX.length; i++) {
      const leafPred = treePreds[i];
      const leafVal = leafValues[leafPred] || 0;
      F[i] += learningRate * leafVal;
    }

    /* Store the tree and its leaf values for export */
    trees.push({
      tree,
      leafValues,
      round,
    });

    /* Log progress every 20 rounds */
    if ((round + 1) % 20 === 0) {
      const currentProbs = F.map(sigmoid);
      const currentPreds = currentProbs.map(p => p >= 0.5 ? 1 : 0);
      const accuracy = currentPreds.reduce(
        (acc, p, i) => acc + (p === trainY[i] ? 1 : 0), 0
      ) / trainX.length;
      logger.debug(`Round ${round + 1}/${nEstimators}: train accuracy = ${(accuracy * 100).toFixed(1)}%`);
    }
  }

  const model = {
    type: 'gradient_boosted_trees',
    trees,
    initialPrediction,
    learningRate,
    nEstimators: trees.length,
    maxDepth,
    threshold: 0.5,
  };

  logger.info(`Training complete: ${trees.length} trees built`);

  return { model, testX, testY, featureNames };
}

module.exports = { trainModel };
