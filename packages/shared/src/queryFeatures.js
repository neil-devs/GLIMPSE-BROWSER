/**
 * @fileoverview Coarse query feature extraction for Glimpse Browser.
 * Single source of truth for query categorization and statistical features.
 *
 * Privacy by design:
 * NEVER extracts, stores, or transmits raw query text.
 * Only returns statistical counts, script identification, and coarse intent flags.
 *
 * @module @glimpse/shared/queryFeatures
 */

'use strict';

/**
 * Compute coarse query features from search text.
 * Safe for telemetry and ML feature engineering.
 *
 * @param {string} [rawText=''] - Raw search query text (ephemeral, not retained)
 * @returns {object} Coarse query features object
 */
function computeQueryFeatures(rawText) {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  const lower = text.toLowerCase();

  const length = text.length;
  const words = text.length > 0 ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  const hasDigit = /\d/.test(text) ? 1 : 0;
  const hasYear = /\b(19\d\d|20\d\d)\b/.test(text) ? 1 : 0;
  const isQuestion = (
    /^(what|how|why|when|where|who|which|is|are|can|does|do|should|would)\b/i.test(lower) ||
    text.includes('?')
  ) ? 1 : 0;
  const hasSiteOperator = /\bsite:\S+/i.test(text) ? 1 : 0;

  /* Script classification */
  let script = 'latin';
  if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text)) {
    script = 'cjk';
  } else if (/[\u0400-\u04ff]/.test(text)) {
    script = 'cyrillic';
  } else if (text.length > 0 && !/^[a-zA-Z0-9\s.,!?'"~`@#$%^&*()_+=\-[\]{}|\\:;<>/\u00C0-\u024F]+$/.test(text)) {
    script = 'other';
  }

  /* Coarse intent detection flags */
  const intent = {
    informational: (
      /^(what|how|why|when|where|who|which|guide|tutorial|wiki|learn|tips|doc|documentation|meaning|definition|difference|example)\b/i.test(lower) ||
      /\b(guide|tutorial|wiki|learn|doc|documentation|meaning|definition)\b/i.test(lower)
    ) ? 1 : 0,
    transactional: /\b(buy|price|cheap|order|discount|deal|coupon|shop|store|sale|cost|purchase|hire|booking|flight|hotel)\b/i.test(lower) ? 1 : 0,
    navigational: /\b(login|signin|sign-in|log-in|portal|official|homepage|account|dashboard|web|download|app)\b/i.test(lower) ? 1 : 0,
    code: /\b(github|gitlab|npm|pip|api|error|exception|function|class|code|python|javascript|typescript|rust|cpp|golang|java|css|html|react|sql|stack\s*overflow)\b/i.test(lower) ? 1 : 0,
    video: /\b(video|youtube|watch|movie|trailer|stream|clip|film|song|audio|mp3|mp4)\b/i.test(lower) ? 1 : 0,
    news: /\b(news|today|latest|breaking|update|report|headline|live|weather|score)\b/i.test(lower) ? 1 : 0,
  };

  return {
    length,
    wordCount,
    hasDigit,
    hasYear,
    isQuestion,
    hasSiteOperator,
    script,
    intent,
  };
}

module.exports = {
  computeQueryFeatures,
};
