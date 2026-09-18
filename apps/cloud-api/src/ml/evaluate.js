/**
 * @fileoverview ML model evaluation.
 * Computes accuracy, precision, recall, F1, and AUC-ROC from predictions.
 * @module cloud-api/ml/evaluate
 */

'use strict';

const logger = require('../utils/logger');

/**
 * Sigmoid function.
 */
function sigmoid(x) {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

/**
 * Get raw logits from the model for a set of samples.
 * @param {object} model - Trained model
 * @param {number[][]} X - Feature matrix
 * @returns {number[]} Raw logit scores
 */
function getLogits(model, X) {
  const logits = new Array(X.length).fill(model.initialPrediction);

  for (const { tree, leafValues } of model.trees) {
    const treePreds = tree.predict(X);
    for (let i = 0; i < X.length; i++) {
      const leafPred = treePreds[i];
      const leafVal = leafValues[leafPred] || 0;
      logits[i] += model.learningRate * leafVal;
    }
  }

  return logits;
}

/**
 * Evaluate a trained model on test data.
 *
 * @param {object} model - Trained gradient boosted model
 * @param {number[][]} testX - Test feature matrix
 * @param {number[]} testY - Test labels (0 or 1)
 * @returns {{ accuracy: number, precision: number, recall: number, f1: number, aucRoc: number }}
 */
function evaluateModel(model, testX, testY) {
  if (!testX.length) {
    logger.warn('Empty test set — returning zero metrics');
    return { accuracy: 0, precision: 0, recall: 0, f1: 0, aucRoc: 0 };
  }

  /* Get probability scores */
  const logits = getLogits(model, testX);
  const probs = logits.map(sigmoid);
  const predictions = probs.map(p => p >= model.threshold ? 1 : 0);

  /* Confusion matrix */
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < testY.length; i++) {
    if (predictions[i] === 1 && testY[i] === 1) tp++;
    else if (predictions[i] === 1 && testY[i] === 0) fp++;
    else if (predictions[i] === 0 && testY[i] === 0) tn++;
    else fn++;
  }

  /* Metrics */
  const accuracy = (tp + tn) / testY.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;

  /* AUC-ROC calculation using the trapezoidal rule */
  const aucRoc = computeAucRoc(probs, testY);

  const metrics = {
    accuracy: parseFloat(accuracy.toFixed(4)),
    precision: parseFloat(precision.toFixed(4)),
    recall: parseFloat(recall.toFixed(4)),
    f1: parseFloat(f1.toFixed(4)),
    aucRoc: parseFloat(aucRoc.toFixed(4)),
  };

  logger.info('Model evaluation metrics', {
    ...metrics,
    confusionMatrix: { tp, fp, tn, fn },
    testSize: testY.length,
  });

  return metrics;
}

/**
 * Compute AUC-ROC using the trapezoidal rule.
 * @param {number[]} scores - Probability scores
 * @param {number[]} labels - True binary labels
 * @returns {number} AUC-ROC value between 0 and 1
 */
function computeAucRoc(scores, labels) {
  /* Create pairs and sort by descending score */
  const pairs = scores.map((score, i) => ({ score, label: labels[i] }));
  pairs.sort((a, b) => b.score - a.score);

  const totalPositives = labels.filter(l => l === 1).length;
  const totalNegatives = labels.length - totalPositives;

  if (totalPositives === 0 || totalNegatives === 0) return 0.5;

  let tpr = 0;
  let fpr = 0;
  let prevTpr = 0;
  let prevFpr = 0;
  let auc = 0;

  let tpCount = 0;
  let fpCount = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].label === 1) {
      tpCount++;
    } else {
      fpCount++;
    }

    tpr = tpCount / totalPositives;
    fpr = fpCount / totalNegatives;

    /* Trapezoidal rule: area += (fpr - prevFpr) * (tpr + prevTpr) / 2 */
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;

    prevTpr = tpr;
    prevFpr = fpr;
  }

  return auc;
}

module.exports = { evaluateModel, getLogits };
