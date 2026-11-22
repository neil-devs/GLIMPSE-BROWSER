# Glimpse Browser — ML Pipeline & Click Predictor (v2.0)

## Overview

Glimpse uses an on-device machine learning model to predict which search result link a user is most likely to click. This prediction drives prefetch priority — high-probability links are preloaded into hidden `WebContentsView` slots, ensuring the page the user clicks opens with near-zero latency.

The ML architecture follows a **cloud-train, on-device-infer** pattern:
- **Cloud (`apps/cloud-api`)**: Trains a Histogram-binned Gradient Boosted Decision Tree (GBDT) using Newton-Raphson second-order leaf updates and L2 regularization. Evaluates ranking metrics (HR@1, HR@3, HR@6, MRR) against position baselines with 95% bootstrap confidence intervals.
- **Shared (`packages/shared/src/features.js`)**: Single source of truth for the 39-feature schema (`FEATURE_SCHEMA_VERSION = 2`), preventing train/serve feature skew.
- **Desktop (`apps/desktop`)**: Evaluates flat-array decision trees with zero external npm dependencies. Golden vectors ensure mathematical parity ($|\text{diff}| < 10^{-6}$) before activating any downloaded model.

---

## 1. Feature Engineering & Schema Parity

Both training (`apps/cloud-api`) and desktop inference (`apps/desktop`) import `buildFeatures(ctx, domainStats)` from `@glimpse/shared/features`.

### 39-Dimensional Feature Vector

| Index | Feature Name | Range | Description |
|---|---|---|---|
| 0 | `position` | 1..20 | 1-indexed link position on the search result page |
| 1 | `position_normalized` | [0, 1] | `position / visibleCount` |
| 2 | `is_top_3` | {0, 1} | Flag indicating whether rank is $\le 3$ |
| 3 | `visible_on_load` | {0, 1} | Was the link visible within 1,000 ms of page load? |
| 4–9 | `engine_google`..`engine_yandex` | {0, 1} | One-hot search engine encoding (6 engines) |
| 10–16 | `tld_com`..`tld_other` | {0, 1} | One-hot TLD class (`com`, `org`, `net`, `edu`, `gov`, `in`, `other`) |
| 17 | `url_depth` | 0..8 | Slash count in URL path (normalized: depth / 8) |
| 18 | `link_text_length_bucket` | 0..3 | Bucketed anchor text length ($< 20$, $20..49$, $50..99$, $\ge 100$) |
| 19 | `query_length_bucket` | 0..3 | Bucketed query length ($< 15$, $15..39$, $40..79$, $\ge 80$) |
| 20 | `word_count` | 1..8 | Query word count (clamped to 8, normalized) |
| 21 | `has_digit` | {0, 1} | Does query contain a numeric digit? |
| 22 | `has_year` | {0, 1} | Does query contain a 4-digit year (1990..2040)? |
| 23 | `is_question` | {0, 1} | Starts with question word or ends with `?` |
| 24 | `has_site_operator` | {0, 1} | Contains `site:` filter operator |
| 25–28 | `script_latin`..`script_other` | {0, 1} | One-hot script classification (`latin`, `cjk`, `cyrillic`, `other`) |
| 29–34 | `intent_informational`..`intent_news` | {0, 1} | Coarse query intent flags |
| 35–36 | `window_width_bucket`, `window_height_bucket` | 0..3 | Window resolution classes ($< 1024$, $1024..1439$, $1440..1919$, $\ge 1920$) |
| 37 | `domain_smoothed_ctr` | [0, 1] | Empirical Bayes smoothed CTR: $\frac{clicks + \alpha}{impressions + \alpha + \beta}$ |
| 38 | `domain_seen` | {0, 1} | 1 if domain exists in registry or prior sessions, else 0 |

> [!IMPORTANT]
> **Data Leakage Prohibition**: Neither `wasPrefetched`, `prefetchDuration`, nor `clickClass` may ever enter the feature vector. These signals are unknown at decision time.

---

## 2. Model Architecture: Flat-Array GBDT

### Histogram-Based Split Finding
- Numerical features are quantized into 64 uniform bins for fast histogram aggregation.
- Splits optimize standard second-order loss (negative log-likelihood):
  $$G = \sum r_i, \quad H = \sum p_i (1 - p_i)$$
  $$\text{Gain} = \frac{G_L^2}{H_L + \lambda} + \frac{G_R^2}{H_R + \lambda} - \frac{(G_L + G_R)^2}{H_L + H_R + \lambda}$$
- Leaf values are regularized via Newton-Raphson update:
  $$\gamma = -\frac{G}{H + \lambda}$$
  where $\lambda = 1.0$ (L2 regularization) and learning rate $\eta = 0.1$.

### Flat-Array Serialization Format
Trees serialize to flat parallel typed arrays for microsecond traversal without object allocations:

```json
{
  "modelVersion": "v2.0.0",
  "baseScore": -1.2458,
  "learningRate": 0.1,
  "featureSchemaVersion": 2,
  "featureNames": ["position", "position_normalized", ...],
  "trees": [
    {
      "feature": [0, 37, -1, -1, -1],
      "threshold": [2.5, 0.45, 0, 0, 0],
      "left": [1, 3, -1, -1, -1],
      "right": [2, 4, -1, -1, -1],
      "value": [0, 0, -0.42, 0.81, 0.15]
    }
  ],
  "checksumSha256": "4a71...",
  "goldenVectors": [
    { "features": [1, 0.1, 1, ...], "expectedScore": 0.724915 }
  ]
}
```

### Zero-Dependency Inference Engine
```javascript
function evaluateTree(tree, x) {
  let node = 0;
  while (tree.feature[node] !== -1) {
    node = x[tree.feature[node]] <= tree.threshold[node]
      ? tree.left[node]
      : tree.right[node];
  }
  return tree.value[node];
}

function predict(model, x) {
  let raw = model.baseScore;
  for (const tree of model.trees) {
    raw += model.learningRate * evaluateTree(tree, x);
  }
  return 1 / (1 + Math.exp(-raw)); // Sigmoid
}
```

---

## 3. Evaluation & Automated Promotion Gate

A newly trained candidate model is never promoted automatically unless it satisfies four strict statistical gates:

1. **HR@3 vs Position Baseline**: Candidate model must beat the position-order baseline on top-3 hit rate by $\ge +0.02$ (+2.0%).
2. **Positive Bootstrap Confidence Interval**: The 95% bootstrap CI lower bound of $(\text{HR@3}_{\text{model}} - \text{HR@3}_{\text{baseline}})$ must exceed $0$ across 1,000 bootstrap resamples.
3. **No Metric Regression**: $\text{AUC-ROC}_{\text{new}} \ge \text{AUC-ROC}_{\text{active}} - 0.01$ and $\text{LogLoss}_{\text{new}} \le \text{LogLoss}_{\text{active}} + 0.02$.
4. **Golden Vector Parity**: Serialized model must match cloud predictions on all golden test vectors to within $10^{-6}$.

If the promotion gate fails, training completes with status `rejected`, preserving the currently active production model.

---

## 4. Desktop Model Loader & Resilient Fallback

`apps/desktop/src/main/ml/model-loader.js` guarantees prefetch ranking is always operational:

```
┌────────────────────────────────────────────────────────┐
│ 1. Download candidate from GET /model/latest           │
│    Validate canonical SHA256 checksum                  │
│    Validate |predict(v) - expected| < 1e-6             │
├────────────────────────────────────────────────────────┤
│ 2. If valid: atomically write to local cache           │
│    (active-model.json)                                 │
├────────────────────────────────────────────────────────┤
│ 3. If remote fails or invalid:                         │
│    Load previous cached model from local disk          │
├────────────────────────────────────────────────────────┤
│ 4. If local disk corrupted:                            │
│    Load bundled resources/default-model.json (v2.0.0)  │
├────────────────────────────────────────────────────────┤
│ 5. If bundled model fails:                             │
│    Pure deterministic position sorting (1, 2, 3...)    │
└────────────────────────────────────────────────────────┘
```
