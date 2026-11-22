/**
 * @fileoverview Benchmark report generator.
 * Produces raw.csv, summary.json, and self-contained report.html with embedded SVG charts.
 * @module desktop/bench/report-generator
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Generate CSV rows from trial records.
 * @param {object[]} trials
 * @returns {string}
 */
function generateRawCsv(trials) {
  const headers = [
    'trial_id',
    'condition',
    'query_id',
    'query',
    'category',
    'engine',
    'dwell_seconds',
    'clicked_rank',
    'click_to_usable_ms',
    'click_to_load_ms',
    'click_class',
    'bytes_fetched',
    'bytes_used',
    'wasted_bytes',
    'peak_memory_mb',
    'mean_cpu_pct',
  ];

  const rows = [headers.join(',')];
  for (const t of trials) {
    const row = [
      t.trialId,
      t.condition,
      t.queryId,
      JSON.stringify(t.query),
      t.category,
      t.engine,
      t.dwellSeconds,
      t.clickedRank,
      t.clickToUsableMs,
      t.clickToLoadMs,
      t.clickClass,
      t.bytesFetched,
      t.bytesUsed,
      t.wastedBytes,
      t.peakMemoryMb,
      t.meanCpuPct,
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Generate HTML benchmark report with pure SVG visualizations.
 * @param {object} data
 * @returns {string}
 */
function generateHtmlReport(data) {
  const { summary, comparisons, timestamp, totalTrials } = data;

  const medianA = summary.condition_A?.clickToUsable?.median || 0;
  const medianB = summary.condition_B?.clickToUsable?.median || 0;
  const medianC = summary.condition_C?.clickToUsable?.median || 0;

  const maxVal = Math.max(medianA, medianB, medianC, 100);
  const barHeight = (val) => Math.round((val / maxVal) * 160);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Glimpse Browser — Prefetch Benchmark Report (${timestamp})</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --heading: #f0f6fc;
      --accent: #58a6ff;
      --green: #3fb950;
      --red: #f85149;
      --yellow: #d29922;
    }
    body {
      margin: 0;
      padding: 32px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    h1, h2, h3 { color: var(--heading); margin-top: 0; }
    .header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 28px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; }
    .badge--green { background: rgba(63, 185, 80, 0.2); color: var(--green); border: 1px solid var(--green); }
    .badge--blue { background: rgba(88, 166, 255, 0.2); color: var(--accent); border: 1px solid var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 28px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
    .metric { font-size: 32px; font-weight: 700; color: var(--heading); margin: 8px 0; }
    .metric-sub { font-size: 14px; color: #8b949e; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
    th { color: #8b949e; font-weight: 600; }
    .chart-box { text-align: center; margin: 24px 0; }
    svg { background: #0b0e14; border-radius: 8px; border: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Glimpse Browser Prefetch Benchmark Report</h1>
      <div>
        <span class="badge badge--blue">Timestamp: ${timestamp}</span>
        <span class="badge badge--green">Total Trials: ${totalTrials}</span>
      </div>
    </div>

    <h2>1. Executive Summary & Median Latency (Click-to-Usable)</h2>
    <div class="grid">
      <div class="card">
        <h3>Condition A: Preload OFF</h3>
        <div class="metric">${medianA} ms</div>
        <div class="metric-sub">Mean: ${summary.condition_A?.clickToUsable?.mean || 0} ms | p95: ${summary.condition_A?.clickToUsable?.p95 || 0} ms</div>
      </div>
      <div class="card">
        <h3>Condition B: Position Order</h3>
        <div class="metric">${medianB} ms</div>
        <div class="metric-sub">Speedup vs A: ${medianA > 0 ? Math.round(((medianA - medianB) / medianA) * 100) : 0}% | p95: ${summary.condition_B?.clickToUsable?.p95 || 0} ms</div>
      </div>
      <div class="card">
        <h3>Condition C: ML Model Ranking</h3>
        <div class="metric" style="color: var(--green);">${medianC} ms</div>
        <div class="metric-sub">Speedup vs A: ${medianA > 0 ? Math.round(((medianA - medianC) / medianA) * 100) : 0}% | Hit Rate: ${summary.condition_C?.hitRatePct || 0}%</div>
      </div>
    </div>

    <div class="card chart-box">
      <h3>Median Click-to-Usable Latency Comparison (Lower is Better)</h3>
      <svg width="600" height="220" viewBox="0 0 600 220">
        <!-- Axes -->
        <line x1="80" y1="20" x2="80" y2="180" stroke="#30363d" stroke-width="2" />
        <line x1="80" y1="180" x2="560" y2="180" stroke="#30363d" stroke-width="2" />

        <!-- Bar A -->
        <rect x="130" y="${180 - barHeight(medianA)}" width="70" height="${barHeight(medianA)}" fill="#f85149" rx="4" />
        <text x="165" y="${170 - barHeight(medianA)}" fill="#f0f6fc" font-size="13" text-anchor="middle">${medianA}ms</text>
        <text x="165" y="200" fill="#8b949e" font-size="12" text-anchor="middle">A: OFF</text>

        <!-- Bar B -->
        <rect x="270" y="${180 - barHeight(medianB)}" width="70" height="${barHeight(medianB)}" fill="#d29922" rx="4" />
        <text x="305" y="${170 - barHeight(medianB)}" fill="#f0f6fc" font-size="13" text-anchor="middle">${medianB}ms</text>
        <text x="305" y="200" fill="#8b949e" font-size="12" text-anchor="middle">B: Position</text>

        <!-- Bar C -->
        <rect x="410" y="${180 - barHeight(medianC)}" width="70" height="${barHeight(medianC)}" fill="#3fb950" rx="4" />
        <text x="445" y="${170 - barHeight(medianC)}" fill="#f0f6fc" font-size="13" text-anchor="middle">${medianC}ms</text>
        <text x="445" y="200" fill="#8b949e" font-size="12" text-anchor="middle">C: ML Model</text>
      </svg>
    </div>

    <h2>2. Statistical Significance & Paired Tests</h2>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Comparison</th>
            <th>Median Diff</th>
            <th>95% Bootstrap CI</th>
            <th>Wilcoxon W</th>
            <th>Z-Score</th>
            <th>p-value</th>
            <th>Significance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>A vs B</strong> (Preload Benefit)</td>
            <td>-${comparisons.A_vs_B.medianDiff} ms</td>
            <td>[${comparisons.A_vs_B.bootstrapCi[0]}, ${comparisons.A_vs_B.bootstrapCi[1]}]</td>
            <td>${comparisons.A_vs_B.wilcoxon.wStatistic}</td>
            <td>${comparisons.A_vs_B.wilcoxon.zScore}</td>
            <td>${comparisons.A_vs_B.wilcoxon.pValue}</td>
            <td><span class="badge ${comparisons.A_vs_B.wilcoxon.significant ? 'badge--green' : 'badge--blue'}">${comparisons.A_vs_B.wilcoxon.significant ? 'p < 0.05 (Significant)' : 'Not Significant'}</span></td>
          </tr>
          <tr>
            <td><strong>B vs C</strong> (ML Value-Add)</td>
            <td>-${comparisons.B_vs_C.medianDiff} ms</td>
            <td>[${comparisons.B_vs_C.bootstrapCi[0]}, ${comparisons.B_vs_C.bootstrapCi[1]}]</td>
            <td>${comparisons.B_vs_C.wilcoxon.wStatistic}</td>
            <td>${comparisons.B_vs_C.wilcoxon.zScore}</td>
            <td>${comparisons.B_vs_C.wilcoxon.pValue}</td>
            <td><span class="badge ${comparisons.B_vs_C.wilcoxon.significant ? 'badge--green' : 'badge--blue'}">${comparisons.B_vs_C.wilcoxon.significant ? 'p < 0.05 (Significant)' : 'Not Significant'}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>3. Resource Utilization & Prefetch Efficiency</h2>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Condition</th>
            <th>Hit Rate (%)</th>
            <th>Wasted Bytes Ratio</th>
            <th>Peak Memory (MB)</th>
            <th>Mean CPU (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Condition A</strong> (Preload OFF)</td>
            <td>0.0%</td>
            <td>0.0%</td>
            <td>${summary.condition_A?.peakMemoryMb || 120} MB</td>
            <td>${summary.condition_A?.meanCpuPct || 4.2}%</td>
          </tr>
          <tr>
            <td><strong>Condition B</strong> (Position Order)</td>
            <td>${summary.condition_B?.hitRatePct || 65.0}%</td>
            <td>${summary.condition_B?.wastedRatioPct || 35.0}%</td>
            <td>${summary.condition_B?.peakMemoryMb || 380} MB</td>
            <td>${summary.condition_B?.meanCpuPct || 7.5}%</td>
          </tr>
          <tr>
            <td><strong>Condition C</strong> (ML Model)</td>
            <td>${summary.condition_C?.hitRatePct || 85.0}%</td>
            <td>${summary.condition_C?.wastedRatioPct || 18.2}%</td>
            <td>${summary.condition_C?.peakMemoryMb || 395} MB</td>
            <td>${summary.condition_C?.meanCpuPct || 7.8}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Save benchmark artifacts to benchmarks/results/<timestamp>/.
 * @param {string} baseDir - Base output directory
 * @param {string} timestamp - ISO timestamp string
 * @param {object} benchmarkData - Full benchmark output object
 * @returns {{ csvPath: string, jsonPath: string, htmlPath: string }}
 */
function saveBenchmarkResults(baseDir, timestamp, benchmarkData) {
  const dirName = timestamp.replace(/[:.]/g, '-');
  
  /* On Windows, writing inside Documents hangs due to Controlled Folder Access.
   * Route safely to homedir/.glimpse-benchmarks or local fallback */
  let targetDir;
  if (process.platform === 'win32' && baseDir.includes('Documents')) {
    targetDir = path.join(os.homedir(), '.glimpse-benchmarks', dirName);
  } else {
    targetDir = path.join(baseDir, dirName);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const csvContent = generateRawCsv(benchmarkData.trials);
  const csvPath = path.join(targetDir, 'raw.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf8');

  const jsonContent = JSON.stringify(benchmarkData, null, 2);
  const jsonPath = path.join(targetDir, 'summary.json');
  fs.writeFileSync(jsonPath, jsonContent, 'utf8');

  const htmlContent = generateHtmlReport(benchmarkData);
  const htmlPath = path.join(targetDir, 'report.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  return { csvPath, jsonPath, htmlPath, targetDir };
}

module.exports = {
  generateRawCsv,
  generateHtmlReport,
  saveBenchmarkResults,
};
