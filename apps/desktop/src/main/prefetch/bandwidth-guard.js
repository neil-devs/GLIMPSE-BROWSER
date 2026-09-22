/**
 * @fileoverview Bandwidth guard for the prefetch engine.
 * Prevents prefetching from overwhelming slow or metered network connections.
 * Uses heuristics based on settings and estimated bandwidth.
 * @module desktop/prefetch/bandwidth-guard
 */

'use strict';

const settings = require('../storage/settings');
const { logger } = require('../utils/logger');

/** Current estimated bandwidth in Mbps */
let estimatedBandwidthMbps = 10;

/** Current network type */
let networkType = 'unknown';

/** Whether the connection is metered (cellular) */
let isMetered = false;

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

  logger.debug('Network info updated', {
    bandwidth: estimatedBandwidthMbps,
    type: networkType,
    metered: isMetered,
  });
}

/**
 * Determine whether prefetching should proceed for a given URL.
 *
 * Rules:
 * 1. If prefetch is disabled in settings → block
 * 2. If connection is metered and prefetch_on_metered_network is false → block
 * 3. If estimated bandwidth < 1 Mbps → only allow conservative mode
 * 4. Otherwise → allow
 *
 * @param {string} [_url] - The URL to potentially prefetch (reserved for domain-level blocking)
 * @returns {{ allowed: boolean, reason?: string, suggestedAggressiveness?: string }}
 */
function shouldPrefetch(_url) {
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

  /* Bandwidth-based restrictions */
  if (estimatedBandwidthMbps < 0.5) {
    return {
      allowed: false,
      reason: 'insufficient_bandwidth',
    };
  }

  if (estimatedBandwidthMbps < 1) {
    return {
      allowed: true,
      suggestedAggressiveness: 'conservative',
    };
  }

  if (estimatedBandwidthMbps > 10) {
    return {
      allowed: true,
      suggestedAggressiveness: 'aggressive',
    };
  }

  return { allowed: true };
}

/**
 * Get the current estimated network type.
 * @returns {'wifi'|'ethernet'|'cellular'|'unknown'}
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
  shouldPrefetch,
  getNetworkType,
  getBandwidth,
  getIsMetered,
};
