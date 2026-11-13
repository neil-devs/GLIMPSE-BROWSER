/**
 * @fileoverview ML model loader.
 * Downloads and caches the gradient-boosted decision tree model from the cloud API.
 * Falls back to a bundled default model when the API is unreachable or has no
 * trained model yet.
 * @module desktop/ml/model-loader
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { logger } = require('../utils/logger');

/** Path to the locally cached model file */
let modelPath = '';

/** The loaded model object (parsed JSON) or null */
let model = null;

/** Current model version string */
let modelVersion = null;

/** Cloud API base URL (loaded from .env or fallback) */
const API_BASE = process.env.CLOUD_API_URL || 'http://localhost:3001';

/* ── Default Heuristic Model ─────────────────────────────────────── */

/**
 * A simple hand-crafted decision tree model that acts as a sensible default
 * when no cloud-trained model is available. It encodes the obvious heuristic:
 * top-positioned links on high-reputation domains are most likely to be clicked.
 *
 * Feature order (must match click-predictor.js buildFeatureVector):
 *   0: position / 10    (normalised position)
 *   1: is_top_3         (1 or 0)
 *   2: domain_reputation (0-1)
 *   3-8: engine one-hot  (google, bing, duckduckgo, yahoo, baidu, yandex)
 */
const DEFAULT_MODEL = Object.freeze({
  version: 'default-heuristic-1.0',
  type: 'gradient_boosted_trees',
  bias: -0.5,
  initialPrediction: -0.5,
  learningRate: 1.0,
  threshold: 0.5,
  trees: [
    /* Tree 1: Split on is_top_3 (feature 1) */
    {
      splitColumn: 1,
      splitValue: 0.5,
      left: {
        /* is_top_3 = 0 → lower probability */
        splitColumn: 0,
        splitValue: 0.5,
        left: {
          /* position > 5 → very low */
          distribution: [80, 20],
        },
        right: {
          /* position 4-5 → moderate */
          distribution: [60, 40],
        },
      },
      right: {
        /* is_top_3 = 1 → higher probability */
        splitColumn: 2,
        splitValue: 0.7,
        left: {
          /* low reputation domain in top 3 */
          distribution: [40, 60],
        },
        right: {
          /* high reputation domain in top 3 → very likely clicked */
          distribution: [20, 80],
        },
      },
    },
    /* Tree 2: Boost domain reputation signal */
    {
      splitColumn: 2,
      splitValue: 0.85,
      left: {
        /* reputation < 0.85 */
        splitColumn: 0,
        splitValue: 0.3,
        left: {
          /* low position + low reputation */
          distribution: [75, 25],
        },
        right: {
          /* high position + moderate reputation */
          distribution: [50, 50],
        },
      },
      right: {
        /* reputation >= 0.85 (wikipedia, github, stackoverflow) */
        distribution: [25, 75],
      },
    },
  ],
});

/**
 * Initialize the model loader.
 * Loads the cached model from disk if available, otherwise uses default.
 */
function init() {
  modelPath = path.join(app.getPath('userData'), 'ml-model.json');

  /* Load cached model from disk */
  try {
    if (fs.existsSync(modelPath)) {
      const raw = fs.readFileSync(modelPath, 'utf-8');
      const parsed = JSON.parse(raw);

      /* Handle both flat format and nested { model: ... } format */
      if (parsed.trees && Array.isArray(parsed.trees)) {
        model = parsed;
        modelVersion = parsed.version || 'local';
      } else if (parsed.model && parsed.model.trees) {
        model = parsed.model;
        modelVersion = parsed.version || parsed.model.version || 'local';
      } else {
        model = parsed;
        modelVersion = parsed.version || 'local';
      }

      logger.info('ML model loaded from cache', { version: modelVersion });
      return;
    }
  } catch (err) {
    logger.warn('Failed to load cached ML model', { message: err.message });
  }

  /* No cached model — use the built-in default */
  model = DEFAULT_MODEL;
  modelVersion = DEFAULT_MODEL.version;
  logger.info('Using default heuristic ML model', { version: modelVersion });
}

/**
 * Check the cloud API for a newer model version and download if available.
 *
 * @returns {Promise<boolean>} true if a new model was downloaded
 */
async function refreshModel() {
  try {
    /* Check latest model version */
    const versionRes = await fetch(`${API_BASE}/api/v1/model/latest`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!versionRes.ok) {
      /* No model available on server — this is normal for new installations */
      if (versionRes.status === 404) {
        logger.debug('No trained model available on server yet');
      } else {
        logger.debug('ML model check: API returned non-OK', { status: versionRes.status });
      }
      return false;
    }

    const data = await versionRes.json();
    const serverVersion = data.data?.version || data.version;

    /* Compare versions */
    if (serverVersion && serverVersion === modelVersion) {
      logger.debug('ML model is up to date', { version: modelVersion });
      return false;
    }

    /* Download the actual model file from /download endpoint */
    const downloadRes = await fetch(`${API_BASE}/api/v1/model/download`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!downloadRes.ok) {
      logger.debug('ML model download failed', { status: downloadRes.status });
      return false;
    }

    const modelData = await downloadRes.json();

    if (modelData && modelData.trees) {
      model = modelData;
      modelVersion = modelData.version || serverVersion || 'remote';

      /* Save to disk */
      fs.writeFileSync(modelPath, JSON.stringify({
        version: modelVersion,
        ...modelData,
        downloadedAt: new Date().toISOString(),
      }), 'utf-8');

      logger.info('ML model updated from server', { version: modelVersion });
      return true;
    }

    return false;
  } catch (err) {
    logger.debug('ML model refresh failed (API unreachable)', {
      message: err.message,
    });
    return false;
  }
}

/**
 * Get the currently loaded model.
 *
 * @returns {object|null} The model object, or null if no model is available
 */
function getModel() {
  return model;
}

/**
 * Get the current model version.
 *
 * @returns {string|null}
 */
function getModelVersion() {
  return modelVersion;
}

/**
 * Check if a model is currently loaded.
 *
 * @returns {boolean}
 */
function hasModel() {
  return model !== null;
}

module.exports = {
  init,
  refreshModel,
  getModel,
  getModelVersion,
  hasModel,
};
