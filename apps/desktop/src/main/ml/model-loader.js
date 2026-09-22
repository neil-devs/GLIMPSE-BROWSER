/**
 * @fileoverview ML model loader.
 * Downloads and caches the gradient-boosted decision tree model from the cloud API.
 * Falls back to a local cached version when the API is unreachable.
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

/**
 * Initialize the model loader.
 * Loads the cached model from disk if available.
 */
function init() {
  modelPath = path.join(app.getPath('userData'), 'ml-model.json');

  /* Load cached model from disk */
  try {
    if (fs.existsSync(modelPath)) {
      const raw = fs.readFileSync(modelPath, 'utf-8');
      const parsed = JSON.parse(raw);
      model = parsed.model || parsed;
      modelVersion = parsed.version || 'local';
      logger.info('ML model loaded from cache', { version: modelVersion });
    }
  } catch (err) {
    logger.warn('Failed to load cached ML model', { message: err.message });
    model = null;
  }
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
      logger.debug('ML model check: API returned non-OK', { status: versionRes.status });
      return false;
    }

    const data = await versionRes.json();

    /* Compare versions */
    if (data.version && data.version === modelVersion) {
      logger.debug('ML model is up to date', { version: modelVersion });
      return false;
    }

    /* Download the new model */
    if (data.model) {
      model = data.model;
      modelVersion = data.version || 'remote';

      /* Save to disk */
      fs.writeFileSync(modelPath, JSON.stringify({
        version: modelVersion,
        model: data.model,
        downloadedAt: new Date().toISOString(),
      }), 'utf-8');

      logger.info('ML model updated', { version: modelVersion });
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
