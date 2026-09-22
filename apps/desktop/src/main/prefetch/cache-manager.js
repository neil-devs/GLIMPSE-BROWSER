/**
 * @fileoverview Prefetch cache manager.
 * Tracks all prefetched URLs with metadata and enforces cache size limits
 * using an LRU eviction strategy.
 * @module desktop/prefetch/cache-manager
 */

'use strict';

const { logger } = require('../utils/logger');
const settings = require('../storage/settings');

/**
 * In-memory prefetch cache tracking.
 *
 * @typedef {object} CacheEntry
 * @property {string} url
 * @property {number} sizeBytes - Estimated size of the prefetched content
 * @property {number} timestamp - When the prefetch was recorded (ms since epoch)
 * @property {number} hitCount - Number of times user navigated to this URL from cache
 * @property {number} lastAccessedAt - Last time this entry was accessed
 */

/** @type {Map<string, CacheEntry>} */
const cache = new Map();

/** Maximum cache size in bytes (loaded from settings, default 500MB) */
let maxCacheSizeBytes = 500 * 1024 * 1024;

/**
 * Initialize the cache manager with current settings.
 */
function init() {
  const limitMb = settings.get('cacheSizeLimitMb', 500);
  maxCacheSizeBytes = limitMb * 1024 * 1024;
  logger.debug('Cache manager initialized', { maxCacheSizeMb: limitMb });
}

/**
 * Record a prefetched URL in the cache.
 *
 * @param {string} url - The prefetched URL
 * @param {number} [sizeBytes=0] - Estimated size in bytes
 */
function recordPrefetch(url, sizeBytes = 0) {
  cache.set(url, {
    url,
    sizeBytes,
    timestamp: Date.now(),
    hitCount: 0,
    lastAccessedAt: Date.now(),
  });

  /* Enforce cache size limit */
  enforceSizeLimit();
}

/**
 * Record a cache hit — user navigated to a prefetched URL.
 *
 * @param {string} url
 */
function recordHit(url) {
  const entry = cache.get(url);
  if (entry) {
    entry.hitCount++;
    entry.lastAccessedAt = Date.now();
  }
}

/**
 * Check if a URL has been prefetched and is in the cache.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isPrefetched(url) {
  return cache.has(url);
}

/**
 * Get all cached URLs.
 *
 * @returns {string[]}
 */
function getCachedUrls() {
  return [...cache.keys()];
}

/**
 * Get cache status summary.
 *
 * @returns {{ count: number, totalSizeMb: string, urls: string[], maxSizeMb: number, hitRate: number }}
 */
function getStatus() {
  let totalBytes = 0;
  let totalHits = 0;

  for (const entry of cache.values()) {
    totalBytes += entry.sizeBytes;
    totalHits += entry.hitCount;
  }

  return {
    count: cache.size,
    totalSizeMb: (totalBytes / (1024 * 1024)).toFixed(2),
    totalSizeBytes: totalBytes,
    urls: getCachedUrls(),
    maxSizeMb: maxCacheSizeBytes / (1024 * 1024),
    hitRate: cache.size > 0 ? (totalHits / cache.size).toFixed(2) : '0.00',
  };
}

/**
 * Clear all entries from the in-memory cache.
 */
function clearAll() {
  const count = cache.size;
  cache.clear();
  logger.info('Prefetch cache cleared', { entriesCleared: count });
}

/**
 * Update the cache size limit.
 *
 * @param {number} limitMb - New limit in megabytes
 */
function setCacheSizeLimit(limitMb) {
  maxCacheSizeBytes = limitMb * 1024 * 1024;
  enforceSizeLimit();
}

/**
 * Evict oldest entries (LRU) until cache is within size limit.
 */
function enforceSizeLimit() {
  let totalBytes = 0;
  for (const entry of cache.values()) {
    totalBytes += entry.sizeBytes;
  }

  if (totalBytes <= maxCacheSizeBytes) return;

  /* Sort entries by lastAccessedAt ascending (oldest first) */
  const sortedEntries = [...cache.entries()].sort(
    (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
  );

  let evicted = 0;
  for (const [url, entry] of sortedEntries) {
    if (totalBytes <= maxCacheSizeBytes) break;
    totalBytes -= entry.sizeBytes;
    cache.delete(url);
    evicted++;
  }

  if (evicted > 0) {
    logger.debug('Cache eviction completed', {
      evicted,
      remaining: cache.size,
    });
  }
}

module.exports = {
  init,
  recordPrefetch,
  recordHit,
  isPrefetched,
  getCachedUrls,
  getStatus,
  clearAll,
  setCacheSizeLimit,
};
