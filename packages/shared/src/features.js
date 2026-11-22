/**
 * @fileoverview Single source of truth for ML features across training and serving.
 * Prevents train/serve skew by defining the exact schema, feature vector layout,
 * and normalisation logic used by both the trainer (cloud-api) and predictor (desktop).
 *
 * PRIVACY RULE: Never incorporates raw query text, user identifiers, or decision-time leakage
 * (such as wasPrefetched, prefetchDuration, or clickClass).
 *
 * @module @glimpse/shared/features
 */

'use strict';

const FEATURE_SCHEMA_VERSION = 2;

const ENGINES = Object.freeze([
  'google',
  'bing',
  'duckduckgo',
  'yahoo',
  'baidu',
  'yandex',
]);

const TLDS = Object.freeze([
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'in',
  'other',
]);

const SCRIPTS = Object.freeze([
  'latin',
  'cjk',
  'cyrillic',
  'other',
]);

const INTENTS = Object.freeze([
  'informational',
  'transactional',
  'navigational',
  'code',
  'video',
  'news',
]);

/**
 * Ordered list of all feature names in the vector.
 * Length must match buildFeatures().length exactly.
 */
const FEATURE_NAMES = Object.freeze([
  'position',
  'position_normalized',
  'is_top3',
  'visible_on_load',

  /* Engine one-hot (6) */
  'engine_google',
  'engine_bing',
  'engine_duckduckgo',
  'engine_yahoo',
  'engine_baidu',
  'engine_yandex',

  /* TLD class one-hot (7) */
  'tld_com',
  'tld_org',
  'tld_net',
  'tld_edu',
  'tld_gov',
  'tld_in',
  'tld_other',

  /* Link & URL features */
  'url_depth',
  'link_text_length_bucket',

  /* Query features (coarse only) */
  'query_length_bucket',
  'query_word_count',
  'query_has_digit',
  'query_has_year',
  'query_is_question',
  'query_has_site_operator',

  /* Script one-hot (4) */
  'query_script_latin',
  'query_script_cjk',
  'query_script_cyrillic',
  'query_script_other',

  /* Intent flags (6) */
  'query_intent_informational',
  'query_intent_transactional',
  'query_intent_navigational',
  'query_intent_code',
  'query_intent_video',
  'query_intent_news',

  /* Window dimension buckets */
  'window_width_bucket',
  'window_height_bucket',

  /* Domain history */
  'domain_smoothed_ctr',
  'domain_seen',
]);

/**
 * Bucket helper for link text length.
 * @param {number} len
 * @returns {number} 0..4
 */
function bucketLinkTextLength(len) {
  if (len <= 20) return 0;
  if (len <= 40) return 1;
  if (len <= 60) return 2;
  if (len <= 80) return 3;
  return 4;
}

/**
 * Bucket helper for query length.
 * @param {number} len
 * @returns {number} 0..4
 */
function bucketQueryLength(len) {
  if (len <= 10) return 0;
  if (len <= 25) return 1;
  if (len <= 50) return 2;
  if (len <= 100) return 3;
  return 4;
}

/**
 * Bucket helper for window width.
 * @param {number} width
 * @returns {number} 0..3
 */
function bucketWindowWidth(width) {
  if (width < 1024) return 0;
  if (width < 1440) return 1;
  if (width < 1920) return 2;
  return 3;
}

/**
 * Bucket helper for window height.
 * @param {number} height
 * @returns {number} 0..3
 */
function bucketWindowHeight(height) {
  if (height < 768) return 0;
  if (height < 900) return 1;
  if (height < 1080) return 2;
  return 3;
}

/**
 * Normalize TLD string to our 7-class system.
 * @param {string} tld
 * @returns {string}
 */
function normalizeTld(tld) {
  if (!tld) return 'other';
  const clean = String(tld).toLowerCase().replace(/^\./, '').trim();
  if (TLDS.includes(clean)) return clean;
  return 'other';
}

/**
 * Build a fixed-length numeric feature vector from context and domain statistics.
 *
 * @param {object} ctx
 * @param {number} [ctx.position=1] - 1-based position of the link on results page
 * @param {number} [ctx.visibleCount=10] - Total count of visible results on page
 * @param {boolean|number} [ctx.visibleOnLoad=false] - Was link visible without scrolling
 * @param {string} [ctx.engine='google'] - Search engine name
 * @param {string} [ctx.domain=''] - Domain of result link (e.g. 'en.wikipedia.org')
 * @param {string} [ctx.tld=''] - Top-level domain (e.g. 'org')
 * @param {number} [ctx.urlDepth=0] - Number of path segments
 * @param {number} [ctx.linkTextLength=0] - Character length of anchor text
 * @param {object} [ctx.queryFeatures={}] - Output from computeQueryFeatures
 * @param {number} [ctx.windowWidth=1280] - Browser window width in px
 * @param {number} [ctx.windowHeight=800] - Browser window height in px
 * @param {Map|object} [domainStats=null] - Domain prior statistics
 * @returns {number[]} Array of numbers corresponding to FEATURE_NAMES
 */
function buildFeatures(ctx = {}, domainStats = null) {
  const position = Math.max(1, Number(ctx.position) || 1);
  const visibleCount = Math.max(1, Number(ctx.visibleCount) || 10);
  const positionNormalized = Number((position / visibleCount).toFixed(4));
  const isTop3 = position <= 3 ? 1 : 0;
  const visibleOnLoad = ctx.visibleOnLoad ? 1 : 0;

  /* Engine one-hot (6) */
  const engine = String(ctx.engine || 'google').toLowerCase();
  const engineVec = ENGINES.map((e) => (engine === e ? 1 : 0));

  /* TLD one-hot (7) */
  let tld = ctx.tld;
  if (!tld && ctx.domain) {
    const parts = ctx.domain.toLowerCase().split('.');
    tld = parts[parts.length - 1];
  }
  const normalizedTld = normalizeTld(tld);
  const tldVec = TLDS.map((t) => (normalizedTld === t ? 1 : 0));

  /* Link & URL features */
  const urlDepth = Math.max(0, Math.min(Number(ctx.urlDepth) || 0, 10));
  const linkTextLengthBucket = bucketLinkTextLength(Math.max(0, Number(ctx.linkTextLength) || 0));

  /* Query features */
  const qf = ctx.queryFeatures || {};
  const queryLengthBucket = bucketQueryLength(Math.max(0, Number(qf.length) || 0));
  const queryWordCount = Math.max(0, Math.min(Number(qf.wordCount) || 0, 20));
  const queryHasDigit = qf.hasDigit ? 1 : 0;
  const queryHasYear = qf.hasYear ? 1 : 0;
  const queryIsQuestion = qf.isQuestion ? 1 : 0;
  const queryHasSiteOperator = qf.hasSiteOperator ? 1 : 0;

  /* Script one-hot (4) */
  const script = String(qf.script || 'latin').toLowerCase();
  const scriptVec = SCRIPTS.map((s) => (script === s ? 1 : 0));
  // Fallback to 'other' if no match
  if (!scriptVec.includes(1)) scriptVec[3] = 1;

  /* Intent flags (6) */
  const intent = qf.intent || {};
  const intentVec = INTENTS.map((i) => (intent[i] ? 1 : 0));

  /* Window buckets */
  const windowWidthBucket = bucketWindowWidth(Number(ctx.windowWidth) || 1280);
  const windowHeightBucket = bucketWindowHeight(Number(ctx.windowHeight) || 800);

  /* Domain statistics lookup (Bayesian smoothed CTR) */
  const domain = String(ctx.domain || '').toLowerCase().trim();
  let domainSmoothedCtr = 0.15; // default uninformative prior CTR
  let domainSeen = 0;

  if (domain && domainStats) {
    let stat = null;
    if (typeof domainStats.get === 'function') {
      stat = domainStats.get(domain);
    } else if (typeof domainStats === 'object' && domain in domainStats) {
      stat = domainStats[domain];
    }

    if (stat) {
      domainSeen = 1;
      if (typeof stat.smoothedCtr === 'number') {
        domainSmoothedCtr = stat.smoothedCtr;
      } else if (typeof stat.ctr === 'number') {
        domainSmoothedCtr = stat.ctr;
      } else if (typeof stat === 'number') {
        domainSmoothedCtr = stat;
      }
    }
  }

  const features = [
    position,
    positionNormalized,
    isTop3,
    visibleOnLoad,
    ...engineVec,
    ...tldVec,
    urlDepth,
    linkTextLengthBucket,
    queryLengthBucket,
    queryWordCount,
    queryHasDigit,
    queryHasYear,
    queryIsQuestion,
    queryHasSiteOperator,
    ...scriptVec,
    ...intentVec,
    windowWidthBucket,
    windowHeightBucket,
    Number(domainSmoothedCtr.toFixed(4)),
    domainSeen,
  ];

  return features;
}

module.exports = {
  FEATURE_SCHEMA_VERSION,
  FEATURE_NAMES,
  ENGINES,
  TLDS,
  SCRIPTS,
  INTENTS,
  buildFeatures,
  normalizeTld,
  bucketLinkTextLength,
  bucketQueryLength,
  bucketWindowWidth,
  bucketWindowHeight,
};
