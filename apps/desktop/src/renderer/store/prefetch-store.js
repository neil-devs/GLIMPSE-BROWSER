/**
 * @fileoverview Prefetch status store (Zustand).
 * Tracks which URLs have been prefetched and cache status.
 * @module renderer/store/prefetch-store
 */

import { create } from 'zustand';

const usePrefetchStore = create((set, get) => ({
  prefetchedUrls: new Set(),
  cacheStatus: {
    count: 0,
    totalSizeMb: '0.00',
    hitRate: '0.00',
  },
  recentLog: [],
  isActive: false,

  setPrefetched: (url) =>
    set((state) => {
      const updated = new Set(state.prefetchedUrls);
      updated.add(url);
      return { prefetchedUrls: updated, isActive: true };
    }),

  setCacheStatus: (status) => set({ cacheStatus: status }),

  setRecentLog: (log) => set({ recentLog: log }),

  clearPrefetched: () =>
    set({
      prefetchedUrls: new Set(),
      cacheStatus: { count: 0, totalSizeMb: '0.00', hitRate: '0.00' },
      isActive: false,
    }),

  setActive: (active) => set({ isActive: active }),

  /** Check if a specific URL has been prefetched */
  isPrefetched: (url) => get().prefetchedUrls.has(url),
}));

/* ── Sync with main process ─────────────────────────────────────── */

if (typeof window !== 'undefined' && window.glimpse) {
  window.glimpse.on('prefetch:completed', (data) => {
    if (data && data.url) {
      usePrefetchStore.getState().setPrefetched(data.url);
    }
  });

  window.glimpse.on('prefetch:statusUpdated', (data) => {
    if (data) {
      usePrefetchStore.getState().setCacheStatus(data);
    }
  });
}

export default usePrefetchStore;
