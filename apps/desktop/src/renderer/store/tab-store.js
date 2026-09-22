/**
 * @fileoverview Tab state store (Zustand).
 * Syncs with the main process tab state via IPC events.
 * @module renderer/store/tab-store
 */

import { create } from 'zustand';

const useTabStore = create((set, get) => ({
  tabs: [],
  activeTabId: null,

  setTabs: (tabs) => set({ tabs }),
  setActiveTab: (id) => {
    set({ activeTabId: id });
    window.dispatchEvent(new CustomEvent('glimpse:tab-switched', { detail: { tabId: id } }));
  },

  updateTab: (id, fields) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, ...fields } : tab
      ),
    })),

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
    })),

  removeTab: (id) =>
    set((state) => ({
      tabs: state.tabs.filter((tab) => tab.id !== id),
      activeTabId: state.activeTabId === id
        ? (state.tabs.filter((t) => t.id !== id).at(-1)?.id ?? null)
        : state.activeTabId,
    })),

  /** Get the currently active tab object */
  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || null;
  },
}));

/* ── Sync with main process ─────────────────────────────────────── */

if (typeof window !== 'undefined' && window.glimpse) {
  /* Full state sync */
  window.glimpse.on('tabs:stateUpdated', (data) => {
    useTabStore.setState({
      tabs: data.tabs || [],
      activeTabId: data.activeTabId,
    });
  });

  /* Individual field updates */
  window.glimpse.on('tabs:titleUpdated', ({ tabId, title }) => {
    useTabStore.getState().updateTab(tabId, { title });
  });

  window.glimpse.on('tabs:faviconUpdated', ({ tabId, favicon }) => {
    useTabStore.getState().updateTab(tabId, { favicon });
  });

  window.glimpse.on('tabs:loadingChanged', ({ tabId, isLoading }) => {
    useTabStore.getState().updateTab(tabId, { isLoading });
  });

  window.glimpse.on('tabs:urlChanged', ({ tabId, url }) => {
    useTabStore.getState().updateTab(tabId, { url });
  });

  window.glimpse.on('tabs:navigationState', ({ tabId, canGoBack, canGoForward }) => {
    useTabStore.getState().updateTab(tabId, { canGoBack, canGoForward });
  });
}

export default useTabStore;
