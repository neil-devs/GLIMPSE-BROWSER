# Glimpse Browser — ML Pipeline

## Overview

Glimpse uses an on-device machine learning model to predict which search result link a user is most likely to click. This prediction determines prefetch priority — high-probability links are prefetched first, maximizing the chance that the page the user actually clicks is already loaded.

The ML pipeline runs entirely on the server for training, and entirely on the client for inference. No ML libraries are needed at runtime on the client.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD (Training)                            │
│                                                                 │
│  ┌──────────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │ Feature      │   │ Model    │   │ Model    │   │ Export  │  │
│  │ Engineering  │──→│ Training │──→│ Evaluate │──→│ to JSON │  │
│  └──────────────┘   └──────────┘   └──────────┘   └─────────┘ │
│         ↑                                              │        │
│         │ result_link_events                           ↓        │
│         │ + search_events                     models/latest.json│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                     DESKTOP (Inference)                         │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │ Feature      │   │ Tree         │   │ Prefetch Scheduler │  │
│  │ Engineering  │──→│ Evaluator    │──→│ (ranked by prob)   │  │
│  │ (same code)  │   │ (pure JS)    │   │                    │  │
│  └──────────────┘   └──────────────┘   └────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Feature Engineering

The feature engineer transforms raw link event data into a 14-dimensional numerical vector. The same feature engineering code is used on both server (training) and client (inference) to ensure consistency.

### Feature Vector (14 dimensions)

| Index | Feature Name           | Type       | Description                          |
|-------|------------------------|------------|--------------------------------------|
| 0     | `link_position_norm`   | Float 0-1  | Position normalized (1=top, 0=bottom)|
| 1     | `is_top_3`             | Boolean    | Is the link in positions 1-3?        |
| 2     | `domain_reputation`    | Float 0-1  | Domain trust score from registry     |
| 3     | `engine_google`        | Boolean    | One-hot: Google                      |
| 4     | `engine_bing`          | Boolean    | One-hot: Bing                        |
| 5     | `engine_duckduckgo`    | Boolean    | One-hot: DuckDuckGo                  |
| 6     | `engine_yahoo`         | Boolean    | One-hot: Yahoo                       |
| 7     | `engine_baidu`         | Boolean    | One-hot: Baidu                       |
| 8     | `engine_yandex`        | Boolean    | One-hot: Yandex                      |
| 9     | `query_length_short`   | Boolean    | One-hot: query < 20 chars            |
| 10    | `query_length_medium`  | Boolean    | One-hot: 20 ≤ query < 50 chars       |
| 11    | `query_length_long`    | Boolean    | One-hot: query ≥ 50 chars            |
| 12    | `was_prefetched`       | Boolean    | Was this link already prefetched?    |
| 13    | `prefetch_duration_norm`| Float 0-1 | Normalized prefetch time (0-5s→0-1)  |

### Domain Reputation Registry

A curated set of high-trust domains with manually assigned scores:

```javascript
// From packages/shared/src/constants.js
DOMAIN_REPUTATION: {
  'wikipedia.org': 1.0,
  'github.com': 0.95,
  'developer.mozilla.org': 0.95,
  'stackoverflow.com': 0.9,
  'docs.python.org': 0.9,
  // ... 20+ domains
  '_default': 0.5,
}
```

The lookup also handles `www.` prefixes and subdomain stripping (`en.wikipedia.org` → `wikipedia.org`).

## Model: Gradient Boosted Decision Trees

### Why GBDT?

1. **Fast inference**: Walking a tree is O(depth) per tree — microseconds on any device
2. **Serializable**: Trees serialize to a compact JSON format
3. **No runtime dependencies**: No numpy, tensorflow, or ML libraries needed on the client
4. **Interpretable**: Feature importances are directly readable from split frequencies
5. **Good with small data**: Works well even with only thousands of training samples

### Training Algorithm

The training pipeline implements gradient boosting from scratch using `ml-cart` for individual tree stumps:

```
Input: X (N × 14 feature matrix), y (N binary labels)

1. Initialize F₀ = log(p / (1-p))           # log-odds of base click rate
2. For round t = 1 to T:
   a. Compute probabilities: pᵢ = σ(Fᵢ)     # sigmoid
   b. Compute residuals: rᵢ = yᵢ - pᵢ       # negative gradient
   c. Fit tree hₜ to residuals               # ml-cart DecisionTreeClassifier
   d. Compute leaf values: γ = mean(rᵢ) per leaf
   e. Update: Fᵢ += η · γ(hₜ(xᵢ))          # learning rate × leaf value
3. Output: ensemble of T trees + initial prediction + learning rate
```

### Hyperparameters

| Parameter       | Default | Description                        |
|----------------|---------|------------------------------------|
| `nEstimators`  | 100     | Number of boosting rounds (trees)  |
| `maxDepth`     | 4       | Maximum tree depth                 |
| `learningRate` | 0.1     | Shrinkage factor per tree          |
| `threshold`    | 0.5     | Classification threshold           |

### Training Data Requirements

- **Minimum**: 10,000 result_link_events with `was_clicked` not null
- **Training window**: Last 30 days of data
- **Max rows**: 100,000 (randomly sampled if more)
- **Split**: 80% train / 20% test

## Model Evaluation

Metrics computed on the held-out 20% test set:

| Metric     | Description                              | Minimum to Deploy |
|-----------|------------------------------------------|-------------------|
| Accuracy  | Overall correct predictions              | 0.70              |
| Precision | True positives / predicted positives     | Logged, no gate   |
| Recall    | True positives / actual positives        | Logged, no gate   |
| F1        | Harmonic mean of precision and recall    | Logged, no gate   |
| AUC-ROC   | Area under the ROC curve (trapezoidal)   | Logged, no gate   |

A new model is only deployed if `accuracy ≥ 0.70`. Otherwise it's saved as an inactive version for comparison.

## Model Export Format

The trained model is serialized to a portable JSON format (`models/latest.json`):

```json
{
  "version": "1.23456.0",
  "trainedAt": "2024-01-15T02:00:00.000Z",
  "modelType": "gradient_boosted_trees",
  "features": ["link_position_norm", "is_top_3", ...],
  "featureCount": 14,
  "hyperparameters": { "nEstimators": 100, "maxDepth": 4, "learningRate": 0.1 },
  "metrics": { "accuracy": 0.78, "precision": 0.74, ... },
  "initialPrediction": -0.847,
  "learningRate": 0.1,
  "threshold": 0.5,
  "trees": [
    {
      "round": 0,
      "leafValues": { "0": -0.15, "1": 0.35 },
      "root": {
        "type": "split",
        "featureIndex": 0,
        "threshold": 0.667,
        "left": { "type": "leaf", "prediction": 0 },
        "right": { "type": "leaf", "prediction": 1 }
      }
    }
  ]
}
```

## Client-Side Inference

The desktop app evaluates the model with a tiny pure-JS function:

```javascript
function predict(model, features) {
  let score = model.initialPrediction;

  for (const tree of model.trees) {
    const prediction = walkTree(tree.root, features);
    const leafValue = tree.leafValues[prediction] || 0;
    score += model.learningRate * leafValue;
  }

  return sigmoid(score);
}

function walkTree(node, features) {
  if (node.type === 'leaf') return node.prediction;
  return features[node.featureIndex] <= node.threshold
    ? walkTree(node.left, features)
    : walkTree(node.right, features);
}
```

**Performance**: Inference takes < 1ms for 100 trees × 14 features on any modern hardware.

## Retraining Pipeline

The model is automatically retrained every **Sunday at 02:00 UTC** via a cron job:

```
1. Fetch 30 days of result_link_events (with search_events join)
2. Require ≥ 10,000 rows to proceed
3. Build feature matrix (14 features)
4. Split 80/20 train/test
5. Train 100-tree GBDT ensemble
6. Evaluate on test set
7. If accuracy ≥ 0.70:
   a. Export to models/latest.json
   b. Deactivate current model in DB
   c. Insert new model version as active
8. If accuracy < 0.70:
   a. Save model version as inactive (for comparison)
   b. Keep current active model unchanged
```

## Accuracy Feedback Loop

The desktop client reports real-world prediction accuracy back to the server:

```
Desktop:                              Cloud API:
  ML model predicts URLs  ───────────→  POST /model/report-accuracy
  User clicks a link      ───────────→  { predictedUrls, actualClickedUrl,
  Compare prediction                      predictionCorrect, inferenceTimeMs }
  vs actual click                            ↓
                                        Stored in ml_predictions_log
                                             ↓
                                        Used in next retraining cycle
```

This closes the feedback loop: real user behavior improves future models.

## Model Version History

Every trained model (whether deployed or not) is recorded in `ml_model_versions`:

| Field                 | Description                              |
|----------------------|------------------------------------------|
| `version_string`     | Semantic version (e.g. "1.23456.0")      |
| `training_data_count`| Number of rows used for training         |
| `accuracy_score`     | Accuracy on test set                     |
| `precision_score`    | Precision on test set                    |
| `recall_score`       | Recall on test set                       |
| `f1_score`           | F1 score on test set                     |
| `auc_roc_score`      | AUC-ROC on test set                      |
| `is_active`          | Whether this is the currently deployed model |
| `model_file_path`    | Path to the JSON file                    |
| `trained_at`         | When training completed                  |
| `deployed_at`        | When the model was activated (null if not)|

The client can list all versions via `GET /api/v1/model/versions` and download the active model via `GET /api/v1/model/download`.
