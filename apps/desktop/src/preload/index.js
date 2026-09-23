/**
 * @fileoverview Chrome UI preload script.
 * Uses contextBridge to safely expose a window.glimpse API
 * to the React renderer process.
 *
 * This preload runs in the CHROME WebContentsView (the browser UI),
 * NOT in individual tab WebContentsViews.
 *
 * All IPC channel strings are inlined to avoid external module resolution
 * issues in the preload sandbox.
 *
 * @module desktop/preload
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* ── IPC Channel Constants (inlined from @glimpse/shared/ipc-types) ── */

const TABS = {
  CREATE: 'tabs:create', CLOSE: 'tabs:close', NAVIGATE: 'tabs:navigate',
  RELOAD: 'tabs:reload', GO_BACK: 'tabs:goBack', GO_FORWARD: 'tabs:goForward',
  GET_STATE: 'tabs:getState', SET_ACTIVE: 'tabs:setActive',
  DUPLICATE: 'tabs:duplicate', MUTE: 'tabs:mute',
  STATE_UPDATED: 'tabs:stateUpdated', TITLE_UPDATED: 'tabs:titleUpdated',
  FAVICON_UPDATED: 'tabs:faviconUpdated', LOADING_CHANGED: 'tabs:loadingChanged',
  NAVIGATION_STATE: 'tabs:navigationState', URL_CHANGED: 'tabs:urlChanged',
};

const HISTORY = {
  ADD: 'history:add', GET_RECENT: 'history:getRecent', SEARCH: 'history:search',
  DELETE: 'history:delete', CLEAR: 'history:clear', GET_BY_URL: 'history:getByUrl',
};

const BOOKMARKS = {
  GET_ALL: 'bookmarks:getAll', ADD: 'bookmarks:add', UPDATE: 'bookmarks:update',
  DELETE: 'bookmarks:delete', ADD_FOLDER: 'bookmarks:addFolder',
  MOVE: 'bookmarks:moveBookmark', GET_BY_FOLDER: 'bookmarks:getByFolder',
};

const SETTINGS = {
  GET: 'settings:get', SET: 'settings:set', GET_ALL: 'settings:getAll',
  RESET: 'settings:reset', CHANGED: 'settings:changed',
};

const DOWNLOADS = {
  START: 'downloads:start', PAUSE: 'downloads:pause', RESUME: 'downloads:resume',
  CANCEL: 'downloads:cancel', REVEAL: 'downloads:reveal', GET_ALL: 'downloads:getAll',
  DELETE: 'downloads:delete', CLEAR_COMPLETED: 'downloads:clearCompleted',
  PROGRESS: 'downloads:progress', COMPLETED: 'downloads:completed', FAILED: 'downloads:failed',
};

const PREFETCH = {
  GET_STATUS: 'prefetch:getStatus', CLEAR_CACHE: 'prefetch:clearCache',
  GET_LOG: 'prefetch:getLog', SET_AGGRESSIVENESS: 'prefetch:setAggressiveness',
  LINK_DETECTED: 'prefetch:linkDetected', PREFETCH_STARTED: 'prefetch:started',
  PREFETCH_COMPLETED: 'prefetch:completed', PREFETCH_FAILED: 'prefetch:failed',
  STATUS_UPDATED: 'prefetch:statusUpdated',
};

const APP = {
  GET_VERSION: 'app:getVersion', GET_PLATFORM: 'app:getPlatform',
  OPEN_EXTERNAL: 'app:openExternal', MINIMIZE: 'app:minimize',
  MAXIMIZE: 'app:maximize', CLOSE: 'app:close',
  IS_MAXIMIZED: 'app:isMaximized', TOGGLE_FULLSCREEN: 'app:toggleFullscreen',
  SHOW_MENU: 'app:showMenu',
  SHOW_ENGINE_MENU: 'app:showEngineMenu',
  SET_OVERLAY_ACTIVE: 'app:setOverlayActive',
};

const AUTH = {
  LOGIN: 'auth:login', SIGNUP: 'auth:signup', LOGOUT: 'auth:logout',
  GET_SESSION: 'auth:getSession', REFRESH: 'auth:refresh',
  CHANGE_PASSWORD: 'auth:changePassword', DELETE_ACCOUNT: 'auth:deleteAccount',
};

const SYNC = {
  TRIGGER: 'sync:trigger', GET_STATUS: 'sync:getStatus',
};

/* ── API Namespaces ────────────────────────────────────────────────── */

const tabs = {
  create: (url) => ipcRenderer.invoke(TABS.CREATE, url),
  close: (tabId) => ipcRenderer.invoke(TABS.CLOSE, tabId),
  navigate: (tabId, url) => ipcRenderer.invoke(TABS.NAVIGATE, tabId, url),
  reload: (tabId) => ipcRenderer.invoke(TABS.RELOAD, tabId),
  goBack: (tabId) => ipcRenderer.invoke(TABS.GO_BACK, tabId),
  goForward: (tabId) => ipcRenderer.invoke(TABS.GO_FORWARD, tabId),
  getState: () => ipcRenderer.invoke(TABS.GET_STATE),
  setActive: (tabId) => ipcRenderer.invoke(TABS.SET_ACTIVE, tabId),
  duplicate: (tabId) => ipcRenderer.invoke(TABS.DUPLICATE, tabId),
  mute: (tabId, muted) => ipcRenderer.invoke(TABS.MUTE, tabId, muted),
};

const history = {
  add: (url, title, faviconUrl, source) =>
    ipcRenderer.invoke(HISTORY.ADD, url, title, faviconUrl, source),
  getRecent: (limit) => ipcRenderer.invoke(HISTORY.GET_RECENT, limit),
  search: (query) => ipcRenderer.invoke(HISTORY.SEARCH, query),
  delete: (id) => ipcRenderer.invoke(HISTORY.DELETE, id),
  clear: () => ipcRenderer.invoke(HISTORY.CLEAR),
  getByUrl: (url) => ipcRenderer.invoke(HISTORY.GET_BY_URL, url),
};

const bookmarks = {
  getAll: () => ipcRenderer.invoke(BOOKMARKS.GET_ALL),
  add: (url, title, folderId, position) =>
    ipcRenderer.invoke(BOOKMARKS.ADD, url, title, folderId, position),
  update: (id, fields) => ipcRenderer.invoke(BOOKMARKS.UPDATE, id, fields),
  delete: (id) => ipcRenderer.invoke(BOOKMARKS.DELETE, id),
  addFolder: (name, parentId) => ipcRenderer.invoke(BOOKMARKS.ADD_FOLDER, name, parentId),
  move: (id, newFolderId, newPosition) =>
    ipcRenderer.invoke(BOOKMARKS.MOVE, id, newFolderId, newPosition),
  getByFolder: (folderId) => ipcRenderer.invoke(BOOKMARKS.GET_BY_FOLDER, folderId),
};

const settings = {
  get: (key, defaultValue) => ipcRenderer.invoke(SETTINGS.GET, key, defaultValue),
  set: (key, value) => ipcRenderer.invoke(SETTINGS.SET, key, value),
  getAll: () => ipcRenderer.invoke(SETTINGS.GET_ALL),
  reset: () => ipcRenderer.invoke(SETTINGS.RESET),
};

const downloads = {
  start: (url, savePath) => ipcRenderer.invoke(DOWNLOADS.START, url, savePath),
  pause: (id) => ipcRenderer.invoke(DOWNLOADS.PAUSE, id),
  resume: (id) => ipcRenderer.invoke(DOWNLOADS.RESUME, id),
  cancel: (id) => ipcRenderer.invoke(DOWNLOADS.CANCEL, id),
  reveal: (id) => ipcRenderer.invoke(DOWNLOADS.REVEAL, id),
  getAll: () => ipcRenderer.invoke(DOWNLOADS.GET_ALL),
  delete: (id) => ipcRenderer.invoke(DOWNLOADS.DELETE, id),
  clearCompleted: () => ipcRenderer.invoke(DOWNLOADS.CLEAR_COMPLETED),
};

const prefetch = {
  getStatus: () => ipcRenderer.invoke(PREFETCH.GET_STATUS),
  clearCache: () => ipcRenderer.invoke(PREFETCH.CLEAR_CACHE),
  getLog: (limit) => ipcRenderer.invoke(PREFETCH.GET_LOG, limit),
  setAggressiveness: (level) => ipcRenderer.invoke(PREFETCH.SET_AGGRESSIVENESS, level),
};

const auth = {
  login: (email, password) => ipcRenderer.invoke(AUTH.LOGIN, email, password),
  signup: (email, password, displayName) =>
    ipcRenderer.invoke(AUTH.SIGNUP, email, password, displayName),
  logout: () => ipcRenderer.invoke(AUTH.LOGOUT),
  getSession: () => ipcRenderer.invoke(AUTH.GET_SESSION),
  refresh: () => ipcRenderer.invoke(AUTH.REFRESH),
  changePassword: (oldPass, newPass) =>
    ipcRenderer.invoke(AUTH.CHANGE_PASSWORD, oldPass, newPass),
  deleteAccount: () => ipcRenderer.invoke(AUTH.DELETE_ACCOUNT),
};

const sync = {
  trigger: () => ipcRenderer.invoke(SYNC.TRIGGER),
  getStatus: () => ipcRenderer.invoke(SYNC.GET_STATUS),
};

const appApi = {
  getVersion: () => ipcRenderer.invoke(APP.GET_VERSION),
  getPlatform: () => ipcRenderer.invoke(APP.GET_PLATFORM),
  openExternal: (url) => ipcRenderer.invoke(APP.OPEN_EXTERNAL, url),
  minimize: () => ipcRenderer.invoke(APP.MINIMIZE),
  maximize: () => ipcRenderer.invoke(APP.MAXIMIZE),
  close: () => ipcRenderer.invoke(APP.CLOSE),
  isMaximized: () => ipcRenderer.invoke(APP.IS_MAXIMIZED),
  toggleFullscreen: () => ipcRenderer.invoke(APP.TOGGLE_FULLSCREEN),
  showMenu: () => ipcRenderer.invoke(APP.SHOW_MENU),
  showEngineMenu: (currentEngine) => ipcRenderer.invoke(APP.SHOW_ENGINE_MENU, currentEngine),
  setOverlayActive: (active) => ipcRenderer.invoke(APP.SET_OVERLAY_ACTIVE, active),
};

/* ── Event System ───────────────────────────────────────────────── */

/**
 * Maps event names to Sets of callback functions.
 * @type {Map<string, Set<Function>>}
 */
const eventListeners = new Map();

/**
 * Register a listener for a main process event.
 * @param {string} channel - IPC channel name
 * @param {Function} callback - Handler function
 */
function on(channel, callback) {
  if (!eventListeners.has(channel)) {
    eventListeners.set(channel, new Set());

    /* Register the ipcRenderer listener once per channel */
    ipcRenderer.on(channel, (_event, ...args) => {
      const callbacks = eventListeners.get(channel);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            cb(...args);
          } catch {
            /* Don't let one listener crash others */
          }
        }
      }
    });
  }

  eventListeners.get(channel).add(callback);
}

/**
 * Remove a listener for a main process event.
 * @param {string} channel
 * @param {Function} callback
 */
function off(channel, callback) {
  const callbacks = eventListeners.get(channel);
  if (callbacks) {
    callbacks.delete(callback);
  }
}

/* ── Expose API via contextBridge ───────────────────────────────── */

contextBridge.exposeInMainWorld('glimpse', {
  tabs,
  history,
  bookmarks,
  settings,
  downloads,
  prefetch,
  auth,
  sync,
  app: appApi,
  on,
  off,
});
