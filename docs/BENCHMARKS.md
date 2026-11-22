# Glimpse Browser — Prefetch Benchmarking Suite

## Overview

The Glimpse benchmarking suite rigorously measures page open latency, cache hit rates, wasted bandwidth, and resource utilization across three experimental conditions:
- **Condition A (Control / Preload OFF)**: Standard browser navigation. No prefetching, no background pooling. Links load cold upon click.
- **Condition B (Baseline / Position Order)**: Links are preloaded strictly by ordinal position on the search result page (ranks 1, 2, 3).
- **Condition C (Treatment / ML Model Ranking)**: Links are scored and prioritized by the on-device Gradient Boosted Decision Tree (`click-predictor`). Top-ranked links are preloaded into the preload pool.

---

## 1. Metrics & Measurement Methodology

| Metric | Target | Description |
|---|---|---|
| **Click-to-Usable (ms)** | $\le 5$ ms (HIT) | Milliseconds from user click to interactive visual display |
| **Click-to-Load (ms)** | Total Load | Milliseconds from click until `did-finish-load` |
| **Click Class** | $\ge 70\%$ HIT_READY | Classifies click outcome: `HIT_READY`, `HIT_LOADING`, `MISS_NOT_POOLED`, `MISS_FAILED`, `MISS_EVICTED` |
| **Wasted Prefetch Ratio** | $< 35\%$ | Ratio of prefetched bytes not navigated to by the user |
| **Peak Memory (MB)** | $< 500$ MB | Peak working set size across all renderer processes via `app.getAppMetrics()` |
| **Mean CPU (%)** | $< 10\%$ | Mean processor utilization during prefetching and idle pool states |

---

## 2. Statistical Analysis

To ensure prefetch speedups and ML model ranking improvements are statistically significant and not noise:

1. **Paired Wilcoxon Signed-Rank Test**:
   - Compares paired observations on the exact same search query.
   - Evaluates:
     - **A vs B**: Measures the absolute benefit of speculative preloading over cold loading.
     - **B vs C**: Measures the incremental value of machine-learned ranking over a naive top-N position heuristic.
   - Outputs test statistic $W$, normal approximation $Z$, and two-tailed $p$-value ($p < 0.05$ threshold).

2. **95% Bootstrap Confidence Intervals**:
   - Resamples paired latency differences 1,000 times with replacement.
   - Reports the empirical 2.5th and 97.5th percentiles of the median difference:
     $$\text{CI}_{95\%} = [\Delta_{0.025}, \Delta_{0.975}]$$

---

## 3. Running Benchmarks

### Quick Smoke Test (5 queries)
```bash
npm run bench:smoke
```
Runs a rapid 15-trial verification (5 queries $\times$ 3 conditions) and outputs:
- Console statistical summary with $Z$-scores and $p$-values
- `benchmarks/results/<timestamp>/raw.csv`
- `benchmarks/results/<timestamp>/summary.json`
- `benchmarks/results/<timestamp>/report.html` (interactive SVG charts, zero CDN dependencies)

### Full Benchmark Suite (40+ queries)
```bash
npm run bench:prefetch
```
Executes the full test catalog across all search engine categories (code, navigational, informational, transactional).

---

## 4. Live Dev Overlay HUD

In both development and benchmarking runs, developers can inspect live pool dynamics without opening external dev tools:
- **Shortcut**: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS).
- **HUD Telemetry**:
  - Pool slots in memory (active / ready)
  - Estimated pool RAM
  - Session Hit Rate (%)
  - Average HIT Swap Latency (ms)
  - Average MISS Render Time (ms)
  - Active ML Model Version & Architecture

---

## 5. Security & Packaging Guarantees

In accordance with Glimpse production requirements:
- Benchmarking scripts (`apps/desktop/bench/**`) and trial catalogs are **completely excluded** from production distributions (`electron-builder.yml`).
- Telemetry reporting is automatically bypassed during benchmark runs when `GLIMPSE_BENCH=1`.
