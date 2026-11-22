/**
 * @fileoverview Main telemetry client for desktop.
 * Manages anonymous install identifier, user consent, data deletion, and session routing.
 *
 * Privacy Guarantees:
 * - Anonymous random UUID installId stored in local_settings (never derived from hardware).
 * - Strict consent gating: Nothing is ever queued or sent unless consent === 'granted'.
 * - TELEMETRY_ENABLED=false environment variable acts as a kill switch.
 * - GLIMPSE_TELEMETRY_DEBUG=1 logs payloads to stdout instead of sending them.
 * - Full data deletion: Sends deletion request to server, clears local queue, rotates installId.
 *
 * @module desktop/telemetry/telemetry-client
 */

'use strict';

const { randomUUID } = require('node:crypto');
const settings = require('../storage/settings');
const queue = require('./telemetry-queue');
const { logger } = require('../utils/logger');

const PREFIX = '[glimpse:telemetry]';

let isInitialized = false;

/**
 * Get or create the anonymous install identifier.
 * Stored in local_settings. Never derived from hardware or OS identifiers.
 *
 * @returns {string} UUID v4
 */
function getInstallId() {
  let installId = settings.get('telemetry_install_id');
  if (!installId || typeof installId !== 'string') {
    installId = randomUUID();
    settings.set('telemetry_install_id', installId);
    logger.info(`${PREFIX} Generated new anonymous installId`, { installId });
  }
  return installId;
}

/**
 * Get current user telemetry consent status.
 * @returns {'granted'|'denied'|'unset'}
 */
function getConsent() {
  if (process.env.TELEMETRY_ENABLED === 'false') {
    return 'denied';
  }
  const consent = settings.get('telemetry_consent', null);
  if (consent === 'granted' || consent === 'denied') {
    return consent;
  }
  return 'unset';
}

/**
 * Set user telemetry consent.
 * @param {'granted'|'denied'} status
 */
function setConsent(status) {
  const normalized = status === 'granted' ? 'granted' : 'denied';
  settings.set('telemetry_consent', normalized);
  logger.info(`${PREFIX} Telemetry consent updated`, { status: normalized });

  if (normalized === 'granted') {
    queue.startQueue();
  } else {
    queue.stopQueue();
    queue.clearQueue();
  }
}

/**
 * Check if telemetry collection and sending is active.
 * @returns {boolean}
 */
function hasConsent() {
  if (process.env.TELEMETRY_ENABLED === 'false') return false;
  return getConsent() === 'granted';
}

/**
 * Record a completed search session into the queue.
 * Discarded immediately if consent is not granted.
 *
 * @param {object} session - { search: object, links: object[] }
 */
function recordSession(session) {
  if (!hasConsent()) {
    return;
  }

  // Ensure installId is attached to search context
  if (session && session.search) {
    session.search.installId = getInstallId();
  }

  queue.enqueue(session);
}

/**
 * Delete all server-side and local telemetry data for this installation.
 * Calls DELETE /telemetry/data and rotates the install identifier.
 *
 * @returns {Promise<boolean>}
 */
async function deleteMyTelemetryData() {
  const currentInstallId = getInstallId();
  const apiBaseUrl = (process.env.GLIMPSE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

  logger.info(`${PREFIX} Deleting all telemetry data for install`, { installId: currentInstallId });

  // 1. Clear local SQLite queue
  queue.clearQueue();

  // 2. Rotate install ID immediately to break linkage
  const newInstallId = randomUUID();
  settings.set('telemetry_install_id', newInstallId);

  // 3. Request deletion on cloud API
  try {
    const response = await fetch(`${apiBaseUrl}/telemetry/data`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ installId: currentInstallId }),
    });

    if (response.ok) {
      logger.info(`${PREFIX} Remote telemetry data deleted successfully`);
      return true;
    } else {
      logger.warn(`${PREFIX} Remote delete request returned non-OK status`, { status: response.status });
      return false;
    }
  } catch (err) {
    logger.warn(`${PREFIX} Failed to reach cloud API for deletion`, { error: err.message });
    return false;
  }
}

/**
 * Initialize telemetry subsystem on app startup.
 */
function init() {
  if (isInitialized) return;
  isInitialized = true;

  const apiUrl = process.env.GLIMPSE_API_URL || 'http://localhost:3001';
  queue.setApiBaseUrl(apiUrl);

  if (hasConsent()) {
    queue.startQueue();
    logger.info(`${PREFIX} Subsystem active (consent: granted)`);
  } else {
    logger.info(`${PREFIX} Subsystem idle (consent: ${getConsent()})`);
  }
}

/**
 * Graceful shutdown on app quit: perform a best-effort flush.
 */
async function shutdown() {
  queue.stopQueue();
  if (hasConsent()) {
    try {
      await queue.flush();
    } catch {
      /* best effort */
    }
  }
}

/* ── Compatibility stubs (retires old sync-client telemetry methods) ─ */

function logSearchEvent() { return null; }
function logLinkEvents() { return null; }
function logPrefetchPerformance() { return null; }
function logPageLoad() { return null; }
function logHistoryVisit() { return null; }

module.exports = {
  init,
  shutdown,
  getInstallId,
  getConsent,
  setConsent,
  hasConsent,
  recordSession,
  deleteMyTelemetryData,
  logSearchEvent,
  logLinkEvents,
  logPrefetchPerformance,
  logPageLoad,
  logHistoryVisit,
};
