/**
 * @fileoverview Typed IPC API wrapper for the preload bridge.
 * Groups all ipcRenderer.invoke() calls by namespace.
 * @module desktop/preload/preload-api
 */

'use strict';

const { ipcRenderer } = require('electron');
const {
  TABS, HISTORY, BOOKMARKS, SETTINGS,
  DOWNLOADS, PREFETCH, APP, AUTH, SYNC,
} = require('@glimpse/shared/ipc-types');

/* ── Tabs ───────────────────────────────────────────────────────── */

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

/* ── History ────────────────────────────────────────────────────── */

const history = {
  add: (url, title, faviconUrl, source) =>
    ipcRenderer.invoke(HISTORY.ADD, url, title, faviconUrl, source),
  getRecent: (limit) => ipcRenderer.invoke(HISTORY.GET_RECENT, limit),
  search: (query) => ipcRenderer.invoke(HISTORY.SEARCH, query),
  delete: (id) => ipcRenderer.invoke(HISTORY.DELETE, id),
  clear: () => ipcRenderer.invoke(HISTORY.CLEAR),
  getByUrl: (url) => ipcRenderer.invoke(HISTORY.GET_BY_URL, url),
};

/* ── Bookmarks ──────────────────────────────────────────────────── */

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

/* ── Settings ───────────────────────────────────────────────────── */

const settings = {
  get: (key, defaultValue) => ipcRenderer.invoke(SETTINGS.GET, key, defaultValue),
  set: (key, value) => ipcRenderer.invoke(SETTINGS.SET, key, value),
  getAll: () => ipcRenderer.invoke(SETTINGS.GET_ALL),
  reset: () => ipcRenderer.invoke(SETTINGS.RESET),
};

/* ── Downloads ──────────────────────────────────────────────────── */

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

/* ── Prefetch ───────────────────────────────────────────────────── */

const prefetch = {
  getStatus: () => ipcRenderer.invoke(PREFETCH.GET_STATUS),
  clearCache: () => ipcRenderer.invoke(PREFETCH.CLEAR_CACHE),
  getLog: (limit) => ipcRenderer.invoke(PREFETCH.GET_LOG, limit),
  setAggressiveness: (level) => ipcRenderer.invoke(PREFETCH.SET_AGGRESSIVENESS, level),
};

/* ── Auth ────────────────────────────────────────────────────────── */

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

/* ── Sync ────────────────────────────────────────────────────────── */

const sync = {
  trigger: () => ipcRenderer.invoke(SYNC.TRIGGER),
  getStatus: () => ipcRenderer.invoke(SYNC.GET_STATUS),
};

/* ── App / Window ───────────────────────────────────────────────── */

const appApi = {
  getVersion: () => ipcRenderer.invoke(APP.GET_VERSION),
  getPlatform: () => ipcRenderer.invoke(APP.GET_PLATFORM),
  openExternal: (url) => ipcRenderer.invoke(APP.OPEN_EXTERNAL, url),
  minimize: () => ipcRenderer.invoke(APP.MINIMIZE),
  maximize: () => ipcRenderer.invoke(APP.MAXIMIZE),
  close: () => ipcRenderer.invoke(APP.CLOSE),
  isMaximized: () => ipcRenderer.invoke(APP.IS_MAXIMIZED),
  toggleFullscreen: () => ipcRenderer.invoke(APP.TOGGLE_FULLSCREEN),
};

module.exports = {
  tabs,
  history,
  bookmarks,
  settings,
  downloads,
  prefetch,
  auth,
  sync,
  app: appApi,
};
