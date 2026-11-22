/**
 * @fileoverview Dataset loader, cleaner, and splitter for ML training.
 * Enforces strict train/test separation, group-based splitting, and privacy.
 *
 * Rules:
 * - Real rows only (is_synthetic=false unless --include-synthetic)
 * - Drops outlier installs (>300 searches/day, impossible timings)
 * - Filters for searches with >= 1 click (all impressions of those searches kept)
 * - Group split by install_id (when >=5 installs) or search_event_id (when <5 installs)
 * - Computes domainStats (Bayesian-smoothed CTR, top 5,000 domains) on TRAIN split only
 * - Uses @glimpse/shared/features buildFeatures for train/serve parity
 *
 * @module cloud-api/ml/dataset
 */

'use strict';

const { supabase } = require('../db/client');
const { buildFeatures, FEATURE_NAMES } = require('@glimpse/shared/features');
const logger = require('../utils/logger');

const OUTLIER_SEARCHES_PER_DAY = 300;
const SMOOTHING_PRIOR_WEIGHT = 20; // M in Bayesian smoothing
const DEFAULT_GLOBAL_PRIOR = 0.15;

/**
 * Deterministic pseudo-random number generator for reproducible splits.
 * @param {string} str
 * @returns {number} 0..1
 */
function hashToFloat(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) / 2147483648;
}

/**
 * Fetch and build training dataset from Supabase / Postgres.
 *
 * @param {object} options
 * @param {boolean} [options.includeSynthetic=false]
 * @param {number} [options.testFraction=0.2]
 * @returns {Promise<object>} { train: { X, y, groups }, test: { X, y, groups }, domainStats, report }
 */
async function loadDataset(options = {}) {
  const includeSynthetic = Boolean(options.includeSynthetic);
  const testFraction = options.testFraction || 0.2;

  logger.info('[ML:dataset] Loading dataset from database...', { includeSynthetic });

  /* 1. Fetch searches */
  let searchQuery = supabase
    .from('search_events')
    .select('*')
    .order('searched_at', { ascending: false })
    .limit(100000);

  if (!includeSynthetic) {
    searchQuery = searchQuery.eq('is_synthetic', false);
  }

  const { data: rawSearches, error: searchError } = await searchQuery;
  if (searchError) throw searchError;

  const totalSearchesFetched = (rawSearches || []).length;
  logger.info(`[ML:dataset] Fetched ${totalSearchesFetched} search events`);

  /* 2. Outlier install filter: count searches per install per day */
  const installDayCounts = new Map();
  for (const s of rawSearches || []) {
    if (!s.install_id) continue;
    const day = s.searched_at ? s.searched_at.slice(0, 10) : 'unknown';
    const key = `${s.install_id}_${day}`;
    installDayCounts.set(key, (installDayCounts.get(key) || 0) + 1);
  }

  const outlierInstalls = new Set();
  for (const [key, count] of installDayCounts) {
    if (count > OUTLIER_SEARCHES_PER_DAY) {
      const installId = key.split('_')[0];
      outlierInstalls.add(installId);
    }
  }

  if (outlierInstalls.size > 0) {
    logger.warn(`[ML:dataset] Identified ${outlierInstalls.size} outlier installs (>300 searches/day)`);
  }

  const filteredSearches = (rawSearches || []).filter((s) => {
    if (s.install_id && outlierInstalls.has(s.install_id)) return false;
    return true;
  });

  const searchMap = new Map();
  for (const s of filteredSearches) {
    searchMap.set(s.id, s);
    if (s.client_event_id) {
      searchMap.set(s.client_event_id, s);
    }
  }

  /* 3. Fetch result links */
  let linkQuery = supabase
    .from('result_link_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200000);

  if (!includeSynthetic) {
    linkQuery = linkQuery.eq('is_synthetic', false);
  }

  const { data: rawLinks, error: linkError } = await linkQuery;
  if (linkError) throw linkError;

  logger.info(`[ML:dataset] Fetched ${(rawLinks || []).length} link events`);

  /* Group links by search_event_id */
  const searchToLinks = new Map();
  for (const l of rawLinks || []) {
    const sId = l.search_event_id;
    if (!sId || !searchMap.has(sId)) continue;

    // Filter impossible timings: e.g. negative firstVisibleMs
    if (typeof l.first_visible_ms === 'number' && l.first_visible_ms < 0) continue;

    if (!searchToLinks.has(sId)) {
      searchToLinks.set(sId, []);
    }
    searchToLinks.get(sId).push(l);
  }

  /* 4. Keep searches with >= 1 click */
  const clickedSearches = [];
  let totalImpressions = 0;
  let totalClicks = 0;

  for (const [sId, links] of searchToLinks) {
    const hasClick = links.some((l) => Boolean(l.was_clicked));
    if (hasClick) {
      clickedSearches.push({
        search: searchMap.get(sId),
        links,
      });
      totalImpressions += links.length;
      totalClicks += links.filter((l) => Boolean(l.was_clicked)).length;
    }
  }

  logger.info(`[ML:dataset] Found ${clickedSearches.length} clicked searches (${totalImpressions} impressions, ${totalClicks} clicks)`);

  /* 5. Group Split: by install_id if >= 5 installs, else by search id */
  const distinctInstalls = new Set();
  for (const item of clickedSearches) {
    if (item.search.install_id) distinctInstalls.add(item.search.install_id);
  }

  const useInstallGroup = distinctInstalls.size >= 5;
  const trainSearches = [];
  const testSearches = [];

  for (const item of clickedSearches) {
    const splitKey = useInstallGroup && item.search.install_id
      ? item.search.install_id
      : (item.search.client_event_id || item.search.id);

    const hashVal = hashToFloat(splitKey);
    if (hashVal < testFraction) {
      testSearches.push(item);
    } else {
      trainSearches.push(item);
    }
  }

  logger.info(`[ML:dataset] Split mode: ${useInstallGroup ? 'by-install' : 'by-search'} | Train: ${trainSearches.length} searches, Test: ${testSearches.length} searches`);

  /* 6. Compute domainStats on TRAIN split only (prevent data leakage) */
  const domainCounts = new Map(); // domain -> { impressions, clicks }
  let trainTotalClicks = 0;
  let trainTotalImpressions = 0;

  for (const item of trainSearches) {
    for (const l of item.links) {
      const d = (l.domain || '').toLowerCase().trim();
      if (!d) continue;
      trainTotalImpressions++;
      const isClicked = Boolean(l.was_clicked);
      if (isClicked) trainTotalClicks++;

      if (!domainCounts.has(d)) {
        domainCounts.set(d, { impressions: 0, clicks: 0 });
      }
      const st = domainCounts.get(d);
      st.impressions++;
      if (isClicked) st.clicks++;
    }
  }

  const globalPriorCtr = trainTotalImpressions > 0
    ? (trainTotalClicks / trainTotalImpressions)
    : DEFAULT_GLOBAL_PRIOR;

  // Compute Bayesian smoothed CTR and keep top 5000 domains
  const sortedDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1].impressions - a[1].impressions)
    .slice(0, 5000);

  const domainStats = {};
  for (const [dom, st] of sortedDomains) {
    const smoothedCtr = Number(
      ((st.clicks + SMOOTHING_PRIOR_WEIGHT * globalPriorCtr) /
       (st.impressions + SMOOTHING_PRIOR_WEIGHT)).toFixed(4)
    );
    domainStats[dom] = {
      impressions: st.impressions,
      clicks: st.clicks,
      smoothedCtr,
    };
  }

  /* 7. Vectorize Train and Test examples using buildFeatures */
  function vectorizeSplit(sessions) {
    const X = [];
    const y = [];
    const groups = []; // for group ranking / evaluation

    for (const item of sessions) {
      const s = item.search;
      const links = item.links;
      const searchGroupKey = s.client_event_id || s.id;

      for (const l of links) {
        const ctx = {
          position: l.link_position,
          visibleCount: s.result_count_visible || links.length,
          visibleOnLoad: l.was_visible_on_load,
          engine: s.search_engine,
          domain: l.domain,
          tld: l.tld,
          urlDepth: l.url_depth || 0,
          linkTextLength: l.link_text_length || 0,
          queryFeatures: s.query_features || {},
          windowWidth: s.window_width || 1280,
          windowHeight: s.window_height || 800,
        };

        const fVec = buildFeatures(ctx, domainStats);
        X.push(fVec);
        y.push(Boolean(l.was_clicked) ? 1 : 0);
        groups.push(searchGroupKey);
      }
    }

    return { X, y, groups };
  }

  const trainData = vectorizeSplit(trainSearches);
  const testData = vectorizeSplit(testSearches);

  /* 8. Data quality report */
  const engineDistribution = {};
  for (const item of clickedSearches) {
    const eng = item.search.search_engine || 'unknown';
    engineDistribution[eng] = (engineDistribution[eng] || 0) + 1;
  }

  const qualityReport = {
    totalSearches: totalSearchesFetched,
    clickedSearches: clickedSearches.length,
    trainSearches: trainSearches.length,
    testSearches: testSearches.length,
    trainRows: trainData.X.length,
    testRows: testData.X.length,
    clickRate: totalImpressions > 0 ? Number((totalClicks / totalImpressions).toFixed(4)) : 0,
    outlierInstallsDropped: outlierInstalls.size,
    engineDistribution,
    domainCountTracked: Object.keys(domainStats).length,
    globalPriorCtr: Number(globalPriorCtr.toFixed(4)),
  };

  return {
    train: trainData,
    test: testData,
    domainStats,
    qualityReport,
  };
}

module.exports = {
  loadDataset,
};
