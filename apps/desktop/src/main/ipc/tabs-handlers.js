/**
 * @fileoverview Tab management IPC handlers.
 * Bridges the renderer process to the tab manager in the main process.
 * @module desktop/ipc/tabs-handlers
 */

'use strict';

const { ipcMain } = require('electron');
const { TABS } = require('@glimpse/shared/ipc-types');

/**
 * Register all tab-related IPC handlers.
 * @param {object} [tabManager] - Tab manager instance (injected for testability)
 */
function registerTabsHandlers(tabManager) {
  /**
   * Lazy-load the tab manager if not injected.
   * This avoids circular dependency issues during startup.
   */
  function getTabManager() {
    if (tabManager) return tabManager;
    try {
      return require('../tabs/tab-manager');
    } catch {
      return null;
    }
  }

  ipcMain.handle(TABS.CREATE, async (_event, url) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      const tabId = tm.createTab(url || 'about:blank');
      return { success: true, tabId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.CLOSE, async (_event, tabId) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      tm.closeTab(tabId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.NAVIGATE, async (_event, tabId, url) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      tm.navigate(tabId, url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.RELOAD, async (_event, tabId) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      tm.reload(tabId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.GO_BACK, async (_event, tabId) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      tm.goBack(tabId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.GO_FORWARD, async (_event, tabId) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      tm.goForward(tabId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.GET_STATE, async () => {
    const tm = getTabManager();
    if (!tm) return { tabs: [], activeTabId: null };
    try {
      return tm.getAllTabState();
    } catch (err) {
      return { tabs: [], activeTabId: null, error: err.message };
    }
  });

  ipcMain.handle(TABS.SET_ACTIVE, async (_event, tabId) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      tm.setActiveTab(tabId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.DUPLICATE, async (_event, tabId) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      const newTabId = tm.duplicateTab ? tm.duplicateTab(tabId) : null;
      return { success: true, tabId: newTabId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(TABS.MUTE, async (_event, tabId, muted) => {
    const tm = getTabManager();
    if (!tm) return { error: 'Tab manager not available' };
    try {
      if (tm.muteTab) {
        tm.muteTab(tabId, muted);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerTabsHandlers };
