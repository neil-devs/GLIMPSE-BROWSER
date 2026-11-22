/**
 * @fileoverview On-device ML click predictor.
 *
 * Implements zero-library decision tree traversal for exported GBDT models:
 *   feature[n] >= 0 ? (x[feature[n]] <= threshold[n] ? left[n] : right[n]) : value[n]
 *
 * Builds features with @glimpse/shared/features buildFeatures(ctx, model.domainStats)
 * to guarantee zero train/serve skew.
 *
 * Runs golden vector parity check (|diff| < 1e-5) on load.
 * Tracks and reports real-world prediction accuracy (top-1/3/6 hit rates) to cloud API.
 *
 * @module desktop/ml/click-predictor
 */

'use strict';

const { app } = require('electron');
const { buildFeatures, FEATURE_SCHEMA_VERSION } = require('@glimpse/shared/features');
const { getModel } = require('./model-loader');
const { logger } = require('../utils/logger');
const settings = require('../storage/settings');

/* ── Tree Traversal ─────────────────────────────────────────────── */

/**
 * Traverses a flat-array tree:
 * If feature[node] >= 0, branch to left or right; else return value[node].
 *
 * @param {object} tree - { feature: number[], threshold: number[], left: number[], right: number[], value: number[] }
 * @param {number[]} x - Feature vector
 * @returns {number} Leaf value
 */
function evaluateFlatTree(tree, x) {
  let node = 0;
  while (tree.feature && tree.feature[node] >= 0) {
    const fIdx = tree.feature[node];
    const thresh = tree.threshold[node];
    node = (x[fIdx] <= thresh) ? tree.left[node] : tree.right[node];
  }
  return tree.value[node] || 0;
}

/**
 * Legacy recursive tree traversal (fallback for legacy formats).
 */
function traverseLegacyTree(node, x) {
  if (!node) return 0.5;
  if (node.distribution !== undefined && node.left === undefined && node.right === undefined) {
    if (Array.isArray(node.distribution)) {
      const sum = node.distribution.reduce((a, b) => a + b, 0);
      return sum > 0 ? (node.distribution[1] || 0) / sum : 0.5;
    }
    return typeof node.distribution === 'number' ? node.distribution : 0.5;
  }
  if (node.value !== undefined && node.left === undefined && node.right === undefined) {
    return node.value;
  }
  const col = node.splitColumn ?? node.featureIndex;
  const val = node.splitValue ?? node.threshold;
  if (col !== undefined && val !== undefined) {
    return (x[col] <= val) ? traverseLegacyTree(node.left, x) : traverseLegacyTree(node.right, x);
  }
  return 0.5;
}

/**
 * Numerically stable sigmoid function.
 * @param {number} x
 * @returns {number}
 */
function sigmoid(x) {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

/**
 * Predict raw probability using a loaded model on a feature vector.
 *
 * @param {object} modelObj
 * @param {number[]} x - Numeric feature vector
 * @returns {number} Probability between 0 and 1
 */
function predictProba(modelObj, x) {
  if (!modelObj) return 0.5;

  // Format 1: GBDT flat array model (single source of truth)
  if (modelObj.trees && modelObj.trees.length > 0 && Array.isArray(modelObj.trees[0].feature)) {
    let margin = modelObj.baseMargin !== undefined ? modelObj.baseMargin : 0;
    const lr = modelObj.learningRate !== undefined ? modelObj.learningRate : 1.0;

    for (const tree of modelObj.trees) {
      margin += lr * evaluateFlatTree(tree, x);
    }

    // Platt scaling calibration if calibrated
    if (modelObj.calibration && modelObj.calibration.method === 'platt') {
      margin = (modelObj.calibration.a || 1.0) * margin + (modelObj.calibration.b || 0.0);
    }

    return sigmoid(margin);
  }

  // Format 2: Legacy nested tree format
  if (Array.isArray(modelObj.trees)) {
    let rawScore = modelObj.bias || modelObj.initialPrediction || 0;
    const lr = modelObj.learningRate || 0.1;
    for (const tree of modelObj.trees) {
      rawScore += lr * traverseLegacyTree(tree, x);
    }
    return sigmoid(rawScore);
  }

  return 0.5;
}

/**
 * Verifies parity of a model against its golden test vectors.
 *
 * @param {object} modelObj
 * @returns {boolean} True if all golden vectors match within 1e-5
 */
function verifyParity(modelObj) {
  if (!modelObj || !Array.isArray(modelObj.goldenVectors) || modelObj.goldenVectors.length === 0) {
    return true; // No golden vectors to verify
  }

  for (const gv of modelObj.goldenVectors) {
    const actual = predictProba(modelObj, gv.input);
    const diff = Math.abs(actual - gv.expectedProba);
    if (diff > 1e-5) {
      logger.error('Model parity test failed', {
        testCase: gv.name,
        expected: gv.expectedProba,
        actual,
        diff,
      });
      return false;
    }
  }

  logger.info('Model parity check passed against golden vectors', {
    vectorCount: modelObj.goldenVectors.length,
  });
  return true;
}

/* ── Context & Feature Builder ──────────────────────────────────── */

/**
 * Build feature vector from partial or full link context.
 *
 * @param {object} linkOrCtx
 * @param {string} engine
 * @param {object} [domainStats]
 * @returns {number[]} 39-dimensional feature vector
 */
function buildVectorForLink(linkOrCtx, engine, domainStats = null) {
  let ctx = {};

  if (typeof linkOrCtx === 'object' && linkOrCtx !== null) {
    const urlStr = linkOrCtx.url || '';
    let domain = linkOrCtx.domain || '';
    let tld = '';
    let urlDepth = 0;

    try {
      if (urlStr.startsWith('http')) {
        const parsed = new URL(urlStr);
        if (!domain) domain = parsed.hostname;
        tld = domain.split('.').pop() || '';
        urlDepth = parsed.pathname.split('/').filter(Boolean).length;
      }
    } catch {}

    ctx = {
      position: linkOrCtx.position || 1,
      visibleCount: linkOrCtx.visibleCount || 10,
      visibleOnLoad: linkOrCtx.visibleOnLoad !== undefined ? linkOrCtx.visibleOnLoad : (linkOrCtx.position <= 3),
      engine: engine || linkOrCtx.engine || 'google',
      domain,
      tld: linkOrCtx.tld || tld,
      urlDepth: linkOrCtx.urlDepth || urlDepth,
      linkTextLength: linkOrCtx.linkTextLength || 0,
      queryFeatures: linkOrCtx.queryFeatures || null,
      windowWidth: linkOrCtx.windowWidth || 1920,
      windowHeight: linkOrCtx.windowHeight || 1080,
    };
  }

  return buildFeatures(ctx, domainStats);
}

/**
 * Predict click probability for a link.
 *
 * @param {string|object} linkOrUrl
 * @param {number} [position=1]
 * @param {string} [domain='']
 * @param {string} [engine='google']
 * @returns {number} Score between 0 and 1
 */
function predictClickProbability(linkOrUrl, position = 1, domain = '', engine = 'google') {
  const model = getModel();

  const ctx = typeof linkOrUrl === 'object'
    ? linkOrUrl
    : { url: linkOrUrl, position, domain, engine };

  if (!model) {
    // Position-based examination fallback
    const pos = ctx.position || 1;
    return 1.0 / Math.pow(pos, 0.7);
  }

  const vec = buildVectorForLink(ctx, engine, model.domainStats);
  return predictProba(model, vec);
}

/**
 * Rank an array of visible links by predicted click probability.
 *
 * @param {Array<{ url: string, position: number, domain: string }>} links
 * @param {string} engine
 * @returns {Array<{ url: string, position: number, domain: string, score: number }>}
 */
function rankUrls(links, engine = 'google') {
  const model = getModel();
  const domainStats = model ? model.domainStats : null;

  return links
    .map((link) => {
      const vec = buildVectorForLink(link, engine, domainStats);
      const score = model ? predictProba(model, vec) : 1.0 / Math.pow(link.position || 1, 0.7);
      return {
        ...link,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/* ── Field Accuracy Tracker & Aggregator (B7) ───────────────────── */

/** Daily field statistics cache */
let dailyStats = {
  day: new Date().toISOString().slice(0, 10),
  searches: 0,
  hitsTop1: 0,
  hitsTop3: 0,
  hitsTop6: 0,
  hitsBaselineTop3: 0,
};

/**
 * Record real-world prediction outcome for a search session.
 *
 * @param {number} clickedPosition - Actual 1-based position clicked
 * @param {Array<{ position: number, score: number }>} rankedLinks - Model ranked links
 */
function recordSearchOutcome(clickedPosition, rankedLinks = []) {
  if (!clickedPosition || clickedPosition < 1) return;

  const today = new Date().toISOString().slice(0, 10);
  if (dailyStats.day !== today) {
    // Day rollover: flush old day, start fresh
    flushAccuracyReport().catch(() => {});
    dailyStats = {
      day: today,
      searches: 0,
      hitsTop1: 0,
      hitsTop3: 0,
      hitsTop6: 0,
      hitsBaselineTop3: 0,
    };
  }

  dailyStats.searches++;

  // Position baseline top 3 hits
  if (clickedPosition <= 3) {
    dailyStats.hitsBaselineTop3++;
  }

  // Model top N hits
  const sorted = [...rankedLinks].sort((a, b) => b.score - a.score);
  const top1Positions = new Set(sorted.slice(0, 1).map((l) => l.position));
  const top3Positions = new Set(sorted.slice(0, 3).map((l) => l.position));
  const top6Positions = new Set(sorted.slice(0, 6).map((l) => l.position));

  if (top1Positions.has(clickedPosition)) dailyStats.hitsTop1++;
  if (top3Positions.has(clickedPosition)) dailyStats.hitsTop3++;
  if (top6Positions.has(clickedPosition)) dailyStats.hitsTop6++;
}

/**
 * Send aggregated daily accuracy metrics to cloud API.
 * @returns {Promise<boolean>}
 */
async function flushAccuracyReport() {
  if (dailyStats.searches === 0) return false;

  const apiBase = process.env.CLOUD_API_URL || 'http://localhost:3001';
  const installId = settings.get('installId') || '00000000-0000-0000-0000-000000000000';
  const model = getModel();
  const modelVersion = model?.version || 'v2.0.0';

  const payload = {
    installId,
    modelVersion,
    day: dailyStats.day,
    searches: dailyStats.searches,
    hitsTop1: dailyStats.hitsTop1,
    hitsTop3: dailyStats.hitsTop3,
    hitsTop6: dailyStats.hitsTop6,
    hitsBaselineTop3: dailyStats.hitsBaselineTop3,
  };

  try {
    const res = await fetch(`${apiBase}/api/v1/model/report-accuracy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      logger.info('Aggregated ML accuracy successfully reported to cloud', payload);
      // Reset counters for the current day after successful reporting
      dailyStats.searches = 0;
      dailyStats.hitsTop1 = 0;
      dailyStats.hitsTop3 = 0;
      dailyStats.hitsTop6 = 0;
      dailyStats.hitsBaselineTop3 = 0;
      return true;
    }
  } catch (err) {
    logger.debug('Reporting ML accuracy skipped/failed', { message: err.message });
  }

  return false;
}

// Flush accuracy report on app exit
if (app) {
  app.on('before-quit', () => {
    flushAccuracyReport().catch(() => {});
  });
}

module.exports = {
  evaluateFlatTree,
  traverseLegacyTree,
  predictProba,
  verifyParity,
  buildVectorForLink,
  predictClickProbability,
  rankUrls,
  recordSearchOutcome,
  flushAccuracyReport,
};
