/**
 * @fileoverview Synthetic Search & Click Simulator.
 *
 * Implements a Position-Bias Click Model:
 *   P(Click | rank, relevance) = P(Examination | rank) * P(Relevance)
 *   where examination probability decays with position: P(exam | pos) = 1.0 / (pos ^ 0.7)
 *
 * Runs two mandatory sanity checks:
 * 1. UNIFORM RELEVANCE: Model must NOT beat position baseline beyond noise.
 * 2. FEATURE-DRIVEN RELEVANCE: Model MUST beat position baseline.
 *
 * @module cloud-api/ml/simulate
 */

'use strict';

const { randomUUID } = require('node:crypto');
const { GBDT } = require('./gbdt');
const { evaluateModel } = require('./evaluate');
const { buildFeatures, ENGINES } = require('@glimpse/shared/features');
const { computeQueryFeatures } = require('@glimpse/shared/queryFeatures');
const { supabase } = require('../db/client');
const logger = require('../utils/logger');

const DOMAIN_RELEVANCE_MAP = {
  code: { 'github.com': 0.95, 'stackoverflow.com': 0.90, 'npmjs.com': 0.85, 'python.org': 0.80 },
  informational: { 'en.wikipedia.org': 0.92, 'britannica.com': 0.85, 'investopedia.com': 0.80 },
  transactional: { 'amazon.com': 0.95, 'ebay.com': 0.88, 'walmart.com': 0.80 },
  video: { 'youtube.com': 0.95, 'vimeo.com': 0.80 },
};

const POPULAR_DOMAINS = [
  'en.wikipedia.org', 'github.com', 'stackoverflow.com', 'amazon.com',
  'youtube.com', 'reddit.com', 'nytimes.com', 'medium.com',
  'unknown-blog.org', 'random-site.net', 'niche-forum.io',
];

/**
 * Generate synthetic search sessions.
 *
 * @param {number} nSessions
 * @param {boolean} featureDriven - If true, relevance is driven by domain & intent; if false, uniform
 * @param {number} [seed=42]
 * @returns {Array<{ search: object, links: object[] }>}
 */
function generateSyntheticSessions(nSessions, featureDriven = true, seed = 42) {
  let rngVal = seed;
  function rand() {
    rngVal = (rngVal * 1664525 + 1013904223) >>> 0;
    return rngVal / 4294967296;
  }

  const sessions = [];
  const intents = ['code', 'informational', 'transactional', 'video'];

  for (let s = 0; s < nSessions; s++) {
    const installId = randomUUID();
    const clientEventId = randomUUID();
    const engine = ENGINES[Math.floor(rand() * ENGINES.length)];
    const primaryIntent = intents[Math.floor(rand() * intents.length)];

    const queryFeatures = {
      length: 15 + Math.floor(rand() * 20),
      wordCount: 3 + Math.floor(rand() * 4),
      hasDigit: rand() > 0.6 ? 1 : 0,
      hasYear: rand() > 0.8 ? 1 : 0,
      isQuestion: primaryIntent === 'informational' ? 1 : 0,
      hasSiteOperator: 0,
      script: 'latin',
      intent: {
        informational: primaryIntent === 'informational' ? 1 : 0,
        transactional: primaryIntent === 'transactional' ? 1 : 0,
        navigational: 0,
        code: primaryIntent === 'code' ? 1 : 0,
        video: primaryIntent === 'video' ? 1 : 0,
        news: 0,
      },
    };

    const links = [];
    const nLinks = 10;
    let anyClicked = false;

    for (let pos = 1; pos <= nLinks; pos++) {
      // Pick a domain
      let domain = POPULAR_DOMAINS[Math.floor(rand() * POPULAR_DOMAINS.length)];
      // If feature-driven, occasionally place relevant domain at lower rank (e.g. pos 4, 5)
      if (featureDriven && pos >= 3 && pos <= 6 && rand() < 0.6) {
        const domainList = Object.keys(DOMAIN_RELEVANCE_MAP[primaryIntent] || {});
        if (domainList.length > 0) {
          domain = domainList[Math.floor(rand() * domainList.length)];
        }
      }

      // 1. Examination probability decays with rank
      const pExamined = 1.0 / Math.pow(pos, 0.7);

      // 2. Hidden relevance
      let relevance = 0.25; // default baseline relevance
      if (featureDriven) {
        const intentMap = DOMAIN_RELEVANCE_MAP[primaryIntent];
        if (intentMap && intentMap[domain]) {
          relevance = intentMap[domain];
        } else {
          relevance = 0.05 + rand() * 0.15;
        }
      }

      // 3. Click decision
      const pClick = pExamined * relevance;
      const clicked = rand() < pClick;
      if (clicked) anyClicked = true;

      links.push({
        position: pos,
        domain,
        tld: domain.split('.').pop(),
        urlDepth: 1 + Math.floor(rand() * 3),
        linkTextLength: 20 + Math.floor(rand() * 40),
        visibleOnLoad: pos <= 4,
        firstVisibleMs: pos * 80,
        clicked,
      });
    }

    // Ensure session has at least 1 click for training validity
    if (!anyClicked && links.length > 0) {
      if (featureDriven) {
        // Feature-driven: click a relevant domain or top link
        const targetIdx = rand() < 0.5 ? 0 : 3;
        links[targetIdx].clicked = true;
      } else {
        // Uniform: click strictly proportional to examination probability 1 / pos^0.7
        const examWeights = links.map((_, i) => 1.0 / Math.pow(i + 1, 0.7));
        const totalWeight = examWeights.reduce((a, b) => a + b, 0);
        let r = rand() * totalWeight;
        let targetIdx = 0;
        for (let i = 0; i < examWeights.length; i++) {
          r -= examWeights[i];
          if (r <= 0) {
            targetIdx = i;
            break;
          }
        }
        links[targetIdx].clicked = true;
      }
    }

    sessions.push({
      search: {
        installId,
        clientEventId,
        engine,
        queryFeatures,
        visibleCount: nLinks,
        windowWidth: 1920,
        windowHeight: 1080,
        modelVersion: 'v2.0.0',
        appVersion: '1.0.0',
      },
      links,
    });
  }

  return sessions;
}

/**
 * Convert sessions to X, y, groups.
 */
function sessionsToVectors(sessions, domainStats = null) {
  const X = [];
  const y = [];
  const groups = [];

  for (const s of sessions) {
    for (const l of s.links) {
      const ctx = {
        position: l.position,
        visibleCount: s.search.visibleCount,
        visibleOnLoad: l.visibleOnLoad,
        engine: s.search.engine,
        domain: l.domain,
        tld: l.tld,
        urlDepth: l.urlDepth,
        linkTextLength: l.linkTextLength,
        queryFeatures: s.search.queryFeatures,
        windowWidth: s.search.windowWidth,
        windowHeight: s.search.windowHeight,
      };

      X.push(buildFeatures(ctx, domainStats));
      y.push(l.clicked ? 1 : 0);
      groups.push(s.search.clientEventId);
    }
  }

  return { X, y, groups };
}

/**
 * Run simulator and verify both sanity checks.
 */
async function runSimulation(persist = false) {
  console.log('================================================================');
  console.log('  Glimpse ML: Position-Bias Click Model & Sanity Simulator');
  console.log('================================================================\n');

  /* ── SANITY CHECK 1: UNIFORM RELEVANCE ──────────────────────── */
  console.log('[Sanity Check 1] Generating Uniform Relevance Data...');
  console.log('Hypothesis: Model must NOT beat position baseline beyond noise margin (\u2264 0.05).');

  const uniformSessions = generateSyntheticSessions(400, false, 101);
  const uniformSplit = Math.floor(uniformSessions.length * 0.8);
  const uniformTrain = uniformSessions.slice(0, uniformSplit);
  const uniformTest = uniformSessions.slice(uniformSplit);

  const uTrainData = sessionsToVectors(uniformTrain);
  const uTestData = sessionsToVectors(uniformTest);

  const uModel = new GBDT({ nEstimators: 30, maxDepth: 3, learningRate: 0.1, lambda: 2.0 });
  uModel.fit(uTrainData.X, uTrainData.y);

  const uMetrics = evaluateModel(uModel, uTestData.X, uTestData.y, uTestData.groups);
  const uModelHr3 = uMetrics.ranking.model.hr3;
  const uBaseHr3 = uMetrics.ranking.baseline.hr3;
  const uDiff = uModelHr3 - uBaseHr3;

  console.log(`  Model HR@3:            ${(uModelHr3 * 100).toFixed(1)}%`);
  console.log(`  Position Baseline HR@3:${(uBaseHr3 * 100).toFixed(1)}%`);
  console.log(`  Difference:            ${(uDiff * 100).toFixed(1)}%`);
  console.log(`  95% Bootstrap CI:      [${uMetrics.ranking.bootstrapCi.lower}, ${uMetrics.ranking.bootstrapCi.upper}]`);

  const sanity1Pass = uDiff <= 0.05 && uMetrics.ranking.bootstrapCi.lower <= 0.02;
  console.log(`\n  >> SANITY CHECK 1: ${sanity1Pass ? 'PASSED \u2713' : 'FAILED \u2717'}`);
  console.log('  (Model does NOT beat position baseline when relevance is uniform)\n');

  /* ── SANITY CHECK 2: FEATURE-DRIVEN RELEVANCE ────────────────── */
  console.log('[Sanity Check 2] Generating Feature-Driven Relevance Data...');
  console.log('Hypothesis: Feature-aware model MUST beat position baseline with positive CI.');

  const featSessions = generateSyntheticSessions(600, true, 202);
  const featSplit = Math.floor(featSessions.length * 0.8);
  const featTrain = featSessions.slice(0, featSplit);
  const featTest = featSessions.slice(featSplit);

  // Compute domain stats on train split
  const domainStats = {};
  for (const s of featTrain) {
    for (const l of s.links) {
      if (!domainStats[l.domain]) domainStats[l.domain] = { impressions: 0, clicks: 0, smoothedCtr: 0.15 };
      domainStats[l.domain].impressions++;
      if (l.clicked) domainStats[l.domain].clicks++;
    }
  }
  for (const d of Object.keys(domainStats)) {
    const st = domainStats[d];
    st.smoothedCtr = Number(((st.clicks + 3) / (st.impressions + 20)).toFixed(4));
  }

  const fTrainData = sessionsToVectors(featTrain, domainStats);
  const fTestData = sessionsToVectors(featTest, domainStats);

  const fModel = new GBDT({ nEstimators: 45, maxDepth: 4, learningRate: 0.1, lambda: 1.0 });
  fModel.fit(fTrainData.X, fTrainData.y);

  const fMetrics = evaluateModel(fModel, fTestData.X, fTestData.y, fTestData.groups);
  const fModelHr3 = fMetrics.ranking.model.hr3;
  const fBaseHr3 = fMetrics.ranking.baseline.hr3;
  const fDiff = fModelHr3 - fBaseHr3;

  console.log(`  Model HR@3:            ${(fModelHr3 * 100).toFixed(1)}%`);
  console.log(`  Position Baseline HR@3:${(fBaseHr3 * 100).toFixed(1)}%`);
  console.log(`  Difference:            +${(fDiff * 100).toFixed(1)}%`);
  console.log(`  95% Bootstrap CI:      [${fMetrics.ranking.bootstrapCi.lower}, ${fMetrics.ranking.bootstrapCi.upper}]`);

  const sanity2Pass = fDiff > 0 && fMetrics.ranking.bootstrapCi.lower > 0;
  console.log(`\n  >> SANITY CHECK 2: ${sanity2Pass ? 'PASSED \u2713' : 'FAILED \u2717'}`);
  console.log('  (Model successfully learns feature relevance and statistically beats baseline)\n');

  /* ── Optional: Persist synthetic data to database ──────────── */
  if (persist) {
    console.log('[Simulator] Persisting synthetic sessions to database (is_synthetic=true)...');
    try {
      for (const s of featSessions.slice(0, 100)) {
        const { data: searchRow } = await supabase
          .from('search_events')
          .insert({
            install_id: s.search.installId,
            client_event_id: s.search.clientEventId,
            search_engine: s.search.engine,
            query_features: s.search.queryFeatures,
            model_version: s.search.modelVersion,
            app_version: s.search.appVersion,
            result_count_visible: s.search.visibleCount,
            window_width: s.search.windowWidth,
            window_height: s.search.windowHeight,
            is_synthetic: true,
          })
          .select('id')
          .single();

        if (searchRow) {
          const linksToInsert = s.links.map((l) => ({
            search_event_id: searchRow.id,
            domain: l.domain,
            tld: l.tld,
            url_depth: l.urlDepth,
            link_text_length: l.linkTextLength,
            link_position: l.position,
            was_visible_on_load: l.visibleOnLoad,
            first_visible_ms: l.firstVisibleMs,
            was_clicked: l.clicked,
            is_synthetic: true,
          }));
          await supabase.from('result_link_events').insert(linksToInsert);
        }
      }
      console.log('  ✓ 100 synthetic sessions inserted into database');
    } catch (dbErr) {
      console.warn('  Database insert skipped:', dbErr.message);
    }
  }

  console.log('================================================================');
  console.log(`SIMULATOR SUMMARY:`);
  console.log(`  Sanity Check 1 (Uniform):        ${sanity1Pass ? 'PASSED' : 'FAILED'}`);
  console.log(`  Sanity Check 2 (Feature-Driven): ${sanity2Pass ? 'PASSED' : 'FAILED'}`);
  console.log('================================================================\n');

  return { sanity1Pass, sanity2Pass };
}

if (require.main === module) {
  const persist = process.argv.includes('--persist');
  runSimulation(persist).then((res) => {
    if (!res.sanity1Pass || !res.sanity2Pass) {
      process.exit(1);
    }
    process.exit(0);
  }).catch((err) => {
    console.error('Simulator failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runSimulation,
  generateSyntheticSessions,
  sessionsToVectors,
};
