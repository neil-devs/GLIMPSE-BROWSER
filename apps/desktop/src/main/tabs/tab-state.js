/**
 * @fileoverview Reactive tab state store for the main process.
 * Maintains all tab state and broadcasts changes to the chrome renderer.
 * @module desktop/tabs/tab-state
 */

'use strict';

const { TABS } = require('@glimpse/shared/ipc-types');
const { logger } = require('../utils/logger');

/**
 * @typedef {object} TabState
 * @property {string} id - Unique tab identifier
 * @property {string} url - Current URL
 * @property {string} title - Page title
 * @property {string|null} favicon - Favicon URL
 * @property {boolean} isLoading - Whether the page is currently loading
 * @property {boolean} canGoBack - Whether back navigation is available
 * @property {boolean} canGoForward - Whether forward navigation is available
 * @property {boolean} isAudioPlaying - Whether audio/video is playing
 * @property {boolean} isMuted - Whether audio is muted
 * @property {boolean} isPinned - Whether the tab is pinned
 * @property {boolean} isSecure - Whether the connection is HTTPS
 * @property {number} createdAt - Timestamp when tab was created
 */

/** @type {Map<string, TabState>} */
const tabs = new Map();

/** @type {string|null} */
let activeTabId = null;

/** Reference to the chrome WebContentsView for broadcasting */
let chromeWebContents = null;

/**
 * Set the chrome WebContents reference for IPC broadcasts.
 * @param {Electron.WebContents} wc
 */
function setChromeWebContents(wc) {
  chromeWebContents = wc;
}

/**
 * Add a new tab to the state store.
 * @param {TabState} tab
 */
function add(tab) {
  tabs.set(tab.id, { ...tab });
  broadcastStateUpdate();
}

/**
 * Remove a tab from the state store.
 * @param {string} id
 */
function remove(id) {
  tabs.delete(id);

  /* If the active tab was removed, activate the last remaining tab */
  if (activeTabId === id) {
    const remaining = [...tabs.keys()];
    activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
  }

  broadcastStateUpdate();
}

/**
 * Update fields on an existing tab.
 * @param {string} id
 * @param {Partial<TabState>} fields - Fields to merge
 */
function update(id, fields) {
  const tab = tabs.get(id);
  if (!tab) return;

  Object.assign(tab, fields);

  /* Broadcast specific events for individual field changes */
  if ('title' in fields) {
    broadcast(TABS.TITLE_UPDATED, { tabId: id, title: fields.title });
  }
  if ('favicon' in fields) {
    broadcast(TABS.FAVICON_UPDATED, { tabId: id, favicon: fields.favicon });
  }
  if ('isLoading' in fields) {
    broadcast(TABS.LOADING_CHANGED, { tabId: id, isLoading: fields.isLoading });
  }
  if ('url' in fields) {
    broadcast(TABS.URL_CHANGED, { tabId: id, url: fields.url });
  }
  if ('canGoBack' in fields || 'canGoForward' in fields) {
    broadcast(TABS.NAVIGATION_STATE, {
      tabId: id,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
    });
  }

  broadcastStateUpdate();
}

/**
 * Set the active tab.
 * @param {string} id
 */
function setActive(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;
  broadcastStateUpdate();
}

/**
 * Get the active tab state.
 * @returns {TabState|null}
 */
function getActive() {
  if (!activeTabId) return null;
  return tabs.get(activeTabId) || null;
}

/**
 * Get the active tab ID.
 * @returns {string|null}
 */
function getActiveId() {
  return activeTabId;
}

/**
 * Get all tab states as a serializable array.
 * @returns {{ tabs: TabState[], activeTabId: string|null }}
 */
function getAll() {
  return {
    tabs: [...tabs.values()],
    activeTabId,
  };
}

/**
 * Get a specific tab by ID.
 * @param {string} id
 * @returns {TabState|null}
 */
function get(id) {
  return tabs.get(id) || null;
}

/**
 * Get the count of open tabs.
 * @returns {number}
 */
function count() {
  return tabs.size;
}

/* ── Broadcasting ───────────────────────────────────────────────── */

/**
 * Broadcast the full tab state to the chrome renderer.
 */
function broadcastStateUpdate() {
  broadcast(TABS.STATE_UPDATED, getAll());
}

/**
 * Send an IPC event to the chrome renderer.
 * @param {string} channel
 * @param {*} data
 */
function broadcast(channel, data) {
  try {
    if (chromeWebContents && !chromeWebContents.isDestroyed()) {
      chromeWebContents.send(channel, data);
    }
  } catch (err) {
    logger.debug('Tab state broadcast failed', { channel, message: err.message });
  }
}

module.exports = {
  setChromeWebContents,
  add,
  remove,
  update,
  setActive,
  getActive,
  getActiveId,
  getAll,
  get,
  count,
};
