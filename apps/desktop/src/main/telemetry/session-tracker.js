/**
 * @fileoverview Per-search results page session tracker.
 * Tracks search context and all impressions/clicks for a single results page.
 *
 * Flushes on:
 * - User clicks a link
 * - User navigates away / enters a new query
 * - Tab is closed
 * - 60 seconds idle timeout (records no-click searches with clicked=false)
 *
 * PRIVACY RULE: NEVER stores or forwards raw query text or complete destination URLs.
 * Uses computeQueryFeatures() for coarse statistical counts and intent flags.
 *
 * @module desktop/telemetry/session-tracker
 */

'use strict';

const { randomUUID } = require('node:crypto');
const { computeQueryFeatures } = require('@glimpse/shared/queryFeatures');
const telemetryClient = require('./telemetry-client');
const { logger } = require('../utils/logger');

const PREFIX = '[glimpse:session-tracker]';
const IDLE_TIMEOUT_MS = 60_000; // 60s idle flush

/**
 * Map of tabId -> ActiveSearchSession
 * @type {Map<string, object>}
 */
const activeSessions = new Map();

/**
 * Extract TLD and URL depth from a URL string safely.
 * @param {string} urlStr
 * @returns {{ domain: string, tld: string, depth: number }}
 */
function parseUrlDetails(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const domain = parsed.hostname;
    const parts = domain.split('.');
    const tld = parts.length > 1 ? parts[parts.length - 1] : '';
    const depth = parsed.pathname.split('/').filter(Boolean).length;
    return { domain, tld, depth };
  } catch {
    return { domain: 'unknown', tld: '', depth: 0 };
  }
}

/**
 * Start a new search session on a search results page.
 *
 * @param {string} tabId
 * @param {object} params
 * @param {string} params.engine - Search engine name (e.g. 'google')
 * @param {string} [params.queryText=''] - Raw search query (ephemeral, immediately coarse-hashed)
 * @param {number} [params.windowWidth=1280]
 * @param {number} [params.windowHeight=800]
 * @param {string} [params.modelVersion='v2.0.0']
 * @param {string} [params.appVersion='1.0.0']
 */
function startSession(tabId, {
  engine,
  queryText = '',
  windowWidth = 1280,
  windowHeight = 800,
  modelVersion = 'v2.0.0',
  appVersion = '1.0.0',
}) {
  /* Flush any existing session on this tab first */
  flushSession(tabId);

  const clientEventId = randomUUID();
  const queryFeatures = computeQueryFeatures(queryText);

  const session = {
    tabId,
    search: {
      clientEventId,
      engine: engine || 'google',
      queryFeatures,
      modelVersion,
      appVersion,
      windowWidth,
      windowHeight,
      visibleCount: 0,
      createdAt: new Date().toISOString(),
    },
    links: new Map(), // href -> link record
    idleTimer: null,
  };

  /* 60-second idle flush timer for searches with zero clicks */
  session.idleTimer = setTimeout(() => {
    logger.debug(`${PREFIX} 60s idle timeout reached, flushing no-click session`, { tabId });
    flushSession(tabId);
  }, IDLE_TIMEOUT_MS);

  if (session.idleTimer.unref) {
    session.idleTimer.unref();
  }

  activeSessions.set(tabId, session);
  logger.info(`${PREFIX} Started session for tab ${tabId}`, { clientEventId, engine });
}

/**
 * Record a result link becoming visible in the viewport.
 *
 * @param {string} tabId
 * @param {object} link
 * @param {string} link.url - Destination URL
 * @param {number} link.position - Rank on page
 * @param {string} [link.domain]
 * @param {string} [link.tld]
 * @param {number} [link.urlDepth]
 * @param {number} [link.linkTextLength=0]
 * @param {boolean} [link.visibleOnLoad=false]
 * @param {number} [link.firstVisibleMs=0]
 * @param {string} [link.preloadState='none']
 * @param {number} [link.modelScore]
 * @param {number} [link.modelRank]
 */
function recordLinkSeen(tabId, link) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  const url = link.url;
  if (!url) return;

  const { domain, tld, depth } = parseUrlDetails(url);

  if (!session.links.has(url)) {
    session.links.set(url, {
      clientEventId: randomUUID(),
      position: link.position,
      domain: link.domain || domain,
      tld: link.tld || tld,
      urlDepth: typeof link.urlDepth === 'number' ? link.urlDepth : depth,
      linkTextLength: link.linkTextLength || 0,
      visibleOnLoad: Boolean(link.visibleOnLoad),
      firstVisibleMs: link.firstVisibleMs || 0,
      preloadState: link.preloadState || 'none',
      modelScore: typeof link.modelScore === 'number' ? link.modelScore : null,
      modelRank: typeof link.modelRank === 'number' ? link.modelRank : null,
      clicked: false,
      clickClass: null,
      msToUsable: null,
    });

    session.search.visibleCount = Math.max(session.search.visibleCount, session.links.size);
  }
}

/**
 * Update the preloading state or ML score of a link.
 *
 * @param {string} tabId
 * @param {string} url
 * @param {object} update
 */
function updateLinkPreload(tabId, url, update = {}) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  const link = session.links.get(url);
  if (link) {
    if (update.preloadState) link.preloadState = update.preloadState;
    if (typeof update.modelScore === 'number') link.modelScore = update.modelScore;
    if (typeof update.modelRank === 'number') link.modelRank = update.modelRank;
  }
}

/**
 * Record a link click. Flushes the session immediately.
 *
 * @param {string} tabId
 * @param {string} url
 * @param {object} [metrics={}]
 * @param {string} [metrics.clickClass='MISS_NOT_POOLED']
 * @param {number} [metrics.msToUsable=null]
 */
function recordLinkClick(tabId, url, metrics = {}) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  let matchedLink = session.links.get(url);

  /* Fallback match by domain if exact URL isn't keyed */
  if (!matchedLink && url) {
    const { domain } = parseUrlDetails(url);
    for (const link of session.links.values()) {
      if (link.domain === domain) {
        matchedLink = link;
        break;
      }
    }
  }

  if (matchedLink) {
    matchedLink.clicked = true;
    matchedLink.clickClass = metrics.clickClass || (matchedLink.preloadState === 'ready' ? 'HIT_READY' : 'HIT_LOADING');
    matchedLink.msToUsable = typeof metrics.msToUsable === 'number' ? metrics.msToUsable : null;
  }

  logger.info(`${PREFIX} Recorded click, flushing session immediately`, { tabId, url: url?.substring(0, 50) });
  flushSession(tabId);
}

/**
 * Flush and finalise an active search session, queueing it for telemetry.
 *
 * @param {string} tabId
 */
function flushSession(tabId) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  /* Clear the idle timer */
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }

  activeSessions.delete(tabId);

  /* Sort links by position (up to 30) */
  const linkList = [...session.links.values()]
    .sort((a, b) => a.position - b.position)
    .slice(0, 30);

  /* Send to telemetry client */
  telemetryClient.recordSession({
    search: session.search,
    links: linkList,
  });

  logger.info(`${PREFIX} Session finalised`, {
    tabId,
    linksRecorded: linkList.length,
    anyClicked: linkList.some(l => l.clicked),
  });
}

/**
 * Called when a tab navigates away or is closed.
 * @param {string} tabId
 */
function onTabNavigated(tabId) {
  flushSession(tabId);
}

/**
 * Called when a tab is destroyed.
 * @param {string} tabId
 */
function onTabClosed(tabId) {
  flushSession(tabId);
}

module.exports = {
  startSession,
  recordLinkSeen,
  updateLinkPreload,
  recordLinkClick,
  flushSession,
  onTabNavigated,
  onTabClosed,
};
