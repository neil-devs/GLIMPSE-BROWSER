/**
 * @fileoverview Bandwidth guard for the prefetch engine.
 * Prevents prefetching from overwhelming slow or metered network connections.
 * Uses heuristics based on settings and estimated bandwidth.
 *
 * `autoDetectNetwork()` is called by the scheduler before every prefetch
 * decision so the guard always has reasonable defaults even when no renderer
 * has reported Network Information API data.
 *
 * @module desktop/prefetch/bandwidth-guard
 */

'use strict';

const settings = require('../storage/settings');
const { logger } = require('../utils/logger');

/** Current estimated bandwidth in Mbps */
let estimatedBandwidthMbps = 0;

/** Current network type */
let networkType = 'unknown';

/** Whether the connection is metered (cellular) */
let isMetered = false;

/** Whether autoDetect has run at least once */
let hasAutoDetected = false;

/**
 * Update bandwidth estimates from Navigation Timing data.
 * Called by the prefetch scheduler when timing data is received from the renderer.
 *
 * @param {{ downlink?: number, effectiveType?: string, type?: string }} info
 */
function updateNetworkInfo(info) {
  if (info.downlink !== undefined && info.downlink > 0) {
    estimatedBandwidthMbps = info.downlink;
  }

  if (info.type) {
    networkType = info.type;
    isMetered = info.type === 'cellular';
  } else if (info.effectiveType) {
    /* Map effectiveType to bandwidth estimates */
    const typeMap = {
      'slow-2g': 0.05,
      '2g': 0.1,
      '3g': 1.5,
      '4g': 10,
    };
    if (typeMap[info.effectiveType] && !info.downlink) {
      estimatedBandwidthMbps = typeMap[info.effectiveType];
    }
  }

  hasAutoDetected = true;

  logger.debug('Network info updated', {
    bandwidth: estimatedBandwidthMbps,
    type: networkType,
    metered: isMetered,
  });
}

/**
 * Auto-detect network conditions using Electron APIs.
 *
 * Because `updateNetworkInfo` is never called from the renderer on first
 * launch (nothing sends Network Information API data to the main process),
 * this method provides sane defaults so the bandwidth guard does not block
 * prefetching by defaulting to 0 Mbps.
 *
 * Strategy:
 * - On desktop Electron the user is almost always on WiFi/Ethernet.
 * - We assume a moderate 10 Mbps connection (the "balanced" threshold).
 * - If Electron's `net.isOnline()` reports offline we block.
 *
 * If real Network Information data arrives later via `updateNetworkInfo`
 * it will overwrite these defaults.
 */
function autoDetectNetwork() {
  if (hasAutoDetected) return;

  try {
    const { net } = require('electron');

    /* net.isOnline() is available since Electron 21+ */
    if (typeof net.isOnline === 'function' && !net.isOnline()) {
      estimatedBandwidthMbps = 0;
      networkType = 'none';
      isMetered = false;
      hasAutoDetected = true;
      logger.debug('Auto-detect: offline');
      return;
    }
  } catch {
    /* net module may not be available in tests */
  }

  /* Assume a good desktop connection — desktop Electron apps are
   * almost always on broadband. Default high enough to trigger
   * aggressive mode so prefetching starts at full speed on launch. */
  estimatedBandwidthMbps = 50;
  networkType = 'wifi';
  isMetered = false;
  hasAutoDetected = true;

  logger.debug('Auto-detect: assuming broadband @ 50 Mbps');
}

/**
 * Determine whether prefetching should proceed for a given URL.
 *
 * Rules:
 * 1. If prefetch is disabled in settings → block
 * 2. If connection is metered and prefetch_on_metered_network is false → block
 * 3. If estimated bandwidth < 0.5 Mbps → block
 * 4. If estimated bandwidth < 1 Mbps → only allow conservative mode
 * 5. Otherwise → allow
 *
 * @param {string} [_url] - The URL to potentially prefetch (reserved for domain-level blocking)
 * @returns {{ allowed: boolean, reason?: string, suggestedAggressiveness?: string }}
 */
function shouldPrefetch(_url) {
  /* Auto-detect on first call if nobody has fed us info yet */
  if (!hasAutoDetected) {
    autoDetectNetwork();
  }

  /* Check if prefetch is globally enabled */
  const prefetchEnabled = settings.get('prefetchEnabled', true);
  if (!prefetchEnabled) {
    return { allowed: false, reason: 'prefetch_disabled' };
  }

  /* Check metered network setting */
  if (isMetered) {
    const allowOnMetered = settings.get('prefetchOnMeteredNetwork', false);
    if (!allowOnMetered) {
      return { allowed: false, reason: 'metered_network' };
    }
  }

  /* Bandwidth-based restrictions — softened for desktop users.
   * Most desktop users are on broadband; only block at very low speeds. */
  if (estimatedBandwidthMbps < 0.3) {
    return {
      allowed: false,
      reason: 'insufficient_bandwidth',
    };
  }

  if (estimatedBandwidthMbps < 0.8) {
    return {
      allowed: true,
      suggestedAggressiveness: 'conservative',
    };
  }

  if (estimatedBandwidthMbps > 5) {
    return {
      allowed: true,
      suggestedAggressiveness: 'aggressive',
    };
  }

  return { allowed: true };
}

/**
 * Get the current estimated network type.
 * @returns {'wifi'|'ethernet'|'cellular'|'none'|'unknown'}
 */
function getNetworkType() {
  return networkType;
}

/**
 * Get the current estimated bandwidth in Mbps.
 * @returns {number}
 */
function getBandwidth() {
  return estimatedBandwidthMbps;
}

/**
 * Check if the connection is currently metered.
 * @returns {boolean}
 */
function getIsMetered() {
  return isMetered;
}

module.exports = {
  updateNetworkInfo,
  autoDetectNetwork,
  shouldPrefetch,
  getNetworkType,
  getBandwidth,
  getIsMetered,
};
