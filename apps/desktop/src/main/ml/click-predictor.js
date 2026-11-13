/**
 * @fileoverview On-device ML click predictor.
 * Evaluates the locally-cached gradient-boosted decision tree model
 * to predict which search result links the user is most likely to click.
 * No external ML packages required — uses pure decision tree traversal.
 *
 * Supports multiple model formats:
 * - Default bundled model (splitColumn/splitValue/distribution)
 * - Cloud-exported model (featureIndex/threshold/type:'leaf')
 * - ml-cart native format
 *
 * @module desktop/ml/click-predictor
 */

'use strict';

const { getModel } = require('./model-loader');

/* ── Domain Reputation Scores ───────────────────────────────────── */

/**
 * Static domain reputation lookup table.
 * Scores from 0.0 (unknown) to 1.0 (highly trusted/popular).
 */
const DOMAIN_SCORES = {
  'wikipedia.org': 1.0,
  'en.wikipedia.org': 1.0,
  'stackoverflow.com': 0.92,
  'youtube.com': 0.9,
  'github.com': 0.88,
  'reddit.com': 0.85,
  'developer.mozilla.org': 0.9,
  'docs.microsoft.com': 0.85,
  'learn.microsoft.com': 0.85,
  'medium.com': 0.75,
  'amazon.com': 0.8,
  'twitter.com': 0.7,
  'x.com': 0.7,
  'linkedin.com': 0.72,
  'nytimes.com': 0.82,
  'bbc.com': 0.82,
  'bbc.co.uk': 0.82,
  'cnn.com': 0.78,
  'w3schools.com': 0.7,
  'geeksforgeeks.org': 0.72,
  'quora.com': 0.65,
  'pinterest.com': 0.6,
  'imdb.com': 0.78,
  'spotify.com': 0.75,
  'apple.com': 0.8,
  'google.com': 0.85,
  'facebook.com': 0.65,
  'instagram.com': 0.6,
};

/**
 * Get the domain reputation score.
 *
 * @param {string} domain - The domain name (e.g., 'wikipedia.org')
 * @returns {number} Score between 0 and 1
 */
function getDomainScore(domain) {
  if (!domain) return 0.5;
  const cleaned = domain.replace(/^www\./, '').toLowerCase();
  return DOMAIN_SCORES[cleaned] || 0.5;
}

/* ── Feature Engineering ────────────────────────────────────────── */

/** Engine names for one-hot encoding (must match training order) */
const ENGINE_ORDER = ['google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'yandex'];

/**
 * Build a feature vector for a search result link.
 * Must match the exact feature order used during model training.
 *
 * @param {string} url - The result URL
 * @param {number} position - 1-indexed position on the page
 * @param {string} domain - Domain of the result
 * @param {string} engine - Search engine name
 * @returns {number[]} Feature vector
 */
function buildFeatureVector(url, position, domain, engine) {
  return [
    position / 10,                           /* normalised position */
    position <= 3 ? 1 : 0,                  /* is_top_3 */
    getDomainScore(domain),                  /* domain reputation */
    ...ENGINE_ORDER.map((e) => e === engine ? 1 : 0),  /* one-hot engine encoding */
  ];
}

/* ── Decision Tree Traversal ────────────────────────────────────── */

/**
 * Traverse a single decision tree node recursively.
 *
 * Handles MULTIPLE model formats:
 *
 * Format A (default/ml-cart):
 *   { splitColumn, splitValue, left, right, distribution }
 *
 * Format B (cloud-exported via export-model.js):
 *   { type:'split', featureIndex, threshold, left, right }
 *   { type:'leaf', prediction, distribution }
 *
 * @param {object} node - Current tree node
 * @param {number[]} features - Feature vector
 * @returns {number} Predicted value (probability or raw score)
 */
function traverseTree(node, features) {
  if (!node) return 0.5;

  /* ── Leaf node detection ──────────────────────────────────── */

  /* Format B: exported model leaf */
  if (node.type === 'leaf') {
    if (node.distribution && Array.isArray(node.distribution)) {
      const total = node.distribution.reduce((a, b) => a + b, 0);
      if (total === 0) return 0.5;
      return node.distribution.length > 1
        ? node.distribution[1] / total
        : node.distribution[0] / total;
    }
    if (typeof node.prediction === 'number') return node.prediction;
    return 0.5;
  }

  /* Format A: ml-cart distribution leaf */
  if (node.distribution !== undefined && node.left === undefined && node.right === undefined) {
    if (Array.isArray(node.distribution)) {
      const total = node.distribution.reduce((a, b) => a + b, 0);
      if (total === 0) return 0.5;
      return node.distribution.length > 1
        ? node.distribution[1] / total
        : node.distribution[0] / total;
    }
    return typeof node.distribution === 'number' ? node.distribution : 0.5;
  }

  /* Regression tree leaf — value field */
  if (node.value !== undefined && node.left === undefined && node.right === undefined) {
    return node.value;
  }

  /* ── Interior node — split on a feature ───────────────────── */

  /* Determine split column and value from either format */
  const splitCol = node.splitColumn !== undefined ? node.splitColumn
    : node.featureIndex !== undefined ? node.featureIndex
    : undefined;
  const splitVal = node.splitValue !== undefined ? node.splitValue
    : node.threshold !== undefined ? node.threshold
    : undefined;

  if (splitCol !== undefined && splitVal !== undefined) {
    const featureValue = features[splitCol] || 0;
    if (featureValue <= splitVal) {
      return node.left ? traverseTree(node.left, features) : 0.5;
    } else {
      return node.right ? traverseTree(node.right, features) : 0.5;
    }
  }

  /* If node has distribution but also children — treat as leaf with distribution */
  if (node.distribution !== undefined) {
    if (Array.isArray(node.distribution)) {
      const total = node.distribution.reduce((a, b) => a + b, 0);
      if (total === 0) return 0.5;
      return node.distribution.length > 1
        ? node.distribution[1] / total
        : node.distribution[0] / total;
    }
    return typeof node.distribution === 'number' ? node.distribution : 0.5;
  }

  /* Unknown node structure */
  return 0.5;
}

/**
 * Apply sigmoid function to convert a raw score to a probability.
 *
 * @param {number} x
 * @returns {number} Value between 0 and 1
 */
function sigmoid(x) {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Predict the probability that a user will click a given search result link.
 *
 * @param {string} url - The result URL
 * @param {number} position - 1-indexed position on the page
 * @param {string} domain - Domain of the result
 * @param {string} engine - Search engine name
 * @returns {number} Click probability between 0 and 1
 */
function predictClickProbability(url, position, domain, engine) {
  const model = getModel();

  /* No model available — fallback to position-based heuristic */
  if (!model) {
    return 1 / (position || 1);
  }

  const features = buildFeatureVector(url, position, domain, engine);

  try {
    /* Determine the tree array — handle multiple model structures */
    let trees = null;
    let bias = 0;
    let learningRate = 0.1;

    if (Array.isArray(model.trees)) {
      trees = model.trees;
      bias = model.bias || model.initialPrediction || 0;
      learningRate = model.learningRate || 0.1;
    } else if (Array.isArray(model)) {
      trees = model;
    }

    if (trees && trees.length > 0) {
      let rawScore = bias;

      for (const treeEntry of trees) {
        /* Handle multiple tree wrapper formats:
         * - Direct tree node: { splitColumn, splitValue, left, right }
         * - Exported wrapper: { root: {...}, leafValues: {...}, round: N }
         * - Default model: { splitColumn, splitValue, left, right, distribution }
         */
        let treeNode = treeEntry;

        /* Cloud-exported format: tree is wrapped in { root, leafValues, round } */
        if (treeEntry.root) {
          treeNode = treeEntry.root;
        }

        /* ml-cart format: tree may have a .root property from the classifier */
        if (treeNode.root && !treeNode.splitColumn && !treeNode.featureIndex) {
          treeNode = treeNode.root;
        }

        const treePrediction = traverseTree(treeNode, features);
        rawScore += learningRate * treePrediction;
      }

      return sigmoid(rawScore);
    }

    /* Single tree model (no array) */
    if (model.splitColumn !== undefined || model.featureIndex !== undefined) {
      return traverseTree(model, features);
    }

    /* Unknown model format — fallback */
    return 1 / (position || 1);
  } catch (err) {
    return 1 / (position || 1);
  }
}

/**
 * Rank an array of visible links by predicted click probability.
 *
 * @param {{ url: string, position: number, domain: string }[]} links
 * @param {string} engine - Search engine name
 * @returns {{ url: string, position: number, domain: string, score: number }[]}
 *   Sorted descending by score (highest probability first)
 */
function rankUrls(links, engine) {
  return links
    .map((link) => ({
      ...link,
      score: predictClickProbability(link.url, link.position, link.domain, engine),
    }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  buildFeatureVector,
  getDomainScore,
  predictClickProbability,
  rankUrls,
};
