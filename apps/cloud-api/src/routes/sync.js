/**
 * @fileoverview Sync routes.
 * @module cloud-api/routes/sync
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { syncLimiter } = require('../middleware/rate-limiter');
const validate = require('../middleware/validate');
const {
  syncBookmarksSchema,
  syncHistorySchema,
  syncSettingsSchema,
  resolveConflictSchema,
} = require('@glimpse/shared/validators');
const syncController = require('../controllers/sync.controller');

const router = Router();

/* All sync routes require authentication and sync rate limiting */
router.use(requireAuth);
router.use(syncLimiter);

/* ── Bookmarks ──────────────────────────────────────────────────── */

router.post(
  '/bookmarks',
  validate(syncBookmarksSchema),
  syncController.uploadBookmarks
);

router.get('/bookmarks', syncController.downloadBookmarks);

/* ── History ────────────────────────────────────────────────────── */

router.post(
  '/history',
  validate(syncHistorySchema),
  syncController.uploadHistory
);

router.get('/history', syncController.downloadHistory);

/* ── Settings ───────────────────────────────────────────────────── */

router.post(
  '/settings',
  validate(syncSettingsSchema),
  syncController.uploadSettings
);

router.get('/settings', syncController.downloadSettings);

/* ── Status & Conflicts ─────────────────────────────────────────── */

router.get('/status', syncController.getSyncStatus);

router.post(
  '/resolve-conflict',
  validate(resolveConflictSchema),
  syncController.resolveConflict
);

module.exports = router;
