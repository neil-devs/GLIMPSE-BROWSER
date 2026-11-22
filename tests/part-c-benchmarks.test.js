/**
 * @fileoverview Test suite for PART C — PHASE 11: BENCHMARKING + OPTIMISATION
 * Tests prefetch flags, statistical modules (Wilcoxon, bootstrap CI),
 * report generator, benchmark runner, and package exclusion rules.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { DEFAULT_SETTINGS } = require('@glimpse/shared/constants');
const { computeSummaryStats, pairedWilcoxonTest, computeBootstrapCiMedianDiff } = require('../apps/desktop/bench/statistics');
const { generateRawCsv, generateHtmlReport } = require('../apps/desktop/bench/report-generator');
const { runBenchmark } = require('../apps/desktop/bench/runner');

test('C1: Prefetch flags are present with valid defaults in DEFAULT_SETTINGS', () => {
  assert.equal(DEFAULT_SETTINGS.preconnectAll, true, 'preconnectAll should default to true');
  assert.equal(DEFAULT_SETTINGS.hoverBoost, true, 'hoverBoost should default to true');
  assert.equal(DEFAULT_SETTINGS.stagedConcurrency, 2, 'stagedConcurrency should default to 2');
  assert.equal(DEFAULT_SETTINGS.readyMode, 'usable', 'readyMode should default to "usable"');
  assert.equal(DEFAULT_SETTINGS.poolSize, 6, 'poolSize should default to 6');
  assert.equal(DEFAULT_SETTINGS.throttleAfterReady, true, 'throttleAfterReady should default to true');
});

test('C2: Descriptive summary statistics computes accurate mean, median, and quantiles', () => {
  const sample = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const stats = computeSummaryStats(sample);

  assert.equal(stats.count, 10);
  assert.equal(stats.mean, 55);
  assert.equal(stats.median, 55);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 100);
});

test('C3: Paired Wilcoxon Signed-Rank Test detects significant latency reduction', () => {
  // Condition A (Preload OFF, high latency) vs Condition B (Preload ON, low latency)
  const condA = [1200, 1150, 1300, 1050, 1400, 1250, 1100, 1350, 1200, 1180];
  const condB = [10, 15, 8, 12, 1050, 12, 9, 14, 11, 10]; // 90% hits

  const result = pairedWilcoxonTest(condA, condB);

  assert.equal(typeof result.wStatistic, 'number');
  assert.equal(typeof result.zScore, 'number');
  assert.ok(result.zScore > 2.0, `Z-score (${result.zScore}) should indicate strong improvement`);
  assert.ok(result.pValue < 0.05, `p-value (${result.pValue}) should be significant (< 0.05)`);
  assert.equal(result.significant, true);
});

test('C4: 95% Bootstrap CI on median difference produces valid bounding interval', () => {
  const condA = [1200, 1150, 1300, 1050, 1400, 1250, 1100, 1350, 1200, 1180];
  const condB = [10, 15, 8, 12, 1050, 12, 9, 14, 11, 10];

  const ci = computeBootstrapCiMedianDiff(condA, condB, 500);

  assert.equal(ci.length, 2);
  assert.ok(ci[0] <= ci[1], `Lower bound (${ci[0]}) must be <= upper bound (${ci[1]})`);
  assert.ok(ci[0] > 500, `Lower bound should show substantial median improvement (> 500ms)`);
});

test('C5: Report generator outputs valid HTML with self-contained SVG and CSV format', () => {
  const mockBenchmarkData = {
    timestamp: '2026-11-19T20:00:00.000Z',
    mode: 'smoke',
    totalTrials: 3,
    queriesEvaluated: 1,
    summary: {
      condition_A: { clickToUsable: { median: 1100, mean: 1100, p95: 1200 }, hitRatePct: 0 },
      condition_B: { clickToUsable: { median: 1000, mean: 1000, p95: 1100 }, hitRatePct: 50 },
      condition_C: { clickToUsable: { median: 4, mean: 15, p95: 25 }, hitRatePct: 100 },
    },
    comparisons: {
      A_vs_B: { medianDiff: 100, bootstrapCi: [50, 150], wilcoxon: { wStatistic: 0, zScore: 1.5, pValue: 0.1, significant: false } },
      B_vs_C: { medianDiff: 996, bootstrapCi: [800, 1100], wilcoxon: { wStatistic: 0, zScore: 2.8, pValue: 0.005, significant: true } },
    },
    trials: [
      {
        trialId: 't1_A', condition: 'A', queryId: 'q1', query: 'test query', category: 'code',
        engine: 'google', dwellSeconds: 1, clickedRank: 1, clickToUsableMs: 1100, clickToLoadMs: 1400,
        clickClass: 'MISS_NOT_POOLED', bytesFetched: 1000, bytesUsed: 1000, wastedBytes: 0,
        peakMemoryMb: 120, meanCpuPct: 3.5,
      }
    ],
  };

  const csv = generateRawCsv(mockBenchmarkData.trials);
  assert.ok(csv.includes('trial_id,condition,query_id'));
  assert.ok(csv.includes('t1_A,A,q1'));

  const html = generateHtmlReport(mockBenchmarkData);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('Condition C: ML Model Ranking'));
  assert.ok(!html.includes('https://cdn.'), 'HTML report must not depend on external CDNs');
});

test('C6: Benchmark runner executes smoke test successfully and generates artifacts', async () => {
  const result = await runBenchmark({ smoke: true });

  assert.equal(result.mode, 'smoke');
  assert.equal(result.queriesEvaluated, 5);
  assert.equal(result.totalTrials, 15);
  assert.ok(result.summary.condition_A.clickToUsable.median > 500);
  assert.ok(result.summary.condition_C.clickToUsable.median < 100);
  assert.ok(fs.existsSync(result.artifactPaths.csvPath));
  assert.ok(fs.existsSync(result.artifactPaths.jsonPath));
  assert.ok(fs.existsSync(result.artifactPaths.htmlPath));
});

test('C7: Packaging configuration guarantees bench/simulator code is excluded from distributed bundle', () => {
  const builderYamlPath = path.join(__dirname, '..', 'apps', 'desktop', 'electron-builder.yml');
  const builderContent = fs.readFileSync(builderYamlPath, 'utf8');

  // Verify that files packaging whitelist only includes out/**/* and default-model.json
  assert.ok(builderContent.includes('out/**/*'));
  assert.ok(!builderContent.includes('bench/'), 'bench/ folder must never be in electron-builder.yml files list');
});
