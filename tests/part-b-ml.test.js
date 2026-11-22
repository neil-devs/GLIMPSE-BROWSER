/**
 * @fileoverview Part B ML Unit & Parity Tests (Phase 10).
 *
 * Tests:
 * 1. GBDT fit & prediction on toy XOR and linear data.
 * 2. AUC-ROC, PR-AUC, MRR, HR@3 on known analytical vectors.
 * 3. Bootstrap CI calculation on known distribution.
 * 4. Tree traversal parity between cloud GBDT.predictProba and desktop click-predictor (|diff| < 1e-6).
 * 5. Promotion gate logic (promotes when CI lower > 0 and no logloss regression).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { GBDT } = require('../apps/cloud-api/src/ml/gbdt');
const { computeAucRoc, computePrAuc, computeRankingMetrics, computeBootstrapCi, evaluateModel } = require('../apps/cloud-api/src/ml/evaluate');
const { exportModel } = require('../apps/cloud-api/src/ml/export-model');
const { evaluateFlatTree, predictProba, verifyParity } = require('../apps/desktop/src/main/ml/click-predictor');
const { checkPromotionGate } = require('../apps/cloud-api/src/ml/train');

test('GBDT: fit and prediction on separable linear dataset', () => {
  // Linearly separable dataset: y = 1 if x[0] > 0.5, else 0
  const X = [
    [0.1, 0.2],
    [0.2, 0.1],
    [0.8, 0.9],
    [0.9, 0.7],
    [0.15, 0.3],
    [0.85, 0.6],
  ];
  const y = [0, 0, 1, 1, 0, 1];

  const model = new GBDT({
    nEstimators: 10,
    learningRate: 0.2,
    maxDepth: 3,
    minChildWeight: 0.1,
    lambda: 1.0,
    seed: 42,
  });

  model.fit(X, y);
  const preds = model.predictProba(X);

  // Predictions on class 0 should be low (< 0.4), on class 1 should be high (> 0.6)
  assert.ok(preds[0] < 0.4, `Expected class 0 pred < 0.4, got ${preds[0]}`);
  assert.ok(preds[1] < 0.4, `Expected class 0 pred < 0.4, got ${preds[1]}`);
  assert.ok(preds[2] > 0.6, `Expected class 1 pred > 0.6, got ${preds[2]}`);
  assert.ok(preds[3] > 0.6, `Expected class 1 pred > 0.6, got ${preds[3]}`);
});

test('Evaluation Metrics: AUC-ROC, PR-AUC, MRR, HR@3 on analytical vectors', () => {
  // Perfect ranking: all positive labels scored higher than negative labels
  const yTrue = [0, 0, 1, 1];
  const yPred = [0.1, 0.2, 0.8, 0.9];

  const auc = computeAucRoc(yTrue, yPred);
  assert.strictEqual(auc, 1.0, `Expected AUC 1.0, got ${auc}`);

  const prAuc = computePrAuc(yTrue, yPred);
  assert.ok(prAuc > 0.9, `Expected PR-AUC > 0.9, got ${prAuc}`);

  // Two search groups: group 0 and group 1
  // Group 0: 3 links, clicked position 2 (0-indexed 1) -> model rank 1 (hit@1), pos rank 2 (hit@3)
  // Group 1: 3 links, clicked position 1 (0-indexed 0) -> model rank 1 (hit@1), pos rank 1 (hit@1)
  const searchGroups = [
    {
      links: [
        { y: 0, score: 0.1, position: 1 },
        { y: 1, score: 0.9, position: 2 },
        { y: 0, score: 0.2, position: 3 },
      ],
    },
    {
      links: [
        { y: 1, score: 0.95, position: 1 },
        { y: 0, score: 0.4, position: 2 },
        { y: 0, score: 0.1, position: 3 },
      ],
    },
  ];

  const ranking = computeRankingMetrics(searchGroups, 'score', true);

  assert.strictEqual(ranking.hr1, 1.0, 'Model top-1 should have found clicked link in both groups');
  assert.strictEqual(ranking.hr3, 1.0, 'Model top-3 should be 1.0');
  assert.strictEqual(ranking.mrr, 1.0, 'Model MRR should be 1.0');
});

test('Bootstrap Confidence Interval: valid coverage on difference distribution', () => {
  const modelHr3 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]; // 90%
  const baselineHr3 = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; // 20%
  const ci = computeBootstrapCi(modelHr3, baselineHr3, 500);

  assert.ok(typeof ci.lower === 'number');
  assert.ok(typeof ci.upper === 'number');
  assert.ok(ci.lower <= ci.upper, 'Lower bound must be <= upper bound');
  assert.ok(ci.lower > 0, 'Lower bound should be strictly positive for superior model');
});

test('Tree Traversal Parity: Cloud GBDT vs Desktop Predictor (|diff| < 1e-6)', () => {
  const X = [
    [0.1, 0.2, 1, 0],
    [0.9, 0.8, 0, 1],
    [0.3, 0.4, 1, 0],
    [0.7, 0.6, 0, 1],
  ];
  const y = [0, 1, 0, 1];

  const cloudGbdt = new GBDT({
    nEstimators: 5,
    learningRate: 0.1,
    maxDepth: 3,
    minChildWeight: 0.1,
    lambda: 1.0,
    seed: 123,
  });
  cloudGbdt.fit(X, y);

  const exported = exportModel({
    model: cloudGbdt,
    versionString: 'v2.parity-test.0',
  });

  const modelJson = exported.modelJson;

  // Verify parity for each sample
  for (let i = 0; i < X.length; i++) {
    const cloudPred = cloudGbdt.predictProba([X[i]])[0];
    const desktopPred = predictProba(modelJson, X[i]);

    const diff = Math.abs(cloudPred - desktopPred);
    assert.ok(diff < 1e-6, `Parity discrepancy sample ${i}: cloud=${cloudPred}, desktop=${desktopPred}, diff=${diff}`);
  }

  // Golden vector verification
  const parityOk = verifyParity(modelJson);
  assert.strictEqual(parityOk, true, 'Desktop verifyParity should succeed on exported model with golden vectors');
});

test('Promotion Gate: verifies promotion criteria', () => {
  // Case 1: Better model with positive CI and better/equal logloss -> PROMOTE
  const candidateMetrics = {
    logLoss: 0.35,
    aucRoc: 0.82,
    ranking: {
      model: { hr3: 0.80 },
      baseline: { hr3: 0.60 },
      bootstrapCi: { lower: 0.05, upper: 0.35 },
    },
  };

  const prevModel = {
    metrics: {
      logLoss: 0.36,
      aucRoc: 0.80,
    },
  };

  const gate1 = checkPromotionGate(candidateMetrics, prevModel);
  assert.strictEqual(gate1.promote, true, 'Should promote when lower CI > 0 and no logloss regression');

  // Case 2: Candidate does NOT beat baseline (lower CI <= 0) -> REJECT
  const candidateWeak = {
    logLoss: 0.35,
    ranking: {
      model: { hr3: 0.61 },
      baseline: { hr3: 0.60 },
      bootstrapCi: { lower: -0.05, upper: 0.07 },
    },
  };
  const gate2 = checkPromotionGate(candidateWeak, prevModel);
  assert.strictEqual(gate2.promote, false, 'Should reject when lower CI <= 0');

  // Case 3: Logloss regression > 0.02 -> REJECT
  const candidateRegressed = {
    logLoss: 0.45, // significant regression from 0.36
    ranking: {
      model: { hr3: 0.80 },
      baseline: { hr3: 0.60 },
      bootstrapCi: { lower: 0.05, upper: 0.35 },
    },
  };
  const gate3 = checkPromotionGate(candidateRegressed, prevModel);
  assert.strictEqual(gate3.promote, false, 'Should reject on logloss regression');
});
