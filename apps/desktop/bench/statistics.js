/**
 * @fileoverview Statistical analysis for Glimpse prefetch benchmarks.
 * Computes paired Wilcoxon signed-rank tests and bootstrap confidence
 * intervals for latency differences across benchmark conditions.
 *
 * Pure JavaScript, Node built-ins only, zero external dependencies.
 * @module desktop/bench/statistics
 */

'use strict';

/**
 * Compute descriptive summary statistics for an array of numbers.
 * @param {number[]} values
 * @returns {object}
 */
function computeSummaryStats(values) {
  if (!values || values.length === 0) {
    return { count: 0, mean: 0, median: 0, std: 0, min: 0, max: 0, p25: 0, p75: 0, p95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n > 1 ? n - 1 : 1);
  const std = Math.sqrt(variance);

  const quantile = (q) => {
    const pos = (n - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };

  return {
    count: n,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(quantile(0.5) * 100) / 100,
    std: Math.round(std * 100) / 100,
    min: sorted[0],
    max: sorted[n - 1],
    p25: Math.round(quantile(0.25) * 100) / 100,
    p75: Math.round(quantile(0.75) * 100) / 100,
    p95: Math.round(quantile(0.95) * 100) / 100,
  };
}

/**
 * Paired Wilcoxon Signed-Rank Test.
 * Tests if the median of differences between paired observations differs from zero.
 * @param {number[]} x - Measurements under condition 1
 * @param {number[]} y - Measurements under condition 2 (paired with x)
 * @returns {{ wStatistic: number, zScore: number, pValue: number, significant: boolean, n: number }}
 */
function pairedWilcoxonTest(x, y) {
  if (!x || !y || x.length !== y.length || x.length < 3) {
    return { wStatistic: 0, zScore: 0, pValue: 1, significant: false, n: 0 };
  }

  // 1. Calculate differences and exclude zero differences
  const diffs = [];
  for (let i = 0; i < x.length; i++) {
    const d = x[i] - y[i];
    if (Math.abs(d) > 1e-9) {
      diffs.push({ diff: d, absDiff: Math.abs(d) });
    }
  }

  const n = diffs.length;
  if (n < 3) {
    return { wStatistic: 0, zScore: 0, pValue: 1, significant: false, n };
  }

  // 2. Sort by absolute difference
  diffs.sort((a, b) => a.absDiff - b.absDiff);

  // 3. Assign ranks, handling ties with average rank
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && Math.abs(diffs[j].absDiff - diffs[j + 1].absDiff) < 1e-9) {
      j++;
    }
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) {
      diffs[k].rank = avgRank;
    }
    i = j + 1;
  }

  // 4. Sum positive and negative ranks
  let wPlus = 0;
  let wMinus = 0;
  for (const item of diffs) {
    if (item.diff > 0) wPlus += item.rank;
    else wMinus += item.rank;
  }

  const wStat = Math.min(wPlus, wMinus);

  // 5. Normal approximation for Z-score (valid for n >= 10, reasonable for n >= 5)
  const meanW = (n * (n + 1)) / 4;
  const stdW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  const zScore = (wPlus - meanW) / (stdW || 1);

  // Standard normal two-tailed CDF approximation (Abramowitz and Stegun)
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));

  return {
    wStatistic: Math.round(wStat * 100) / 100,
    zScore: Math.round(zScore * 1000) / 1000,
    pValue: Math.max(0, Math.min(1, Math.round(pValue * 10000) / 10000)),
    significant: pValue < 0.05,
    n,
  };
}

/**
 * Standard Normal Cumulative Distribution Function (Abramowitz & Stegun 26.2.17).
 * @param {number} x
 * @returns {number}
 */
function normalCdf(x) {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t *
      (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp(-x * x / 2.0) * t *
      (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

/**
 * Compute 95% bootstrap confidence interval on the median difference between paired arrays.
 * @param {number[]} x
 * @param {number[]} y
 * @param {number} [iterations=1000]
 * @returns {[number, number]}
 */
function computeBootstrapCiMedianDiff(x, y, iterations = 1000) {
  if (!x || !y || x.length !== y.length || x.length === 0) {
    return [0, 0];
  }

  const diffs = x.map((v, i) => v - y[i]);
  const n = diffs.length;
  const medians = new Float64Array(iterations);

  for (let b = 0; b < iterations; b++) {
    const sample = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      sample[i] = diffs[Math.floor(Math.random() * n)];
    }
    sample.sort();
    const mid = Math.floor(n / 2);
    medians[b] = n % 2 === 0 ? (sample[mid - 1] + sample[mid]) / 2 : sample[mid];
  }

  medians.sort();
  const lowerIdx = Math.floor(iterations * 0.025);
  const upperIdx = Math.floor(iterations * 0.975);

  return [
    Math.round(medians[lowerIdx] * 100) / 100,
    Math.round(medians[upperIdx] * 100) / 100,
  ];
}

module.exports = {
  computeSummaryStats,
  pairedWilcoxonTest,
  computeBootstrapCiMedianDiff,
};
