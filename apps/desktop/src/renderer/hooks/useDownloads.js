/**
 * @fileoverview useDownloads hook.
 * Provides download management with real-time progress updates.
 * @module renderer/hooks/useDownloads
 */

import { useState, useEffect, useCallback } from 'react';

export default function useDownloads() {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDownloads = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.glimpse.downloads.getAll();
      if (result.success && result.data) {
        setDownloads(result.data);
      }
    } catch {
      /* Silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDownloads();

    /* Subscribe to download progress events */
    const onProgress = (data) => {
      setDownloads((prev) =>
        prev.map((dl) =>
          dl.id === data.id
            ? { ...dl, ...data, status: 'downloading' }
            : dl
        )
      );
    };

    const onCompleted = (data) => {
      setDownloads((prev) =>
        prev.map((dl) =>
          dl.id === data.id
            ? { ...dl, status: 'completed' }
            : dl
        )
      );
    };

    const onFailed = (data) => {
      setDownloads((prev) =>
        prev.map((dl) =>
          dl.id === data.id
            ? { ...dl, status: 'failed', error: data.reason }
            : dl
        )
      );
    };

    window.glimpse.on('downloads:progress', onProgress);
    window.glimpse.on('downloads:completed', onCompleted);
    window.glimpse.on('downloads:failed', onFailed);

    return () => {
      window.glimpse.off('downloads:progress', onProgress);
      window.glimpse.off('downloads:completed', onCompleted);
      window.glimpse.off('downloads:failed', onFailed);
    };
  }, [fetchDownloads]);

  const startDownload = useCallback(async (url, savePath) => {
    const result = await window.glimpse.downloads.start(url, savePath);
    if (result.success) {
      await fetchDownloads();
    }
    return result;
  }, [fetchDownloads]);

  const pauseDownload = useCallback(async (id) => {
    return window.glimpse.downloads.pause(id);
  }, []);

  const resumeDownload = useCallback(async (id) => {
    return window.glimpse.downloads.resume(id);
  }, []);

  const cancelDownload = useCallback(async (id) => {
    const result = await window.glimpse.downloads.cancel(id);
    if (result.success) {
      await fetchDownloads();
    }
    return result;
  }, [fetchDownloads]);

  const revealDownload = useCallback(async (id) => {
    return window.glimpse.downloads.reveal(id);
  }, []);

  const deleteDownload = useCallback(async (id) => {
    const result = await window.glimpse.downloads.delete(id);
    if (result.success) {
      setDownloads((prev) => prev.filter((dl) => dl.id !== id));
    }
    return result;
  }, []);

  const clearCompleted = useCallback(async () => {
    const result = await window.glimpse.downloads.clearCompleted();
    if (result.success) {
      setDownloads((prev) => prev.filter((dl) => dl.status !== 'completed'));
    }
    return result;
  }, []);

  const activeDownloads = downloads.filter(
    (dl) => dl.status === 'downloading' || dl.status === 'pending'
  );

  return {
    downloads,
    activeDownloads,
    loading,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    revealDownload,
    deleteDownload,
    clearCompleted,
    refresh: fetchDownloads,
  };
}
