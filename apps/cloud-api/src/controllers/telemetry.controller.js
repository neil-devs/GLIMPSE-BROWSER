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

    /* Verify searchEventId exists before using it as FK.
       If invalid or missing, create a placeholder search event so the FK constraint is satisfied. */
    let validSearchEventId = null;
    if (searchEventId && searchEventId !== '00000000-0000-0000-0000-000000000000') {
      const { data: se } = await supabase
        .from('search_events')
        .select('id')
        .eq('id', searchEventId)
        .single();
      if (se) validSearchEventId = searchEventId;
    }

    if (!validSearchEventId) {
      /* Create a placeholder search event for FK */
      const { data: placeholder, error: phErr } = await supabase
        .from('search_events')
        .insert({
          user_id: userId,
          search_engine: 'google',
          query_text: '_anonymous_link_batch_',
          result_count_visible: links.length,
        })
        .select('id')
        .single();
      if (phErr) throw phErr;
      validSearchEventId = placeholder.id;
    }

    const rows = links.map((link) => ({
      search_event_id: validSearchEventId,
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
      searchEventId: validSearchEventId,
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

/**
 * POST /telemetry/batch — Ingest batch of anonymous search sessions
 * Body: array of up to 50 sessions, each having { search, links }
 */
async function logBatch(req, res, next) {
  try {
    let sessions = Array.isArray(req.body) ? req.body : req.body?.sessions;
    if (!Array.isArray(sessions)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Payload must be an array of sessions or { sessions: [...] }' },
      });
    }

    if (sessions.length > 50) {
      return res.status(400).json({
        success: false,
        error: { code: 'BATCH_TOO_LARGE', message: 'Maximum 50 sessions per batch' },
      });
    }

    let accepted = 0;
    let duplicate = 0;
    let rejected = 0;

    for (const session of sessions) {
      if (!session || !session.search) {
        rejected++;
        continue;
      }

      const s = session.search;
      const installId = s.installId || s.install_id;
      const clientEventId = s.clientEventId || s.client_event_id;
      const engine = s.engine || s.search_engine || 'google';

      if (!installId || !clientEventId) {
        rejected++;
        continue;
      }

      const queryFeatures = s.queryFeatures || s.query_features || null;
      const queryLength = typeof queryFeatures?.length === 'number' ? queryFeatures.length : null;

      // Idempotently insert search event
      const searchRecord = {
        install_id: installId,
        client_event_id: clientEventId,
        search_engine: engine,
        query_text: null, // Privacy: raw query text never stored
        query_length: queryLength,
        query_features: queryFeatures,
        model_version: s.modelVersion || s.model_version || null,
        app_version: s.appVersion || s.app_version || null,
        result_count_visible: s.visibleCount ?? s.visible_count ?? 0,
        window_width: s.windowWidth ?? s.window_width ?? null,
        window_height: s.windowHeight ?? s.window_height ?? null,
        searched_at: s.createdAt || s.created_at || new Date().toISOString(),
        is_synthetic: Boolean(s.isSynthetic || s.is_synthetic || false),
        user_id: null, // Privacy: user_id NEVER stored from telemetry
      };

      const { data: searchRow, error: searchErr } = await supabase
        .from('search_events')
        .insert(searchRecord)
        .select('id')
        .single();

      let searchDbId = searchRow?.id;

      if (searchErr) {
        if (searchErr.code === '23505') { // unique_violation on client_event_id
          duplicate++;
          const { data: existing } = await supabase
            .from('search_events')
            .select('id')
            .eq('client_event_id', clientEventId)
            .single();
          searchDbId = existing?.id;
          continue; // Duplicate search session, skip processing
        } else {
          logger.warn('Failed to insert telemetry search event', { error: searchErr.message });
          rejected++;
          continue;
        }
      }

      accepted++;

      // Process links (<= 30)
      const rawLinks = Array.isArray(session.links) ? session.links.slice(0, 30) : [];
      if (rawLinks.length > 0 && searchDbId) {
        const linkRecords = rawLinks.map((l) => ({
          search_event_id: searchDbId,
          client_event_id: l.clientEventId || l.client_event_id || null,
          domain: (l.domain || '').slice(0, 255),
          tld: (l.tld || '').slice(0, 24) || null,
          url_depth: typeof (l.urlDepth ?? l.url_depth) === 'number' ? (l.urlDepth ?? l.url_depth) : null,
          link_text_length: typeof (l.linkTextLength ?? l.link_text_length) === 'number' ? (l.linkTextLength ?? l.link_text_length) : null,
          link_position: Math.max(1, Number(l.position) || 1),
          was_visible_on_load: Boolean(l.visibleOnLoad ?? l.visible_on_load ?? false),
          first_visible_ms: typeof (l.firstVisibleMs ?? l.first_visible_ms) === 'number' ? (l.firstVisibleMs ?? l.first_visible_ms) : null,
          preload_state: l.preloadState || l.preload_state || null,
          model_score: typeof (l.modelScore ?? l.model_score) === 'number' ? (l.modelScore ?? l.model_score) : null,
          model_rank: typeof (l.modelRank ?? l.model_rank) === 'number' ? (l.modelRank ?? l.model_rank) : null,
          was_clicked: Boolean(l.clicked ?? l.wasClicked ?? false),
          click_class: l.clickClass || l.click_class || null,
          ms_to_usable: typeof (l.msToUsable ?? l.ms_to_usable) === 'number' ? (l.msToUsable ?? l.ms_to_usable) : null,
          is_synthetic: Boolean(l.isSynthetic ?? l.is_synthetic ?? false),
          user_id: null,
          url: null, // Privacy: full URL never stored
        }));

        try {
          await supabase.from('result_link_events').insert(linkRecords);
        } catch (linkErr) {
          logger.warn('Failed to insert link events in batch', { error: linkErr.message });
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        accepted,
        duplicate,
        rejected,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /telemetry/data/:installId or DELETE /telemetry/data
 * Deletes all telemetry rows associated with the anonymous install ID.
 */
async function deleteInstallData(req, res, next) {
  try {
    const installId = req.params.installId || req.body?.installId || req.query?.installId;
    if (!installId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_INSTALL_ID', message: 'installId is required' },
      });
    }

    const { error: searchErr } = await supabase
      .from('search_events')
      .delete()
      .eq('install_id', installId);

    if (searchErr) throw searchErr;

    // Delete field stats for this install
    await supabase
      .from('model_field_stats')
      .delete()
      .eq('install_id', installId);

    logger.info('Deleted telemetry data for install', { installId });

    res.status(200).json({
      success: true,
      data: {
        installId,
        deleted: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/telemetry/summary
 * Protected by ADMIN_API_KEY
 */
async function getTelemetrySummary(req, res, next) {
  try {
    const { data: searches, error: sErr } = await supabase
      .from('search_events')
      .select('id, install_id, search_engine, model_version, query_features, searched_at, is_synthetic');

    if (sErr) throw sErr;

    const totalSearches = (searches || []).length;
    const engineCounts = {};
    const installCounts = {};
    const dateCounts = {};
    let missingModelVersion = 0;
    let missingQueryFeatures = 0;

    for (const s of searches || []) {
      engineCounts[s.search_engine] = (engineCounts[s.search_engine] || 0) + 1;
      if (s.install_id) {
        installCounts[s.install_id] = (installCounts[s.install_id] || 0) + 1;
      }
      const day = s.searched_at ? s.searched_at.slice(0, 10) : 'unknown';
      dateCounts[day] = (dateCounts[day] || 0) + 1;
      if (!s.model_version) missingModelVersion++;
      if (!s.query_features) missingQueryFeatures++;
    }

    const uniqueInstalls = Object.keys(installCounts).length;
    const avgSearchesPerInstall = uniqueInstalls > 0 ? Number((totalSearches / uniqueInstalls).toFixed(2)) : 0;

    const { data: links, error: lErr } = await supabase
      .from('result_link_events')
      .select('search_event_id, was_clicked, click_class');

    if (lErr) throw lErr;

    const totalLinks = (links || []).length;
    let totalClicks = 0;
    const clickClasses = {};

    for (const l of links || []) {
      if (l.was_clicked) totalClicks++;
      if (l.click_class) {
        clickClasses[l.click_class] = (clickClasses[l.click_class] || 0) + 1;
      }
    }

    const clickRate = totalLinks > 0 ? Number((totalClicks / totalLinks).toFixed(4)) : 0;
    const clickClassPct = {};
    for (const [cls, count] of Object.entries(clickClasses)) {
      clickClassPct[cls] = Number((count / (totalClicks || 1)).toFixed(4));
    }

    res.json({
      success: true,
      data: {
        totalSearches,
        totalLinks,
        uniqueInstalls,
        avgSearchesPerInstall,
        engineCounts,
        clickRate,
        clickClasses: clickClassPct,
        missingFieldRates: {
          modelVersion: totalSearches > 0 ? Number((missingModelVersion / totalSearches).toFixed(4)) : 0,
          queryFeatures: totalSearches > 0 ? Number((missingQueryFeatures / totalSearches).toFixed(4)) : 0,
        },
        rowsPerDay: dateCounts,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  logSearchEvent,
  logLinkEvents,
  logPrefetchPerformance,
  logPageLoad,
  logBatch,
  deleteInstallData,
  getTelemetrySummary,
};
