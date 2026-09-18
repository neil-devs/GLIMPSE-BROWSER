/**
 * @fileoverview Shared constants for Glimpse Browser.
 * Used by both apps/desktop and apps/cloud-api to ensure consistency.
 * @module @glimpse/shared/constants
 */

'use strict';

/** Supported search engines */
const SEARCH_ENGINES = Object.freeze([
  'google',
  'bing',
  'duckduckgo',
  'yahoo',
  'baidu',
  'yandex',
]);

/** Human-readable display names for each engine */
const ENGINE_DISPLAY_NAMES = Object.freeze({
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  yahoo: 'Yahoo',
  baidu: 'Baidu',
  yandex: 'Yandex',
});

/** Search engine homepage URLs */
const ENGINE_URLS = Object.freeze({
  google: 'https://www.google.com',
  bing: 'https://www.bing.com',
  duckduckgo: 'https://duckduckgo.com',
  yahoo: 'https://search.yahoo.com',
  baidu: 'https://www.baidu.com',
  yandex: 'https://yandex.com',
});

/** Search query URL templates — replace %s with encoded query */
const ENGINE_SEARCH_URLS = Object.freeze({
  google: 'https://www.google.com/search?q=%s',
  bing: 'https://www.bing.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
  yahoo: 'https://search.yahoo.com/search?p=%s',
  baidu: 'https://www.baidu.com/s?wd=%s',
  yandex: 'https://yandex.com/search/?text=%s',
});

/** Maximum number of URLs to prefetch concurrently */
const MAX_PREFETCH_URLS = 6;

/** Prefetch aggressiveness levels */
const PREFETCH_AGGRESSIVENESS_LEVELS = Object.freeze([
  'conservative',
  'balanced',
  'aggressive',
]);

/** Prefetch config per aggressiveness level */
const PREFETCH_CONFIG = Object.freeze({
  conservative: {
    maxConcurrent: 2,
    minVisibilityDuration: 1500,
    bandwidthThresholdMbps: 5,
    maxCacheSizeMb: 200,
  },
  balanced: {
    maxConcurrent: 4,
    minVisibilityDuration: 800,
    bandwidthThresholdMbps: 2,
    maxCacheSizeMb: 500,
  },
  aggressive: {
    maxConcurrent: 6,
    minVisibilityDuration: 300,
    bandwidthThresholdMbps: 0.5,
    maxCacheSizeMb: 1000,
  },
});

/** Cloud API version prefix */
const API_VERSION = 'v1';

/** Application version — mirrors root package.json */
const APP_VERSION = '1.0.0';

/** JWT token expiry durations */
const TOKEN_EXPIRY = Object.freeze({
  access: '15m',
  refresh: '7d',
  accessSeconds: 900,
  refreshSeconds: 604800,
});

/** Telemetry batch size — number of events sent in a single request */
const TELEMETRY_BATCH_SIZE = 50;

/** Sync batch size — max items per sync operation */
const SYNC_BATCH_SIZE = 500;

/** Default browser settings applied on first launch */
const DEFAULT_SETTINGS = Object.freeze({
  defaultEngine: 'google',
  prefetchEnabled: true,
  prefetchAggressiveness: 'balanced',
  prefetchOnMeteredNetwork: false,
  theme: 'system',
  language: 'en',
  historyRetentionDays: 90,
  cacheSizeLimitMb: 500,
  blockAds: false,
  blockTrackers: false,
  hardwareAcceleration: true,
  javascriptEnabled: true,
  zoomLevel: 1.0,
});

/** Account status enum values */
const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

/** Download status enum values */
const DOWNLOAD_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/** Prefetch status enum values */
const PREFETCH_STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/** Network type enum values */
const NETWORK_TYPE = Object.freeze({
  WIFI: 'wifi',
  ETHERNET: 'ethernet',
  CELLULAR: 'cellular',
  UNKNOWN: 'unknown',
});

/** Browsing history source types */
const HISTORY_SOURCE = Object.freeze({
  SEARCH_RESULT: 'search_result',
  DIRECT: 'direct',
  BOOKMARK: 'bookmark',
  PREFETCH_CLICK: 'prefetch_click',
});

/** Sync entity types */
const SYNC_ENTITY_TYPES = Object.freeze([
  'bookmarks',
  'history',
  'settings',
]);

/** Sync operation types */
const SYNC_OPERATIONS = Object.freeze([
  'create',
  'update',
  'delete',
]);

/** Activity audit log action types */
const AUDIT_ACTIONS = Object.freeze({
  USER_SIGNUP: 'USER_SIGNUP',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_PASSWORD_CHANGE: 'USER_PASSWORD_CHANGE',
  USER_ACCOUNT_DELETED: 'USER_ACCOUNT_DELETED',
  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  DEVICE_TRUSTED: 'DEVICE_TRUSTED',
  DEVICE_REMOVED: 'DEVICE_REMOVED',
  BOOKMARK_CREATED: 'BOOKMARK_CREATED',
  BOOKMARK_UPDATED: 'BOOKMARK_UPDATED',
  BOOKMARK_DELETED: 'BOOKMARK_DELETED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  SYNC_TRIGGERED: 'SYNC_TRIGGERED',
  SYNC_COMPLETED: 'SYNC_COMPLETED',
  SYNC_FAILED: 'SYNC_FAILED',
  MODEL_DOWNLOADED: 'MODEL_DOWNLOADED',
  TELEMETRY_SUBMITTED: 'TELEMETRY_SUBMITTED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  RATE_LIMIT_HIT: 'RATE_LIMIT_HIT',
  SUSPICIOUS_ACTIVITY_FLAGGED: 'SUSPICIOUS_ACTIVITY_FLAGGED',
});

/** Rate limiting defaults */
const RATE_LIMITS = Object.freeze({
  global: { windowMs: 15 * 60 * 1000, max: 200 },
  auth: { windowMs: 15 * 60 * 1000, max: 10 },
  telemetry: { windowMs: 60 * 1000, max: 500 },
  sync: { windowMs: 60 * 1000, max: 60 },
});

/** Bcrypt salt rounds */
const BCRYPT_SALT_ROUNDS = 12;

/** Max consecutive failed login attempts before extended lockout */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Extended lockout duration in milliseconds (1 hour) */
const EXTENDED_LOCKOUT_MS = 60 * 60 * 1000;

/** Domain reputation scores for ML feature engineering */
const DOMAIN_REPUTATION = Object.freeze({
  'wikipedia.org': 1.0,
  'en.wikipedia.org': 1.0,
  'youtube.com': 0.9,
  'www.youtube.com': 0.9,
  'github.com': 0.92,
  'stackoverflow.com': 0.88,
  'reddit.com': 0.85,
  'www.reddit.com': 0.85,
  'medium.com': 0.78,
  'twitter.com': 0.75,
  'x.com': 0.75,
  'linkedin.com': 0.8,
  'amazon.com': 0.82,
  'www.amazon.com': 0.82,
  'nytimes.com': 0.85,
  'bbc.com': 0.87,
  'cnn.com': 0.83,
  'reuters.com': 0.88,
  'microsoft.com': 0.85,
  'apple.com': 0.85,
  'developer.mozilla.org': 0.95,
  'docs.python.org': 0.92,
  'npmjs.com': 0.88,
  'w3schools.com': 0.7,
  'quora.com': 0.72,
  _default: 0.5,
});

module.exports = {
  SEARCH_ENGINES,
  ENGINE_DISPLAY_NAMES,
  ENGINE_URLS,
  ENGINE_SEARCH_URLS,
  MAX_PREFETCH_URLS,
  PREFETCH_AGGRESSIVENESS_LEVELS,
  PREFETCH_CONFIG,
  API_VERSION,
  APP_VERSION,
  TOKEN_EXPIRY,
  TELEMETRY_BATCH_SIZE,
  SYNC_BATCH_SIZE,
  DEFAULT_SETTINGS,
  ACCOUNT_STATUS,
  DOWNLOAD_STATUS,
  PREFETCH_STATUS,
  NETWORK_TYPE,
  HISTORY_SOURCE,
  SYNC_ENTITY_TYPES,
  SYNC_OPERATIONS,
  AUDIT_ACTIONS,
  RATE_LIMITS,
  BCRYPT_SALT_ROUNDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  EXTENDED_LOCKOUT_MS,
  DOMAIN_REPUTATION,
};
