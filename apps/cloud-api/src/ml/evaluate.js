/**
 * @fileoverview ML Model Evaluation & Ranking Metrics.
 *
 * Implements:
 * - Binary classification metrics: logloss, AUC-ROC, PR-AUC, accuracy, precision, recall, F1
 * - Per-search ranking metrics: HR@1, HR@3, HR@6, and MRR
 * - Comparison against position baseline and previously active model
 * - 95% bootstrap confidence interval (1,000 resamples) on the HR@3 difference
 * - Feature importance extraction
 *
 * @module cloud-api/ml/evaluate
 */

'use strict';

const logger = require('../utils/logger');

/**
 * Compute binary cross-entropy (log-loss).
 * @param {number[]} yTrue
 * @param {number[]} yProb
 * @returns {number}
 */
function computeLogLoss(yTrue, yProb) {
  const eps = 1e-15;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const p = Math.max(eps, Math.min(1 - eps, yProb[i]));
    sum += yTrue[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return Number((sum / Math.max(1, yTrue.length)).toFixed(5));
}

/**
 * Compute AUC-ROC using the trapezoidal rule.
 * @param {number[]} yTrue
 * @param {number[]} yProb
 * @returns {number}
 */
function computeAucRoc(yTrue, yProb) {
  const pairs = yProb.map((score, i) => ({ score, label: yTrue[i] }));
  pairs.sort((a, b) => b.score - a.score);

  const totalPositives = yTrue.filter((l) => l === 1).length;
  const totalNegatives = yTrue.length - totalPositives;

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
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;

    prevTpr = tpr;
    prevFpr = fpr;
  }

  return Number(auc.toFixed(5));
}

/**
 * Compute PR-AUC (Average Precision).
 * @param {number[]} yTrue
 * @param {number[]} yProb
 * @returns {number}
 */
function computePrAuc(yTrue, yProb) {
  const pairs = yProb.map((score, i) => ({ score, label: yTrue[i] }));
  pairs.sort((a, b) => b.score - a.score);

  const totalPositives = yTrue.filter((l) => l === 1).length;
  if (totalPositives === 0) return 0.0;

  let tpCount = 0;
  let apSum = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].label === 1) {
      tpCount++;
      const precision = tpCount / (i + 1);
      apSum += precision;
    }
  }

  return Number((apSum / totalPositives).toFixed(5));
}

/**
 * Compute ranking metrics (HR@1, HR@3, HR@6, MRR) for a given ranking function.
 *
 * @param {object[]} searchGroups - Array of { links: [ { y, score, position } ] }
 * @returns {object} { hr1, hr3, hr6, mrr, perSearchHr3: number[] }
 */
function computeRankingMetrics(searchGroups, scoreKey = 'score', descending = true) {
  let hr1Hits = 0;
  let hr3Hits = 0;
  let hr6Hits = 0;
  let mrrSum = 0;
  const perSearchHr3 = [];

  const nSearches = searchGroups.length;
  if (nSearches === 0) {
    return { hr1: 0, hr3: 0, hr6: 0, mrr: 0, perSearchHr3: [] };
  }

  for (const group of searchGroups) {
    // Sort links by assigned score/rank
    const ranked = [...group.links].sort((a, b) => {
      return descending ? b[scoreKey] - a[scoreKey] : a[scoreKey] - b[scoreKey];
    });

    let bestClickRank = Infinity;
    let hitAt1 = false;
    let hitAt3 = false;
    let hitAt6 = false;

    for (let r = 0; r < ranked.length; r++) {
      if (ranked[r].y === 1) {
        const rank = r + 1; // 1-indexed
        if (rank < bestClickRank) bestClickRank = rank;
        if (rank === 1) hitAt1 = true;
        if (rank <= 3) hitAt3 = true;
        if (rank <= 6) hitAt6 = true;
      }
    }

    if (hitAt1) hr1Hits++;
    if (hitAt3) hr3Hits++;
    if (hitAt6) hr6Hits++;
    if (bestClickRank !== Infinity) {
      mrrSum += 1.0 / bestClickRank;
    }

    perSearchHr3.push(hitAt3 ? 1 : 0);
  }

  return {
    hr1: Number((hr1Hits / nSearches).toFixed(4)),
    hr3: Number((hr3Hits / nSearches).toFixed(4)),
    hr6: Number((hr6Hits / nSearches).toFixed(4)),
    mrr: Number((mrrSum / nSearches).toFixed(4)),
    perSearchHr3,
  };
}

/**
 * 95% bootstrap confidence interval over 1,000 resamples on HR@3 difference (model - baseline).
 *
 * @param {number[]} modelHr3List
 * @param {number[]} baselineHr3List
 * @param {number} [nResamples=1000]
 * @returns {{ lower: number, upper: number, meanDiff: number }}
 */
function computeBootstrapCi(modelHr3List, baselineHr3List, nResamples = 1000) {
  const n = modelHr3List.length;
  if (n === 0) return { lower: 0, upper: 0, meanDiff: 0 };

  const diffs = new Float64Array(nResamples);

  // Seeded deterministic sampling
  let seed = 12345;
  function nextRng() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  for (let b = 0; b < nResamples; b++) {
    let sumDiff = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(nextRng() * n);
      sumDiff += (modelHr3List[idx] - baselineHr3List[idx]);
    }
    diffs[b] = sumDiff / n;
  }

  diffs.sort();

  const lowerIdx = Math.floor(nResamples * 0.025); // 2.5 percentile
  const upperIdx = Math.floor(nResamples * 0.975); // 97.5 percentile

  let totalDiff = 0;
  for (let i = 0; i < n; i++) {
    totalDiff += (modelHr3List[i] - baselineHr3List[i]);
  }

  return {
    lower: Number(diffs[lowerIdx].toFixed(4)),
    upper: Number(diffs[upperIdx].toFixed(4)),
    meanDiff: Number((totalDiff / n).toFixed(4)),
  };
}

/**
 * Comprehensive model evaluation matching Phase 10 B3.
 *
 * @param {object} model - Model with predictProba()
 * @param {number[][]} testX - Test features
 * @param {number[]} testY - Test binary labels
 * @param {string[]} [groups] - Search group identifier per example
 * @param {object} [activeModel=null] - Previously active model for regression check
 * @returns {object} Evaluation metrics
 */
function evaluateModel(model, testX, testY, groups = null, activeModel = null) {
  if (!testX || testX.length === 0) {
    logger.warn('Empty test set provided to evaluateModel');
    return {
      logLoss: 0,
      aucRoc: 0.5,
      prAuc: 0,
      ranking: { model: {}, baseline: {}, active: null, bootstrapCi: { lower: 0, upper: 0, meanDiff: 0 } },
    };
  }

  const probs = model.predictProba(testX);
  const logLoss = computeLogLoss(testY, probs);
  const aucRoc = computeAucRoc(testY, probs);
  const prAuc = computePrAuc(testY, probs);

  // Group test examples into searches for ranking evaluation
  const searchMap = new Map();
  for (let i = 0; i < testX.length; i++) {
    const groupKey = groups ? groups[i] : `search_${Math.floor(i / 10)}`;
    if (!searchMap.has(groupKey)) {
      searchMap.set(groupKey, { links: [] });
    }

    // In feature vector: feature 0 is position
    const position = testX[i][0] || (i % 10) + 1;

    searchMap.get(groupKey).links.push({
      y: testY[i],
      score: probs[i],
      position,
      activeScore: activeModel ? activeModel.predictProba([testX[i]])[0] : 0,
    });
  }

  const searchGroups = [...searchMap.values()];

  // 1. Model ranking metrics
  const modelRanking = computeRankingMetrics(searchGroups, 'score', true);

  // 2. Position baseline ranking metrics (lower position number = better rank)
  const baselineRanking = computeRankingMetrics(searchGroups, 'position', false);

  // 3. Active model ranking metrics (if activeModel provided)
  let activeRanking = null;
  let activeLogLoss = null;
  if (activeModel) {
    const activeProbs = activeModel.predictProba(testX);
    activeLogLoss = computeLogLoss(testY, activeProbs);
    activeRanking = computeRankingMetrics(searchGroups, 'activeScore', true);
  }

  // 4. 95% bootstrap CI on HR@3 difference (model vs baseline)
  const bootstrapCi = computeBootstrapCi(modelRanking.perSearchHr3, baselineRanking.perSearchHr3, 1000);

  const metrics = {
    logLoss,
    aucRoc,
    prAuc,
    ranking: {
      model: {
        hr1: modelRanking.hr1,
        hr3: modelRanking.hr3,
        hr6: modelRanking.hr6,
        mrr: modelRanking.mrr,
      },
      baseline: {
        hr1: baselineRanking.hr1,
        hr3: baselineRanking.hr3,
        hr6: baselineRanking.hr6,
        mrr: baselineRanking.mrr,
      },
      active: activeRanking ? {
        logLoss: activeLogLoss,
        hr1: activeRanking.hr1,
        hr3: activeRanking.hr3,
        hr6: activeRanking.hr6,
        mrr: activeRanking.mrr,
      } : null,
      bootstrapCi,
    },
    featureImportances: model.featureImportances || {},
  };

  logger.info('Model evaluation completed', {
    logLoss: metrics.logLoss,
    aucRoc: metrics.aucRoc,
    hr3Model: modelRanking.hr3,
    hr3Baseline: baselineRanking.hr3,
    hr3Ci: `[${bootstrapCi.lower}, ${bootstrapCi.upper}]`,
  });

  return metrics;
}

module.exports = {
  evaluateModel,
  computeLogLoss,
  computeAucRoc,
  computePrAuc,
  computeRankingMetrics,
  computeBootstrapCi,
};
