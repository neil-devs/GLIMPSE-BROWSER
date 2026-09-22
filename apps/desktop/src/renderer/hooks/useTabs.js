/**
 * @fileoverview useTabs hook.
 * Provides tab management functions and reactive tab state.
 * @module renderer/hooks/useTabs
 */

import { useCallback } from 'react';
import useTabStore from '../store/tab-store';

export default function useTabs() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const createTab = useCallback(async (url) => {
    return window.glimpse.tabs.create(url);
  }, []);

  const closeTab = useCallback(async (tabId) => {
    return window.glimpse.tabs.close(tabId);
  }, []);

  const navigate = useCallback(async (tabId, url) => {
    return window.glimpse.tabs.navigate(tabId, url);
  }, []);

  const goBack = useCallback(async (tabId) => {
    return window.glimpse.tabs.goBack(tabId || activeTabId);
  }, [activeTabId]);

  const goForward = useCallback(async (tabId) => {
    return window.glimpse.tabs.goForward(tabId || activeTabId);
  }, [activeTabId]);

  const reload = useCallback(async (tabId) => {
    return window.glimpse.tabs.reload(tabId || activeTabId);
  }, [activeTabId]);

  const setActiveTab = useCallback(async (tabId) => {
    return window.glimpse.tabs.setActive(tabId);
  }, []);

  const duplicateTab = useCallback(async (tabId) => {
    return window.glimpse.tabs.duplicate(tabId);
  }, []);

  const muteTab = useCallback(async (tabId, muted) => {
    return window.glimpse.tabs.mute(tabId, muted);
  }, []);

  return {
    tabs,
    activeTab,
    activeTabId,
    createTab,
    closeTab,
    navigate,
    goBack,
    goForward,
    reload,
    setActiveTab,
    duplicateTab,
    muteTab,
  };
}
