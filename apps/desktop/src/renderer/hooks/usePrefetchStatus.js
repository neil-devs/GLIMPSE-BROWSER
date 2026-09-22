/**
 * @fileoverview usePrefetchStatus hook.
 * Subscribes to prefetch events and provides cache status.
 * @module renderer/hooks/usePrefetchStatus
 */

import { useCallback, useEffect } from 'react';
import usePrefetchStore from '../store/prefetch-store';

export default function usePrefetchStatus() {
  const prefetchedUrls = usePrefetchStore((s) => s.prefetchedUrls);
  const cacheStatus = usePrefetchStore((s) => s.cacheStatus);
  const recentLog = usePrefetchStore((s) => s.recentLog);
  const isActive = usePrefetchStore((s) => s.isActive);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.glimpse.prefetch.getStatus();
      if (result.success && result.data) {
        usePrefetchStore.getState().setCacheStatus(result.data);
      }
    } catch {
      /* Silently fail */
    }
  }, []);

  const fetchLog = useCallback(async (limit = 20) => {
    try {
      const result = await window.glimpse.prefetch.getLog(limit);
      if (result.success && result.data) {
        usePrefetchStore.getState().setRecentLog(result.data);
      }
    } catch {
      /* Silently fail */
    }
  }, []);

  const clearCache = useCallback(async () => {
    const result = await window.glimpse.prefetch.clearCache();
    if (result.success) {
      usePrefetchStore.getState().clearPrefetched();
    }
    return result;
  }, []);

  const setAggressiveness = useCallback(async (level) => {
    return window.glimpse.prefetch.setAggressiveness(level);
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLog();
  }, [fetchStatus, fetchLog]);

  return {
    prefetchedUrls,
    prefetchedCount: prefetchedUrls.size,
    cacheStatus,
    recentLog,
    isActive,
    clearCache,
    setAggressiveness,
    refreshStatus: fetchStatus,
    refreshLog: fetchLog,
  };
}
