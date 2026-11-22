#!/usr/bin/env node
/**
 * @fileoverview Benchmark CLI entry point.
 * Usage:
 *   node bench/index.js --smoke
 *   node bench/index.js --full
 */

'use strict';

const { runBenchmark } = require('./runner');

async function main() {
  const isSmoke = process.argv.includes('--smoke');
  console.log('================================================================');
  console.log(`  Glimpse Browser: Prefetch Benchmark Suite (${isSmoke ? 'SMOKE' : 'FULL'})`);
  console.log('================================================================');

  try {
    const result = await runBenchmark({ smoke: isSmoke });

    console.log(`\n✓ Benchmark completed across ${result.queriesEvaluated} queries (${result.totalTrials} trials)`);
    console.log('\nResults Summary (Click-to-Usable Latency):');
    console.log(`  Condition A (Preload OFF):     Median = ${result.summary.condition_A.clickToUsable.median} ms (Mean = ${result.summary.condition_A.clickToUsable.mean} ms)`);
    console.log(`  Condition B (Position Order):  Median = ${result.summary.condition_B.clickToUsable.median} ms (Hit Rate = ${result.summary.condition_B.hitRatePct}%)`);
    console.log(`  Condition C (ML Model):        Median = ${result.summary.condition_C.clickToUsable.median} ms (Hit Rate = ${result.summary.condition_C.hitRatePct}%)`);

    console.log('\nStatistical Significance:');
    console.log(`  A vs B (Preload Impact):       Diff = -${result.comparisons.A_vs_B.medianDiff} ms, 95% CI = [${result.comparisons.A_vs_B.bootstrapCi.join(', ')}], p = ${result.comparisons.A_vs_B.wilcoxon.pValue}`);
    console.log(`  B vs C (ML Value-Add):         Diff = -${result.comparisons.B_vs_C.medianDiff} ms, 95% CI = [${result.comparisons.B_vs_C.bootstrapCi.join(', ')}], p = ${result.comparisons.B_vs_C.wilcoxon.pValue}`);

    console.log('\nArtifacts Generated:');
    console.log(`  CSV:  ${result.artifactPaths.csvPath}`);
    console.log(`  JSON: ${result.artifactPaths.jsonPath}`);
    console.log(`  HTML: ${result.artifactPaths.htmlPath}`);
    console.log('================================================================\n');
  } catch (err) {
    console.error('Benchmark execution failed:', err);
    process.exit(1);
  }
}

main();
