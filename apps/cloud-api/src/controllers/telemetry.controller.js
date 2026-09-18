/**
 * @fileoverview Telemetry controller.
 * Receives search events, result link events, prefetch performance data,
 * and page load timing from the desktop client. Anonymises URLs before storage.
 * @module cloud-api/controllers/telemetry
 */

'use strict';

const { supabase } = require('../db/client');
const { AUDIT_ACTIONS } = require('@glimpse/shared/constants');
const logger = require('../utils/logger');

/* ── URL Anonymisation ──────────────────────────────────────────── */

/**
 * Patterns that look like PII in URL query parameters.
 * We strip these values to protect user privacy.
 */
const PII_PATTERNS = [
  /* Email-like patterns */
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /* JWT-like tokens (3 base64 segments separated by dots) */
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
  /* Long hex strings that look like API keys or tokens (32+ chars) */
  /[a-fA-F0-9]{32,}/g,
  /* UUID patterns */
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
];

/** Query parameter names that are safe to keep */
const SAFE_PARAMS = new Set([
  'q', 'query', 'search', 'p', 'text', 'wd',    /* Search queries */
  'page', 'start', 'first', 'offset',             /* Pagination */
  'lang', 'hl', 'lr', 'gl',                       /* Language / locale */
  'safe', 'safesearch',                            /* Safe search */
  'tbm', 'tbs', 'type', 'sort', 'order',          /* Result type / sort */
  'source', 'utm_source', 'utm_medium',            /* Attribution */
]);

/**
 * Anonymise a URL by stripping PII from query parameters.
 * @param {string} url - Raw URL
 * @returns {string} Anonymised URL
 */
function anonymiseUrl(url) {
  try {
    const parsed = new URL(url);

    /* Strip suspicious query params */
    const keysToDelete = [];
    for (const [key, value] of parsed.searchParams) {
      if (!SAFE_PARAMS.has(key.toLowerCase())) {
        /* Check if the value contains PII patterns */
        let hasPii = false;
        for (const pattern of PII_PATTERNS) {
          pattern.lastIndex = 0; // reset regex state
          if (pattern.test(value)) {
            hasPii = true;
            break;
          }
        }
        if (hasPii) {
          keysToDelete.push(key);
        }
      }
    }

    for (const key of keysToDelete) {
      parsed.searchParams.set(key, '[REDACTED]');
    }

    return parsed.toString();
  } catch {
    /* If URL parsing fails, return domain only */
    return url.split('?')[0] || url;
  }
}

/**
 * Extract domain from URL.
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/* ── Controllers ────────────────────────────────────────────────── */

/**
 * POST /telemetry/search — Log a search event
 */
async function logSearchEvent(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const deviceId = req.device?.id || null;
    const sessionId = req.user?.sessionId || null;

    const {
      engine,
      query,
      resultCountVisible,
      screenResolution,
      windowWidth,
      windowHeight,
    } = req.body;

    const { data: event, error } = await supabase
      .from('search_events')
      .insert({
        user_id: userId,
        device_id: deviceId,
        session_id: sessionId,
        search_engine: engine,
        query_text: query.slice(0, 500), /* enforce max length */
        result_count_visible: resultCountVisible || 0,
        screen_resolution: screenResolution || null,
        window_width: windowWidth || null,
        window_height: windowHeight || null,
      })
      .select('id')
      .single();

    if (error) throw error;

    logger.debug('Search event logged', {
      searchEventId: event.id,
      engine,
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: { searchEventId: event.id },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /telemetry/link-events — Batch log result link events
 */
async function logLinkEvents(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const { searchEventId, links } = req.body;

    const rows = links.map((link) => ({
      search_event_id: searchEventId,
      user_id: userId,
      url: anonymiseUrl(link.url),
      domain: link.domain || extractDomain(link.url),
      link_position: link.position,
      was_visible_on_load: link.wasVisible || false,
      was_prefetched: link.wasPrefetched || false,
      prefetch_started_at: link.prefetchStartedAt || null,
      prefetch_completed_at: link.prefetchCompletedAt || null,
      prefetch_duration_ms: link.prefetchDurationMs || null,
      was_clicked: link.wasClicked || false,
      clicked_at: link.clickedAt || null,
      page_load_time_ms: link.pageLoadTimeMs || null,
      cache_hit: link.cacheHit || false,
    }));

    const { error } = await supabase
      .from('result_link_events')
      .insert(rows);

    if (error) throw error;

    logger.debug('Link events logged', {
      searchEventId,
      count: rows.length,
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: { inserted: rows.length },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /telemetry/prefetch-performance — Log prefetch performance data
 */
async function logPrefetchPerformance(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const deviceId = req.device?.id || null;

    const {
      url,
      domain,
      engine,
      prefetchTriggeredAt,
      prefetchCompletedAt,
      bytesTransferred,
      status,
      failureReason,
      networkType,
      availableBandwidthMbps,
    } = req.body;

    const { error } = await supabase
      .from('prefetch_performance_log')
      .insert({
        user_id: userId,
        device_id: deviceId,
        url: anonymiseUrl(url),
        domain: domain || extractDomain(url),
        engine,
        prefetch_triggered_at: prefetchTriggeredAt,
        prefetch_completed_at: prefetchCompletedAt || null,
        bytes_transferred: bytesTransferred || 0,
        status,
        failure_reason: failureReason || null,
        network_type: networkType || 'unknown',
        available_bandwidth_mbps: availableBandwidthMbps || null,
      });

    if (error) throw error;

    logger.debug('Prefetch performance logged', {
      url: domain || extractDomain(url),
      status,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /telemetry/page-load — Log actual page load time
 * For A/B comparison: prefetched vs non-prefetched load times.
 */
async function logPageLoad(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const { url, loadTimeMs, wasPrefetched, searchEventId } = req.body;

    if (searchEventId) {
      /* Update the existing link event with load time */
      const { error } = await supabase
        .from('result_link_events')
        .update({
          page_load_time_ms: loadTimeMs,
          was_clicked: true,
          clicked_at: new Date().toISOString(),
        })
        .eq('search_event_id', searchEventId)
        .eq('url', anonymiseUrl(url));

      if (error) {
        logger.warn('Could not update link event with load time', {
          error: error.message,
          requestId: req.requestId,
        });
      }
    }

    logger.debug('Page load logged', {
      domain: extractDomain(url),
      loadTimeMs,
      wasPrefetched,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  logSearchEvent,
  logLinkEvents,
  logPrefetchPerformance,
  logPageLoad,
};
