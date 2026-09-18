/**
 * @fileoverview IPC channel name constants.
 * Every IPC channel used between Electron main and renderer processes
 * is defined here so neither side uses raw strings.
 * @module @glimpse/shared/ipc-types
 */

'use strict';

/* ── Tab Management ─────────────────────────────────────────────── */
const TABS = Object.freeze({
  CREATE:       'tabs:create',
  CLOSE:        'tabs:close',
  NAVIGATE:     'tabs:navigate',
  RELOAD:       'tabs:reload',
  GO_BACK:      'tabs:goBack',
  GO_FORWARD:   'tabs:goForward',
  GET_STATE:    'tabs:getState',
  SET_ACTIVE:   'tabs:setActive',
  DUPLICATE:    'tabs:duplicate',
  MUTE:         'tabs:mute',
  /* Events pushed from main → renderer */
  STATE_UPDATED:     'tabs:stateUpdated',
  TITLE_UPDATED:     'tabs:titleUpdated',
  FAVICON_UPDATED:   'tabs:faviconUpdated',
  LOADING_CHANGED:   'tabs:loadingChanged',
  NAVIGATION_STATE:  'tabs:navigationState',
  URL_CHANGED:       'tabs:urlChanged',
});

/* ── History ────────────────────────────────────────────────────── */
const HISTORY = Object.freeze({
  ADD:        'history:add',
  GET_RECENT: 'history:getRecent',
  SEARCH:     'history:search',
  DELETE:     'history:delete',
  CLEAR:      'history:clear',
  GET_BY_URL: 'history:getByUrl',
});

/* ── Bookmarks ──────────────────────────────────────────────────── */
const BOOKMARKS = Object.freeze({
  GET_ALL:      'bookmarks:getAll',
  ADD:          'bookmarks:add',
  UPDATE:       'bookmarks:update',
  DELETE:       'bookmarks:delete',
  ADD_FOLDER:   'bookmarks:addFolder',
  MOVE:         'bookmarks:moveBookmark',
  GET_BY_FOLDER:'bookmarks:getByFolder',
});

/* ── Settings ───────────────────────────────────────────────────── */
const SETTINGS = Object.freeze({
  GET:      'settings:get',
  SET:      'settings:set',
  GET_ALL:  'settings:getAll',
  RESET:    'settings:reset',
  CHANGED:  'settings:changed',
});

/* ── Downloads ──────────────────────────────────────────────────── */
const DOWNLOADS = Object.freeze({
  START:            'downloads:start',
  PAUSE:            'downloads:pause',
  RESUME:           'downloads:resume',
  CANCEL:           'downloads:cancel',
  REVEAL:           'downloads:reveal',
  GET_ALL:          'downloads:getAll',
  DELETE:           'downloads:delete',
  CLEAR_COMPLETED:  'downloads:clearCompleted',
  /* Events pushed from main → renderer */
  PROGRESS:         'downloads:progress',
  COMPLETED:        'downloads:completed',
  FAILED:           'downloads:failed',
});

/* ── Prefetch ───────────────────────────────────────────────────── */
const PREFETCH = Object.freeze({
  GET_STATUS:          'prefetch:getStatus',
  CLEAR_CACHE:         'prefetch:clearCache',
  GET_LOG:             'prefetch:getLog',
  SET_AGGRESSIVENESS:  'prefetch:setAggressiveness',
  /* Events pushed from main → renderer */
  LINK_DETECTED:       'prefetch:linkDetected',
  PREFETCH_STARTED:    'prefetch:started',
  PREFETCH_COMPLETED:  'prefetch:completed',
  PREFETCH_FAILED:     'prefetch:failed',
  STATUS_UPDATED:      'prefetch:statusUpdated',
});

/* ── App / Window ───────────────────────────────────────────────── */
const APP = Object.freeze({
  GET_VERSION:      'app:getVersion',
  GET_PLATFORM:     'app:getPlatform',
  OPEN_EXTERNAL:    'app:openExternal',
  MINIMIZE:         'app:minimize',
  MAXIMIZE:         'app:maximize',
  CLOSE:            'app:close',
  IS_MAXIMIZED:     'app:isMaximized',
  TOGGLE_FULLSCREEN:'app:toggleFullscreen',
});

/* ── Sync ───────────────────────────────────────────────────────── */
const SYNC = Object.freeze({
  TRIGGER:          'sync:trigger',
  GET_STATUS:       'sync:getStatus',
  RESOLVE_CONFLICT: 'sync:resolveConflict',
  /* Events pushed from main → renderer */
  STARTED:          'sync:started',
  COMPLETED:        'sync:completed',
  FAILED:           'sync:failed',
  CONFLICT:         'sync:conflict',
});

/* ── Auth (desktop ↔ cloud) ─────────────────────────────────────── */
const AUTH = Object.freeze({
  LOGIN:           'auth:login',
  SIGNUP:          'auth:signup',
  LOGOUT:          'auth:logout',
  REFRESH:         'auth:refresh',
  GET_SESSION:     'auth:getSession',
  CHANGE_PASSWORD: 'auth:changePassword',
  DELETE_ACCOUNT:  'auth:deleteAccount',
});

/* ── ML Model ───────────────────────────────────────────────────── */
const ML = Object.freeze({
  GET_STATUS:       'ml:getStatus',
  CHECK_UPDATE:     'ml:checkUpdate',
  DOWNLOAD_MODEL:   'ml:downloadModel',
  PREDICT:          'ml:predict',
  REPORT_ACCURACY:  'ml:reportAccuracy',
});

/**
 * Flat map of all channel names for iteration / validation.
 * Useful for asserting that a channel name is valid before registering.
 */
const ALL_CHANNELS = Object.freeze([
  ...Object.values(TABS),
  ...Object.values(HISTORY),
  ...Object.values(BOOKMARKS),
  ...Object.values(SETTINGS),
  ...Object.values(DOWNLOADS),
  ...Object.values(PREFETCH),
  ...Object.values(APP),
  ...Object.values(SYNC),
  ...Object.values(AUTH),
  ...Object.values(ML),
]);

module.exports = {
  TABS,
  HISTORY,
  BOOKMARKS,
  SETTINGS,
  DOWNLOADS,
  PREFETCH,
  APP,
  SYNC,
  AUTH,
  ML,
  ALL_CHANNELS,
};
