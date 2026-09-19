/**
 * @fileoverview Zod validation schemas shared between cloud-api and desktop.
 * Centralises all input validation so both sides enforce the same rules.
 * @module @glimpse/shared/validators
 */

'use strict';

const { z } = require('zod');
const {
  SEARCH_ENGINES,
  PREFETCH_AGGRESSIVENESS_LEVELS,
  DOWNLOAD_STATUS,
  HISTORY_SOURCE,
  SYNC_ENTITY_TYPES,
  SYNC_OPERATIONS,
  SYNC_BATCH_SIZE,
} = require('./constants');

/* ── Primitives ─────────────────────────────────────────────────── */

/** URL must be http or https */
const urlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048, 'URL must be at most 2048 characters')
  .refine(
    (val) => {
      try {
        const url = new URL(val);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL must be a valid http or https URL' }
  );

/** Email — standard format, case-insensitive */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(320, 'Email must be at most 320 characters')
  .email('Invalid email address');

/**
 * Password — min 8 chars, at least 1 uppercase, 1 number, 1 special character.
 * Max 128 chars to prevent bcrypt denial-of-service.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/,
    'Password must contain at least one special character'
  );

/** Display name — alphanumeric + spaces, reasonable length */
const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(100, 'Display name must be at most 100 characters');

/** Search query — sanitised, reasonable length */
const searchQuerySchema = z
  .string()
  .trim()
  .min(1, 'Search query is required')
  .max(500, 'Search query must be at most 500 characters');

/** Search engine enum */
const searchEngineSchema = z.enum(SEARCH_ENGINES);

/** Prefetch aggressiveness enum */
const aggressivenessSchema = z.enum(PREFETCH_AGGRESSIVENESS_LEVELS);

/** UUID v4 */
const uuidSchema = z.string().uuid('Invalid UUID');

/** Positive integer */
const positiveIntSchema = z.number().int().positive();

/** Non-negative integer */
const nonNegativeIntSchema = z.number().int().nonnegative();

/** ISO date string */
const isoDateSchema = z.string().datetime({ message: 'Invalid ISO 8601 date' });

/* ── Auth Schemas ───────────────────────────────────────────────── */

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password confirmation is required'),
});

/* ── Device Schema ──────────────────────────────────────────────── */

const deviceSchema = z.object({
  deviceName: z.string().max(255).default('Unknown Device'),
  deviceOs: z.string().max(100).default('unknown'),
  deviceArch: z.string().max(50).default('unknown'),
  screenResolution: z.string().max(20).optional(),
  appVersion: z.string().max(20).optional(),
});

/* ── Bookmark Schema ────────────────────────────────────────────── */

const bookmarkSchema = z.object({
  url: urlSchema,
  title: z.string().trim().min(1).max(500),
  faviconUrl: z.string().max(2048).optional().nullable(),
  folderId: z.union([z.string(), z.number()]).optional().nullable(),
  position: nonNegativeIntSchema.optional(),
});

const bookmarkUpdateSchema = z.object({
  id: z.union([uuidSchema, z.number().int().positive()]),
  url: urlSchema.optional(),
  title: z.string().trim().min(1).max(500).optional(),
  faviconUrl: z.string().max(2048).optional().nullable(),
  folderId: z.union([z.string(), z.number()]).optional().nullable(),
  position: nonNegativeIntSchema.optional(),
});

const bookmarkFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentFolderId: z.union([z.string(), z.number()]).optional().nullable(),
  position: nonNegativeIntSchema.optional(),
});

/* ── Settings Schema ────────────────────────────────────────────── */

const settingsSchema = z.object({
  defaultEngine: searchEngineSchema.optional(),
  prefetchEnabled: z.boolean().optional(),
  prefetchAggressiveness: aggressivenessSchema.optional(),
  prefetchOnMeteredNetwork: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().min(2).max(10).optional(),
  historyRetentionDays: z.number().int().min(1).max(3650).optional(),
  cacheSizeLimitMb: z.number().int().min(50).max(10000).optional(),
  blockAds: z.boolean().optional(),
  blockTrackers: z.boolean().optional(),
  hardwareAcceleration: z.boolean().optional(),
  javascriptEnabled: z.boolean().optional(),
  zoomLevel: z.number().min(0.25).max(5.0).optional(),
});

/* ── Telemetry Schemas ──────────────────────────────────────────── */

const searchEventSchema = z.object({
  engine: searchEngineSchema,
  query: searchQuerySchema,
  resultCountVisible: nonNegativeIntSchema,
  screenResolution: z.string().max(20).optional(),
  windowWidth: positiveIntSchema.optional(),
  windowHeight: positiveIntSchema.optional(),
});

const linkEventSchema = z.object({
  url: urlSchema,
  domain: z.string().max(255),
  position: positiveIntSchema,
  wasVisible: z.boolean(),
  wasPrefetched: z.boolean(),
  prefetchStartedAt: z.string().optional().nullable(),
  prefetchCompletedAt: z.string().optional().nullable(),
  prefetchDurationMs: nonNegativeIntSchema.optional().nullable(),
  wasClicked: z.boolean(),
  clickedAt: z.string().optional().nullable(),
  pageLoadTimeMs: nonNegativeIntSchema.optional().nullable(),
  cacheHit: z.boolean().optional(),
});

const linkEventsBatchSchema = z.object({
  searchEventId: uuidSchema,
  links: z.array(linkEventSchema).min(1).max(100),
});

const prefetchPerformanceSchema = z.object({
  url: urlSchema,
  domain: z.string().max(255),
  engine: searchEngineSchema,
  prefetchTriggeredAt: z.string(),
  prefetchCompletedAt: z.string().optional().nullable(),
  bytesTransferred: nonNegativeIntSchema.optional(),
  status: z.enum(['success', 'failed', 'cancelled']),
  failureReason: z.string().max(500).optional().nullable(),
  networkType: z.enum(['wifi', 'ethernet', 'cellular', 'unknown']).optional(),
  availableBandwidthMbps: z.number().nonnegative().optional(),
});

const pageLoadSchema = z.object({
  url: urlSchema,
  loadTimeMs: positiveIntSchema,
  wasPrefetched: z.boolean(),
  searchEventId: uuidSchema.optional(),
});

/* ── Sync Schemas ───────────────────────────────────────────────── */

const syncBookmarksSchema = z.object({
  bookmarks: z.array(
    z.object({
      id: z.union([uuidSchema, z.string()]).optional(),
      url: urlSchema,
      title: z.string().trim().min(1).max(500),
      faviconUrl: z.string().max(2048).optional().nullable(),
      folderId: z.union([z.string(), z.number()]).optional().nullable(),
      position: nonNegativeIntSchema.optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    })
  ).min(1).max(SYNC_BATCH_SIZE),
});

const syncHistorySchema = z.object({
  entries: z.array(
    z.object({
      url: urlSchema,
      title: z.string().max(500).optional(),
      faviconUrl: z.string().max(2048).optional().nullable(),
      visitCount: positiveIntSchema.optional(),
      lastVisitedAt: z.string(),
      source: z.enum(['search_result', 'direct', 'bookmark', 'prefetch_click']).optional(),
    })
  ).min(1).max(SYNC_BATCH_SIZE),
});

const syncSettingsSchema = settingsSchema;

const resolveConflictSchema = z.object({
  conflictId: uuidSchema,
  resolution: z.enum(['client', 'server']),
});

/* ── ML Schemas ─────────────────────────────────────────────────── */

const modelAccuracyReportSchema = z.object({
  modelVersionId: uuidSchema,
  searchEventId: uuidSchema,
  predictedUrls: z.array(
    z.object({
      url: urlSchema,
      score: z.number().min(0).max(1),
      rank: positiveIntSchema,
    })
  ).min(1),
  actualClickedUrl: urlSchema.optional().nullable(),
  predictionCorrect: z.boolean(),
  inferenceTimeMs: nonNegativeIntSchema,
});

/* ── History Schema ─────────────────────────────────────────────── */

const historyEntrySchema = z.object({
  url: urlSchema,
  title: z.string().max(500).optional(),
  faviconUrl: z.string().max(2048).optional().nullable(),
  source: z.enum(['search_result', 'direct', 'bookmark', 'prefetch_click']).optional(),
});

/* ── Pagination ─────────────────────────────────────────────────── */

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

module.exports = {
  /* Primitives */
  urlSchema,
  emailSchema,
  passwordSchema,
  displayNameSchema,
  searchQuerySchema,
  searchEngineSchema,
  aggressivenessSchema,
  uuidSchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  isoDateSchema,
  /* Auth */
  signupSchema,
  loginSchema,
  changePasswordSchema,
  refreshTokenSchema,
  deleteAccountSchema,
  /* Device */
  deviceSchema,
  /* Bookmark */
  bookmarkSchema,
  bookmarkUpdateSchema,
  bookmarkFolderSchema,
  /* Settings */
  settingsSchema,
  /* Telemetry */
  searchEventSchema,
  linkEventSchema,
  linkEventsBatchSchema,
  prefetchPerformanceSchema,
  pageLoadSchema,
  /* Sync */
  syncBookmarksSchema,
  syncHistorySchema,
  syncSettingsSchema,
  resolveConflictSchema,
  /* ML */
  modelAccuracyReportSchema,
  /* History */
  historyEntrySchema,
  /* Pagination */
  paginationSchema,
};
