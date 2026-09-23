/**
 * @fileoverview UI state store (Zustand).
 * Manages sidebar, theme, and other UI-level state.
 * @module renderer/store/ui-store
 */

import { create } from 'zustand';

const useUiStore = create((set, get) => ({
  sidebarOpen: false,
  sidebarPanel: 'bookmarks', /* 'bookmarks' | 'history' | 'settings' | 'downloads' */
  theme: 'dark', /* 'dark' | 'light' | 'system' */
  notifications: [],

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSidebarPanel: (panel) =>
    set({ sidebarOpen: true, sidebarPanel: panel }),

  setSidebarTab: (tab) =>
    set({ sidebarPanel: tab }),

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  closeSidebar: () => set({ sidebarOpen: false }),

  setTheme: (theme) => {
    set({ theme });
    /* Apply to DOM */
    const effectiveTheme =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  },

  /* Notification management */
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          id: Date.now() + Math.random(),
          timestamp: Date.now(),
          ...notification,
        },
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));

/* ── System theme listener ──────────────────────────────────────── */

if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    const { theme } = useUiStore.getState();
    if (theme === 'system') {
      document.documentElement.setAttribute(
        'data-theme',
        e.matches ? 'dark' : 'light'
      );
    }
  });
}

export default useUiStore;
