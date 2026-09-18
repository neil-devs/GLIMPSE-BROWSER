/**
 * @fileoverview Feature engineering for click prediction ML model.
 * Transforms raw result_link_events into numerical feature vectors.
 * @module cloud-api/ml/feature-engineer
 */

'use strict';

const { DOMAIN_REPUTATION, SEARCH_ENGINES } = require('@glimpse/shared/constants');

/**
 * Feature names in the order they appear in the vector.
 * This order MUST match across training, evaluation, and client-side inference.
 */
const FEATURE_NAMES = Object.freeze([
  'link_position_norm',       // 0: Position normalised 0-1 (1=top)
  'is_top_3',                 // 1: Boolean — is the link in the top 3?
  'domain_reputation',        // 2: Domain reputation score 0-1
  'engine_google',            // 3: One-hot: Google
  'engine_bing',              // 4: One-hot: Bing
  'engine_duckduckgo',        // 5: One-hot: DuckDuckGo
  'engine_yahoo',             // 6: One-hot: Yahoo
  'engine_baidu',             // 7: One-hot: Baidu
  'engine_yandex',            // 8: One-hot: Yandex
  'query_length_short',       // 9: One-hot: query < 20 chars
  'query_length_medium',      // 10: One-hot: 20 <= query < 50 chars
  'query_length_long',        // 11: One-hot: query >= 50 chars
  'was_prefetched',           // 12: Boolean
  'prefetch_duration_norm',   // 13: Normalised prefetch duration
]);

const FEATURE_COUNT = FEATURE_NAMES.length;

/**
 * Get domain reputation score.
 * Checks exact domain, then strips 'www.' prefix.
 * @param {string} domain
 * @returns {number} Score between 0 and 1
 */
function getDomainReputation(domain) {
  if (!domain) return DOMAIN_REPUTATION._default;

  const lower = domain.toLowerCase();
  if (DOMAIN_REPUTATION[lower] !== undefined) {
    return DOMAIN_REPUTATION[lower];
  }

  /* Try without www. prefix */
  const stripped = lower.replace(/^www\./, '');
  if (DOMAIN_REPUTATION[stripped] !== undefined) {
    return DOMAIN_REPUTATION[stripped];
  }

  /* Try top-level domain (e.g. 'en.wikipedia.org' → 'wikipedia.org') */
  const parts = stripped.split('.');
  if (parts.length > 2) {
    const tld = parts.slice(-2).join('.');
    if (DOMAIN_REPUTATION[tld] !== undefined) {
      return DOMAIN_REPUTATION[tld];
    }
  }

  return DOMAIN_REPUTATION._default;
}

/**
 * Build a feature vector from a single link event.
 *
 * @param {object} linkEvent
 * @param {number} linkEvent.linkPosition - 1-indexed position
 * @param {string} linkEvent.domain
 * @param {string} linkEvent.searchEngine - Engine name
 * @param {string} linkEvent.queryText - Search query
 * @param {boolean} linkEvent.wasPrefetched
 * @param {number} [linkEvent.prefetchDurationMs=0]
 * @returns {Float64Array} Feature vector of length FEATURE_COUNT
 */
function buildFeatureVector(linkEvent) {
  const features = new Float64Array(FEATURE_COUNT);

  /* Position (normalised: 1→1.0, 10→0.1) */
  const pos = Math.max(1, Math.min(linkEvent.linkPosition || 1, 10));
  features[0] = 1 - (pos - 1) / 9; /* position 1 = 1.0, position 10 = 0.0 */

  /* Is top 3 */
  features[1] = pos <= 3 ? 1 : 0;

  /* Domain reputation */
  features[2] = getDomainReputation(linkEvent.domain);

  /* One-hot engine encoding */
  const engineIndex = SEARCH_ENGINES.indexOf(linkEvent.searchEngine);
  if (engineIndex >= 0) {
    features[3 + engineIndex] = 1;
  }

  /* Query length bucket (one-hot) */
  const queryLen = (linkEvent.queryText || '').length;
  if (queryLen < 20) {
    features[9] = 1;
  } else if (queryLen < 50) {
    features[10] = 1;
  } else {
    features[11] = 1;
  }

  /* Was prefetched */
  features[12] = linkEvent.wasPrefetched ? 1 : 0;

  /* Prefetch duration (normalised: 0-5000ms → 0-1) */
  const duration = linkEvent.prefetchDurationMs || 0;
  features[13] = Math.min(duration / 5000, 1);

  return features;
}

/**
 * Build a complete training dataset from an array of link event rows.
 *
 * @param {Array<object>} rows - Array of link event objects
 * @returns {{ X: number[][], y: number[], featureNames: string[] }}
 */
function buildTrainingDataset(rows) {
  const X = [];
  const y = [];

  for (const row of rows) {
    const features = buildFeatureVector({
      linkPosition: row.linkPosition,
      domain: row.domain,
      searchEngine: row.searchEngine,
      queryText: row.queryText,
      wasPrefetched: row.wasPrefetched,
      prefetchDurationMs: row.prefetchDurationMs,
    });

    X.push(Array.from(features));
    y.push(row.wasClicked ? 1 : 0);
  }

  return { X, y, featureNames: [...FEATURE_NAMES] };
}

module.exports = {
  FEATURE_NAMES,
  FEATURE_COUNT,
  getDomainReputation,
  buildFeatureVector,
  buildTrainingDataset,
};
