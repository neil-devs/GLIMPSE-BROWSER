/**
 * @fileoverview ML Model Loader for Desktop Client.
 *
 * Capabilities:
 * - Checks cloud API on startup and every 6 hours for promoted models (/model/latest).
 * - Downloads new model JSON with sha256 checksum verification.
 * - Atomic persistence to userData/ml-model.json (temp file + rename).
 * - Parity verification against golden test vectors on every model load.
 * - Multi-tiered fallback: cached model -> previous backup -> bundled resources/default-model.json.
 *
 * @module desktop/ml/model-loader
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const { logger } = require('../utils/logger');

/** Cached active model in memory */
let activeModel = null;
let activeVersion = 'none';

/** Previous active model for rollback */
let previousModel = null;
let previousVersion = 'none';

/** Local cached file path */
let modelFilePath = '';
let backupFilePath = '';

/** Periodic refresh timer */
let refreshInterval = null;

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Lazy-load clickPredictor to verify parity without circular dependencies.
 */
let clickPredictor = null;
function getClickPredictor() {
  if (!clickPredictor) {
    try {
      clickPredictor = require('./click-predictor');
    } catch {
      clickPredictor = null;
    }
  }
  return clickPredictor;
}

/**
 * Compute sha256 checksum of canonical string.
 * @param {string} str
 * @returns {string}
 */
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Attempt to load the bundled default model from resources.
 * @returns {object|null}
 */
function loadBundledModel() {
  const possiblePaths = [
    path.join(app.getAppPath(), 'resources', 'default-model.json'),
    path.join(process.resourcesPath || '', 'resources', 'default-model.json'),
    path.join(__dirname, '..', '..', '..', 'resources', 'default-model.json'),
    path.join(process.cwd(), 'apps', 'desktop', 'resources', 'default-model.json'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.trees) {
          logger.info('Loaded bundled default ML model', { path: p, version: parsed.version });
          return parsed;
        }
      }
    } catch (err) {
      logger.debug('Failed loading bundled model at path', { path: p, error: err.message });
    }
  }

  return null;
}

/**
 * Validate that a model object is well-formed and passes parity test.
 * @param {object} modelObj
 * @returns {boolean}
 */
function validateModel(modelObj) {
  if (!modelObj || typeof modelObj !== 'object') return false;
  if (!Array.isArray(modelObj.trees) || modelObj.trees.length === 0) return false;

  const predictor = getClickPredictor();
  if (predictor && typeof predictor.verifyParity === 'function') {
    const parityOk = predictor.verifyParity(modelObj);
    if (!parityOk) {
      logger.warn('Model rejected: failed golden vector parity test', {
        version: modelObj.version,
      });
      return false;
    }
  }

  return true;
}

/**
 * Persist model atomically to disk using a temp file + rename.
 * @param {object} modelObj
 */
function saveModelAtomically(modelObj) {
  try {
    const content = JSON.stringify(modelObj, null, 2);
    const tmpPath = `${modelFilePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, content, 'utf8');

    // Create backup of current before overwriting
    if (fs.existsSync(modelFilePath)) {
      try {
        fs.copyFileSync(modelFilePath, backupFilePath);
      } catch {}
    }

    fs.renameSync(tmpPath, modelFilePath);
    logger.info('Model saved atomically to disk', { path: modelFilePath, version: modelObj.version });
  } catch (err) {
    logger.error('Failed to atomically save model file', { error: err.message });
  }
}

/**
 * Initialize model loader.
 */
function init() {
  const userData = app.getPath('userData');
  modelFilePath = path.join(userData, 'ml-model.json');
  backupFilePath = path.join(userData, 'ml-model.backup.json');

  // Tier 1: Try local cached model
  try {
    if (fs.existsSync(modelFilePath)) {
      const raw = fs.readFileSync(modelFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (validateModel(parsed)) {
        activeModel = parsed;
        activeVersion = parsed.version || 'cached';
        logger.info('Active ML model initialized from disk cache', { version: activeVersion });
        startRefreshLoop();
        return;
      }
    }
  } catch (err) {
    logger.warn('Corrupted or invalid cached ML model, checking backup...', { error: err.message });
  }

  // Tier 2: Try backup file
  try {
    if (fs.existsSync(backupFilePath)) {
      const rawBackup = fs.readFileSync(backupFilePath, 'utf8');
      const parsedBackup = JSON.parse(rawBackup);
      if (validateModel(parsedBackup)) {
        activeModel = parsedBackup;
        activeVersion = parsedBackup.version || 'backup';
        logger.info('Active ML model restored from backup file', { version: activeVersion });
        startRefreshLoop();
        return;
      }
    }
  } catch {}

  // Tier 3: Bundled fallback
  const bundled = loadBundledModel();
  if (bundled && validateModel(bundled)) {
    activeModel = bundled;
    activeVersion = bundled.version || 'bundled';
    logger.info('Active ML model initialized from bundled resources', { version: activeVersion });
  } else {
    logger.error('Failed to load any valid ML model (bundled missing or invalid)');
  }

  startRefreshLoop();
}

/**
 * Start periodic 6-hour refresh timer and trigger initial check.
 */
function startRefreshLoop() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    refreshModel().catch(() => {});
  }, REFRESH_INTERVAL_MS);

  // Background check on launch
  setTimeout(() => {
    refreshModel().catch(() => {});
  }, 2000);
}

/**
 * Refresh model from cloud API.
 * @returns {Promise<boolean>} True if updated
 */
async function refreshModel() {
  const apiBase = process.env.CLOUD_API_URL || 'http://localhost:3001';

  try {
    // 1. Fetch latest model metadata
    const metaRes = await fetch(`${apiBase}/api/v1/model/latest`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!metaRes.ok) {
      if (metaRes.status !== 404) {
        logger.debug('Model check non-OK', { status: metaRes.status });
      }
      return false;
    }

    const metaData = await metaRes.json();
    const serverModel = metaData.data || metaData;
    const serverVersion = serverModel.version_string || serverModel.version;
    const serverChecksum = serverModel.checksum_sha256 || serverModel.checksumSha256;

    if (!serverVersion || serverVersion === activeVersion) {
      logger.debug('Active ML model is already up to date', { version: activeVersion });
      return false;
    }

    logger.info('Newer ML model available on cloud API', {
      current: activeVersion,
      available: serverVersion,
    });

    // 2. Download model JSON
    let downloadedJson = serverModel.model_json || null;

    if (!downloadedJson) {
      const downloadRes = await fetch(`${apiBase}/api/v1/model/download`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!downloadRes.ok) {
        logger.warn('Model download failed', { status: downloadRes.status });
        return false;
      }
      downloadedJson = await downloadRes.json();
    }

    // 3. Checksum verification
    if (serverChecksum) {
      // Create canonical string for checksum check
      const toHash = { ...downloadedJson };
      delete toHash.checksumSha256;
      delete toHash.checksum_sha256;
      const computedHash = sha256(JSON.stringify(toHash));

      if (computedHash !== serverChecksum && downloadedJson.checksumSha256 !== serverChecksum) {
        logger.warn('Downloaded model checksum mismatch — download rejected', {
          server: serverChecksum,
          computed: computedHash,
        });
        return false;
      }
    }

    // 4. Parity test
    if (!validateModel(downloadedJson)) {
      logger.warn('Downloaded model failed validation — reverting to current model');
      return false;
    }

    // 5. Promote downloaded model
    previousModel = activeModel;
    previousVersion = activeVersion;

    activeModel = downloadedJson;
    activeVersion = downloadedJson.version || serverVersion;

    saveModelAtomically(downloadedJson);
    logger.info('Successfully updated and promoted new ML model', { version: activeVersion });
    return true;

  } catch (err) {
    logger.debug('ML model refresh skipped / unreachable', { message: err.message });
    return false;
  }
}

/**
 * Get active loaded model.
 * @returns {object|null}
 */
function getModel() {
  return activeModel;
}

/**
 * Get active model version.
 * @returns {string}
 */
function getModelVersion() {
  return activeVersion;
}

/**
 * Check if model is active.
 * @returns {boolean}
 */
function hasModel() {
  return activeModel !== null;
}

module.exports = {
  init,
  refreshModel,
  getModel,
  getModelVersion,
  hasModel,
  validateModel,
};
