/**
 * @fileoverview Sync controller.
 * Handles cross-device synchronization of bookmarks, history, and settings.
 * Uses last-write-wins conflict resolution with optional manual resolution.
 * @module cloud-api/controllers/sync
 */

'use strict';

const { supabase } = require('../db/client');
const { Errors } = require('@glimpse/shared/errors');
const { AUDIT_ACTIONS } = require('@glimpse/shared/constants');
const logger = require('../utils/logger');

/* ── Helpers ────────────────────────────────────────────────────── */

function auditLog(userId, actionType, entityType, req, metadata = {}) {
  supabase
    .from('activity_audit_log')
    .insert({
      user_id: userId,
      action_type: actionType,
      entity_type: entityType,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null,
      device_id: req.device?.id || null,
      metadata,
    })
    .then()
    .catch((err) => {
      logger.error('Failed to write sync audit log', { error: err.message });
    });
}

async function logSyncQueue(userId, deviceId, entityType, operation, payload) {
  try {
    await supabase.from('sync_queue').insert({
      user_id: userId,
      device_id: deviceId || null,
      entity_type: entityType,
      operation,
      payload,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Failed to log sync queue entry', { error: err.message });
  }
}

/* ── Bookmarks Sync ─────────────────────────────────────────────── */

/**
 * POST /sync/bookmarks — Upload local bookmarks (upsert)
 */
async function uploadBookmarks(req, res, next) {
  try {
    const userId = req.user.id;
    const deviceId = req.device?.id;
    const { bookmarks } = req.body;

    auditLog(userId, AUDIT_ACTIONS.SYNC_TRIGGERED, 'bookmarks', req, {
      count: bookmarks.length,
    });

    const results = { created: 0, updated: 0, conflicts: 0 };

    for (const bm of bookmarks) {
      /* Check if bookmark exists on server (by URL for this user) */
      const { data: existing } = await supabase
        .from('bookmarks')
        .select('id, updated_at')
        .eq('user_id', userId)
        .eq('url', bm.url)
        .single();

      if (existing) {
        /* Last-write-wins: compare timestamps */
        const clientUpdated = bm.updatedAt ? new Date(bm.updatedAt) : new Date(0);
        const serverUpdated = new Date(existing.updated_at);

        if (clientUpdated >= serverUpdated) {
          await supabase
            .from('bookmarks')
            .update({
              title: bm.title,
              favicon_url: bm.faviconUrl || null,
              folder_id: bm.folderId || null,
              position: bm.position || 0,
              is_synced: true,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          results.updated++;
        } else {
          results.conflicts++;
          /* Log conflict for potential manual resolution */
          await supabase.from('sync_queue').insert({
            user_id: userId,
            device_id: deviceId || null,
            entity_type: 'bookmarks',
            operation: 'update',
            payload: {
              clientData: bm,
              serverId: existing.id,
              serverUpdatedAt: existing.updated_at,
            },
            conflict_detected: true,
          });
        }
      } else {
        /* Insert new bookmark */
        await supabase
          .from('bookmarks')
          .insert({
            user_id: userId,
            title: bm.title,
            url: bm.url,
            favicon_url: bm.faviconUrl || null,
            folder_id: bm.folderId || null,
            position: bm.position || 0,
            is_synced: true,
            last_synced_at: new Date().toISOString(),
          });
        results.created++;
      }
    }

    await logSyncQueue(userId, deviceId, 'bookmarks', 'update', {
      ...results,
      totalProcessed: bookmarks.length,
    });

    auditLog(userId, AUDIT_ACTIONS.SYNC_COMPLETED, 'bookmarks', req, results);

    logger.info('Bookmarks synced', { userId, ...results, requestId: req.requestId });

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /sync/bookmarks — Download all bookmarks for user
 */
async function downloadBookmarks(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: bookmarks, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (error) throw error;

    const { data: folders, error: folderError } = await supabase
      .from('bookmark_folders')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (folderError) throw folderError;

    res.json({
      success: true,
      data: {
        bookmarks: (bookmarks || []).map((b) => ({
          id: b.id,
          title: b.title,
          url: b.url,
          faviconUrl: b.favicon_url,
          folderId: b.folder_id,
          position: b.position,
          isSynced: b.is_synced,
          lastSyncedAt: b.last_synced_at,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
        })),
        folders: (folders || []).map((f) => ({
          id: f.id,
          name: f.name,
          parentFolderId: f.parent_folder_id,
          position: f.position,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ── History Sync ───────────────────────────────────────────────── */

/**
 * POST /sync/history — Upload local history batch
 */
async function uploadHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const deviceId = req.device?.id;
    const { entries } = req.body;

    auditLog(userId, AUDIT_ACTIONS.SYNC_TRIGGERED, 'history', req, {
      count: entries.length,
    });

    const results = { created: 0, updated: 0 };

    for (const entry of entries) {
      /* Check if URL already exists in history */
      const { data: existing } = await supabase
        .from('browsing_history')
        .select('id, visit_count')
        .eq('user_id', userId)
        .eq('url', entry.url)
        .single();

      if (existing) {
        await supabase
          .from('browsing_history')
          .update({
            title: entry.title || null,
            favicon_url: entry.faviconUrl || null,
            visit_count: existing.visit_count + (entry.visitCount || 1),
            last_visited_at: entry.lastVisitedAt || new Date().toISOString(),
            source: entry.source || 'direct',
          })
          .eq('id', existing.id);
        results.updated++;
      } else {
        await supabase
          .from('browsing_history')
          .insert({
            user_id: userId,
            device_id: deviceId || null,
            url: entry.url,
            title: entry.title || null,
            favicon_url: entry.faviconUrl || null,
            visit_count: entry.visitCount || 1,
            last_visited_at: entry.lastVisitedAt || new Date().toISOString(),
            source: entry.source || 'direct',
          });
        results.created++;
      }
    }

    await logSyncQueue(userId, deviceId, 'history', 'update', {
      ...results,
      totalProcessed: entries.length,
    });

    auditLog(userId, AUDIT_ACTIONS.SYNC_COMPLETED, 'history', req, results);

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /sync/history — Download history since a given date
 */
async function downloadHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const since = req.query.since || new Date(0).toISOString();

    const { data: entries, error } = await supabase
      .from('browsing_history')
      .select('*')
      .eq('user_id', userId)
      .gte('last_visited_at', since)
      .order('last_visited_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    res.json({
      success: true,
      data: {
        entries: (entries || []).map((e) => ({
          id: e.id,
          url: e.url,
          title: e.title,
          faviconUrl: e.favicon_url,
          visitCount: e.visit_count,
          lastVisitedAt: e.last_visited_at,
          source: e.source,
          createdAt: e.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ── Settings Sync ──────────────────────────────────────────────── */

/**
 * POST /sync/settings — Upload settings object
 */
async function uploadSettings(req, res, next) {
  try {
    const userId = req.user.id;
    const settings = req.body;

    auditLog(userId, AUDIT_ACTIONS.SYNC_TRIGGERED, 'settings', req);

    /* Map camelCase to snake_case */
    const dbSettings = {};
    if (settings.defaultEngine !== undefined)
      dbSettings.default_search_engine = settings.defaultEngine;
    if (settings.prefetchEnabled !== undefined)
      dbSettings.prefetch_enabled = settings.prefetchEnabled;
    if (settings.prefetchAggressiveness !== undefined)
      dbSettings.prefetch_aggressiveness = settings.prefetchAggressiveness;
    if (settings.prefetchOnMeteredNetwork !== undefined)
      dbSettings.prefetch_on_metered_network = settings.prefetchOnMeteredNetwork;
    if (settings.cacheSizeLimitMb !== undefined)
      dbSettings.cache_size_limit_mb = settings.cacheSizeLimitMb;
    if (settings.historyRetentionDays !== undefined)
      dbSettings.history_retention_days = settings.historyRetentionDays;
    if (settings.theme !== undefined)
      dbSettings.theme = settings.theme;
    if (settings.language !== undefined)
      dbSettings.language = settings.language;
    if (settings.zoomLevel !== undefined)
      dbSettings.zoom_level = settings.zoomLevel;
    if (settings.blockAds !== undefined)
      dbSettings.block_ads = settings.blockAds;
    if (settings.blockTrackers !== undefined)
      dbSettings.block_trackers = settings.blockTrackers;
    if (settings.hardwareAcceleration !== undefined)
      dbSettings.hardware_acceleration = settings.hardwareAcceleration;
    if (settings.javascriptEnabled !== undefined)
      dbSettings.javascript_enabled = settings.javascriptEnabled;

    /* Upsert settings */
    const { data: existing } = await supabase
      .from('browser_settings')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      await supabase
        .from('browser_settings')
        .update(dbSettings)
        .eq('user_id', userId);
    } else {
      await supabase
        .from('browser_settings')
        .insert({ user_id: userId, ...dbSettings });
    }

    await logSyncQueue(userId, req.device?.id, 'settings', 'update', dbSettings);
    auditLog(userId, AUDIT_ACTIONS.SYNC_COMPLETED, 'settings', req);
    auditLog(userId, AUDIT_ACTIONS.SETTINGS_UPDATED, 'settings', req, {
      changed: Object.keys(dbSettings),
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /sync/settings — Download settings
 */
async function downloadSettings(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: settings, error } = await supabase
      .from('browser_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!settings) {
      /* Return defaults if no settings exist */
      const { DEFAULT_SETTINGS } = require('@glimpse/shared/constants');
      return res.json({ success: true, data: { settings: DEFAULT_SETTINGS } });
    }

    res.json({
      success: true,
      data: {
        settings: {
          defaultEngine: settings.default_search_engine,
          prefetchEnabled: settings.prefetch_enabled,
          prefetchAggressiveness: settings.prefetch_aggressiveness,
          prefetchOnMeteredNetwork: settings.prefetch_on_metered_network,
          cacheSizeLimitMb: settings.cache_size_limit_mb,
          historyRetentionDays: settings.history_retention_days,
          theme: settings.theme,
          language: settings.language,
          zoomLevel: settings.zoom_level,
          blockAds: settings.block_ads,
          blockTrackers: settings.block_trackers,
          hardwareAcceleration: settings.hardware_acceleration,
          javascriptEnabled: settings.javascript_enabled,
          updatedAt: settings.updated_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ── Sync Status ────────────────────────────────────────────────── */

/**
 * GET /sync/status — Return last sync timestamps per entity type
 */
async function getSyncStatus(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: entries, error } = await supabase
      .from('sync_queue')
      .select('entity_type, synced_at')
      .eq('user_id', userId)
      .not('synced_at', 'is', null)
      .order('synced_at', { ascending: false });

    if (error) throw error;

    /* Group by entity_type, take the latest synced_at */
    const statusMap = {};
    for (const entry of (entries || [])) {
      if (!statusMap[entry.entity_type]) {
        statusMap[entry.entity_type] = entry.synced_at;
      }
    }

    /* Check for pending conflicts */
    const { data: conflicts } = await supabase
      .from('sync_queue')
      .select('id, entity_type, payload, created_at')
      .eq('user_id', userId)
      .eq('conflict_detected', true)
      .is('conflict_resolved_at', null);

    res.json({
      success: true,
      data: {
        lastSynced: {
          bookmarks: statusMap.bookmarks || null,
          history: statusMap.history || null,
          settings: statusMap.settings || null,
        },
        pendingConflicts: (conflicts || []).map((c) => ({
          id: c.id,
          entityType: c.entity_type,
          payload: c.payload,
          createdAt: c.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ── Conflict Resolution ────────────────────────────────────────── */

/**
 * POST /sync/resolve-conflict — Accept client or server version
 */
async function resolveConflict(req, res, next) {
  try {
    const userId = req.user.id;
    const { conflictId, resolution } = req.body;

    /* Find the conflict entry */
    const { data: conflict, error } = await supabase
      .from('sync_queue')
      .select('*')
      .eq('id', conflictId)
      .eq('user_id', userId)
      .eq('conflict_detected', true)
      .is('conflict_resolved_at', null)
      .single();

    if (error || !conflict) {
      throw Errors.NOT_FOUND('Conflict not found');
    }

    if (resolution === 'client') {
      /* Apply client's version */
      const clientData = conflict.payload?.clientData;
      if (clientData && conflict.payload?.serverId) {
        await supabase
          .from(conflict.entity_type)
          .update({
            title: clientData.title,
            url: clientData.url,
            favicon_url: clientData.faviconUrl || null,
            is_synced: true,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', conflict.payload.serverId);
      }
    }
    /* If resolution === 'server', we keep the server's version (no action needed) */

    /* Mark conflict as resolved */
    await supabase
      .from('sync_queue')
      .update({
        conflict_resolved_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      })
      .eq('id', conflictId);

    logger.info('Sync conflict resolved', {
      userId,
      conflictId,
      resolution,
      requestId: req.requestId,
    });

    res.json({ success: true, resolution });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadBookmarks,
  downloadBookmarks,
  uploadHistory,
  downloadHistory,
  uploadSettings,
  downloadSettings,
  getSyncStatus,
  resolveConflict,
};
