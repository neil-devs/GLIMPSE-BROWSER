/**
 * @fileoverview Histogram-based Gradient Boosted Decision Trees (GBDT).
 * Replaces ml-cart entirely with a high-performance, self-contained implementation.
 *
 * Algorithms & Features:
 * - Logistic loss (binary cross-entropy) for click prediction
 * - Second-order (Newton-Raphson) leaf values with L2 regularization (lambda)
 * - Histogram binning (64 bins) for fast O(bins) split finding
 * - Row and column subsampling
 * - Early stopping on validation split
 * - Seeded PRNG for reproducible training
 * - Serializes to flat arrays (feature, threshold, left, right, value)
 *
 * @module cloud-api/ml/gbdt
 */

'use strict';

/**
 * Seeded 32-bit PRNG (Mulberry32).
 * @param {number} seed
 * @returns {() => number} Returns float in [0, 1)
 */
function createSeededRng(seed = 42) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute logistic sigmoid.
 * @param {number} x
 * @returns {number}
 */
function sigmoid(x) {
  if (x >= 40) return 1.0;
  if (x <= -40) return 0.0;
  return 1.0 / (1.0 + Math.exp(-x));
}

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
  return sum / Math.max(1, yTrue.length);
}

/**
 * Build up to 64 midpoint split thresholds for each feature column.
 * @param {number[][]} X
 * @param {number} numBins
 * @returns {number[][]} splitThresholds per feature
 */
function buildBinEdges(X, numBins = 64) {
  const nRows = X.length;
  const nCols = X[0].length;
  const binEdges = [];

  for (let j = 0; j < nCols; j++) {
    const vals = [];
    for (let i = 0; i < nRows; i++) {
      vals.push(X[i][j]);
    }
    vals.sort((a, b) => a - b);

    // Dedup
    const unique = [];
    for (let i = 0; i < vals.length; i++) {
      if (i === 0 || vals[i] !== vals[i - 1]) {
        unique.push(vals[i]);
      }
    }

    if (unique.length <= 1) {
      binEdges.push([]);
      continue;
    }

    // Midpoints between consecutive unique values
    const midpoints = [];
    for (let i = 0; i < unique.length - 1; i++) {
      midpoints.push((unique[i] + unique[i + 1]) / 2);
    }

    if (midpoints.length <= numBins) {
      binEdges.push(midpoints);
    } else {
      const step = midpoints.length / numBins;
      const edges = [];
      for (let b = 0; b < numBins; b++) {
        const idx = Math.min(midpoints.length - 1, Math.floor(b * step));
        if (edges.length === 0 || edges[edges.length - 1] !== midpoints[idx]) {
          edges.push(midpoints[idx]);
        }
      }
      binEdges.push(edges);
    }
  }

  return binEdges;
}

/**
 * Convert continuous matrix X into uint8 bin indices matrix.
 * Row value v mapped to bin index: number of thresholds < v.
 * @param {number[][]} X
 * @param {number[][]} binEdges
 * @returns {Uint8Array[]}
 */
function binData(X, binEdges) {
  const nRows = X.length;
  const nCols = X[0].length;
  const binned = new Array(nRows);

  for (let i = 0; i < nRows; i++) {
    const row = new Uint8Array(nCols);
    for (let j = 0; j < nCols; j++) {
      const val = X[i][j];
      const edges = binEdges[j];
      let low = 0;
      let high = edges.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (edges[mid] < val) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      row[j] = low;
    }
    binned[i] = row;
  }

  return binned;
}

/**
 * Gradient Boosted Decision Tree Classifier.
 */
class GBDT {
  /**
   * @param {object} params
   * @param {number} [params.nEstimators=50]
   * @param {number} [params.maxDepth=4]
   * @param {number} [params.learningRate=0.1]
   * @param {number} [params.lambda=1.0] - L2 regularization penalty
   * @param {number} [params.minChildWeight=1.0] - Minimum hessian sum per child
   * @param {number} [params.subsample=0.8] - Row subsampling ratio
   * @param {number} [params.colsample=0.8] - Feature subsampling ratio
   * @param {number} [params.earlyStoppingRounds=10]
   * @param {number} [params.seed=42]
   */
  constructor(params = {}) {
    this.nEstimators = params.nEstimators || 50;
    this.maxDepth = params.maxDepth || 4;
    this.learningRate = params.learningRate || 0.1;
    this.lambda = params.lambda !== undefined ? params.lambda : 1.0;
    this.minChildWeight = params.minChildWeight !== undefined ? params.minChildWeight : 0.1;
    this.subsample = params.subsample || 0.8;
    this.colsample = params.colsample || 0.8;
    this.earlyStoppingRounds = params.earlyStoppingRounds || 10;
    this.seed = params.seed || 42;

    this.rng = createSeededRng(this.seed);
    this.baseScore = 0.5;
    this.baseMargin = 0.0;
    this.trees = []; // flat array trees
    this.binEdges = [];
    this.featureImportances = {};
  }

  /**
   * Fit the GBDT model on training data with optional validation set.
   *
   * @param {number[][]} XTrain - Feature matrix [nSamples, nFeatures]
   * @param {number[]} yTrain - Labels (0 or 1)
   * @param {object} [valSet] - Optional validation set { X, y }
   * @returns {this}
   */
  fit(XTrain, yTrain, valSet = null) {
    const nSamples = XTrain.length;
    const nFeatures = XTrain[0].length;

    // 1. Initial base score from label prior
    let posCount = 0;
    for (let i = 0; i < nSamples; i++) {
      if (yTrain[i] === 1) posCount++;
    }
    const prior = Math.max(1e-4, Math.min(1 - 1e-4, posCount / Math.max(1, nSamples)));
    this.baseScore = prior;
    this.baseMargin = Math.log(prior / (1 - prior));

    // 2. Build histogram bin edges and bin the training data
    this.binEdges = buildBinEdges(XTrain, 64);
    const binnedTrain = binData(XTrain, this.binEdges);

    // Track raw margins: rawMargin = baseMargin + sum(lr * tree_val)
    const rawTrain = new Float64Array(nSamples).fill(this.baseMargin);

    let rawVal = null;
    let binnedVal = null;
    if (valSet && valSet.X.length > 0) {
      rawVal = new Float64Array(valSet.X.length).fill(this.baseMargin);
      binnedVal = binData(valSet.X, this.binEdges);
    }

    let bestValLoss = Infinity;
    let bestTreeCount = 0;
    let roundsWithoutImprovement = 0;

    // Feature gain accumulator for feature importances
    const featureGains = new Float64Array(nFeatures);

    this.trees = [];

    // 3. Boosting iterations
    for (let iter = 0; iter < this.nEstimators; iter++) {
      // Compute gradients (g) and hessians (h)
      const g = new Float64Array(nSamples);
      const h = new Float64Array(nSamples);

      for (let i = 0; i < nSamples; i++) {
        const p = sigmoid(rawTrain[i]);
        g[i] = p - yTrain[i];
        h[i] = Math.max(1e-6, p * (1.0 - p));
      }

      // Row subsampling: select active indices
      const sampleIndices = [];
      for (let i = 0; i < nSamples; i++) {
        if (this.subsample >= 1.0 || this.rng() < this.subsample) {
          sampleIndices.push(i);
        }
      }
      if (sampleIndices.length === 0) {
        for (let i = 0; i < nSamples; i++) sampleIndices.push(i);
      }

      // Column subsampling
      const activeFeatures = [];
      for (let j = 0; j < nFeatures; j++) {
        if (this.colsample >= 1.0 || this.rng() < this.colsample) {
          activeFeatures.push(j);
        }
      }
      if (activeFeatures.length === 0) activeFeatures.push(0);

      // Build one tree using flat arrays
      const tree = this._buildTree(
        binnedTrain,
        g,
        h,
        sampleIndices,
        activeFeatures,
        featureGains
      );

      this.trees.push(tree);

      // Update training raw predictions
      for (let i = 0; i < nSamples; i++) {
        const leafVal = this._evaluateTreeOnBinned(tree, binnedTrain[i]);
        rawTrain[i] += this.learningRate * leafVal;
      }

      // Evaluate validation loss for early stopping
      if (valSet && valSet.X.length > 0) {
        for (let i = 0; i < valSet.X.length; i++) {
          const leafVal = this._evaluateTreeOnBinned(tree, binnedVal[i]);
          rawVal[i] += this.learningRate * leafVal;
        }

        const valProbs = Array.from(rawVal).map(sigmoid);
        const valLoss = computeLogLoss(valSet.y, valProbs);

        if (valLoss < bestValLoss - 1e-5) {
          bestValLoss = valLoss;
          bestTreeCount = this.trees.length;
          roundsWithoutImprovement = 0;
        } else {
          roundsWithoutImprovement++;
          if (roundsWithoutImprovement >= this.earlyStoppingRounds) {
            // Early stopping triggered: truncate to best tree count
            this.trees = this.trees.slice(0, bestTreeCount);
            break;
          }
        }
      }
    }

    // Normalize feature importances
    const totalGain = featureGains.reduce((acc, v) => acc + v, 0);
    this.featureImportances = {};
    for (let j = 0; j < nFeatures; j++) {
      this.featureImportances[j] = totalGain > 0
        ? Number((featureGains[j] / totalGain).toFixed(5))
        : 0;
    }

    return this;
  }

  /**
   * Internal recursive tree builder into flat arrays.
   */
  _buildTree(binnedX, g, h, rowIndices, activeFeatures, featureGains) {
    const featureArr = [];
    const thresholdArr = [];
    const binThresholdArr = [];
    const leftArr = [];
    const rightArr = [];
    const valueArr = [];

    const lambda = this.lambda;
    const minChildWeight = this.minChildWeight;
    const maxDepth = this.maxDepth;
    const binEdges = this.binEdges;

    function buildNode(indices, depth) {
      const nodeIdx = featureArr.length;
      featureArr.push(-1);
      thresholdArr.push(0);
      binThresholdArr.push(0);
      leftArr.push(-1);
      rightArr.push(-1);
      valueArr.push(0);

      // Calculate node weight (Newton-Raphson update)
      let sumG = 0;
      let sumH = 0;
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        sumG += g[idx];
        sumH += h[idx];
      }

      const nodeWeight = -sumG / (sumH + lambda);

      // Stopping conditions: reached max depth or insufficient samples
      if (depth >= maxDepth || indices.length < 2 || sumH < minChildWeight) {
        valueArr[nodeIdx] = nodeWeight;
        return nodeIdx;
      }

      // Base score of parent node
      const parentScore = (sumG * sumG) / (sumH + lambda);

      let bestGain = 0;
      let bestFeat = -1;
      let bestBinThresh = -1;
      let bestLeftIndices = null;
      let bestRightIndices = null;

      // Find best split across active features using histogram binning
      for (const feat of activeFeatures) {
        const numBins = binEdges[feat].length + 1;
        const binG = new Float64Array(numBins);
        const binH = new Float64Array(numBins);

        for (let i = 0; i < indices.length; i++) {
          const idx = indices[i];
          const b = binnedX[idx][feat];
          binG[b] += g[idx];
          binH[b] += h[idx];
        }

        let leftG = 0;
        let leftH = 0;

        for (let b = 0; b < numBins - 1; b++) {
          leftG += binG[b];
          leftH += binH[b];

          const rightG = sumG - leftG;
          const rightH = sumH - leftH;

          if (leftH < minChildWeight || rightH < minChildWeight) continue;

          const gain = 0.5 * (
            (leftG * leftG) / (leftH + lambda) +
            (rightG * rightG) / (rightH + lambda) -
            parentScore
          );

          if (gain > bestGain) {
            bestGain = gain;
            bestFeat = feat;
            bestBinThresh = b;
          }
        }
      }

      // If split improves objective, split the node
      if (bestGain > 1e-5 && bestFeat !== -1) {
        featureGains[bestFeat] += bestGain;

        bestLeftIndices = [];
        bestRightIndices = [];
        for (let i = 0; i < indices.length; i++) {
          const idx = indices[i];
          if (binnedX[idx][bestFeat] <= bestBinThresh) {
            bestLeftIndices.push(idx);
          } else {
            bestRightIndices.push(idx);
          }
        }

        featureArr[nodeIdx] = bestFeat;
        binThresholdArr[nodeIdx] = bestBinThresh;
        thresholdArr[nodeIdx] = binEdges[bestFeat][bestBinThresh] !== undefined
          ? binEdges[bestFeat][bestBinThresh]
          : 0;

        const leftChild = buildNode(bestLeftIndices, depth + 1);
        const rightChild = buildNode(bestRightIndices, depth + 1);

        leftArr[nodeIdx] = leftChild;
        rightArr[nodeIdx] = rightChild;
      } else {
        // Leaf node
        valueArr[nodeIdx] = nodeWeight;
      }

      return nodeIdx;
    }

    buildNode(rowIndices, 0);

    return {
      feature: featureArr,
      threshold: thresholdArr,
      binThreshold: binThresholdArr,
      left: leftArr,
      right: rightArr,
      value: valueArr,
    };
  }

  /**
   * Internal evaluation of a single tree on binned features.
   */
  _evaluateTreeOnBinned(tree, binnedRow) {
    let node = 0;
    while (tree.feature[node] !== -1) {
      const feat = tree.feature[node];
      if (binnedRow[feat] <= tree.binThreshold[node]) {
        node = tree.left[node];
      } else {
        node = tree.right[node];
      }
    }
    return tree.value[node];
  }

  /**
   * Predict raw log-odds margins for continuous feature matrix X.
   * @param {number[][]} X
   * @returns {Float64Array}
   */
  predictRaw(X) {
    const n = X.length;
    const raw = new Float64Array(n).fill(this.baseMargin);

    for (const tree of this.trees) {
      for (let i = 0; i < n; i++) {
        const row = X[i];
        let node = 0;
        while (tree.feature[node] !== -1) {
          const feat = tree.feature[node];
          if (row[feat] <= tree.threshold[node]) {
            node = tree.left[node];
          } else {
            node = tree.right[node];
          }
        }
        raw[i] += this.learningRate * tree.value[node];
      }
    }

    return raw;
  }

  /**
   * Predict probabilities in [0, 1].
   * @param {number[][]} X
   * @returns {number[]}
   */
  predictProba(X) {
    const raw = this.predictRaw(X);
    const result = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      result[i] = sigmoid(raw[i]);
    }
    return result;
  }

  /**
   * Predict binary class (0 or 1) with decision threshold (default 0.5).
   * @param {number[][]} X
   * @param {number} [threshold=0.5]
   * @returns {number[]}
   */
  predict(X, threshold = 0.5) {
    const probs = this.predictProba(X);
    return probs.map((p) => (p >= threshold ? 1 : 0));
  }

  /**
   * Export model to compact JSON representation with flat arrays.
   * @returns {object}
   */
  toJSON() {
    return {
      modelType: 'histogram_gbdt',
      baseScore: this.baseScore,
      baseMargin: this.baseMargin,
      learningRate: this.learningRate,
      maxDepth: this.maxDepth,
      lambda: this.lambda,
      nEstimators: this.trees.length,
      trees: this.trees.map((t) => ({
        feature: t.feature,
        threshold: t.threshold,
        left: t.left,
        right: t.right,
        value: t.value.map((v) => Number(v.toFixed(6))),
      })),
      featureImportances: this.featureImportances,
    };
  }

  /**
   * Load model from JSON representation.
   * @param {object} json
   * @returns {GBDT}
   */
  static fromJSON(json) {
    const model = new GBDT({
      learningRate: json.learningRate,
      maxDepth: json.maxDepth,
      lambda: json.lambda,
      nEstimators: json.nEstimators,
    });
    model.baseScore = json.baseScore;
    model.baseMargin = json.baseMargin !== undefined
      ? json.baseMargin
      : Math.log(json.baseScore / (1 - json.baseScore));
    model.trees = json.trees;
    model.featureImportances = json.featureImportances || {};
    return model;
  }
}

module.exports = {
  GBDT,
  sigmoid,
  computeLogLoss,
  createSeededRng,
};
