/**
 * @fileoverview useBookmarks hook.
 * Provides bookmark management functions with local state caching.
 * @module renderer/hooks/useBookmarks
 */

import { useState, useEffect, useCallback } from 'react';

export default function useBookmarks() {
  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookmarks = useCallback(async () => {
    try {
      const result = await window.glimpse.bookmarks.getAll();
      if (result.success && result.data) {
        const items = result.data;
        setBookmarks(items.filter((b) => !b.is_folder));
        setFolders(items.filter((b) => b.is_folder));
      }
    } catch {
      /* Silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const addBookmark = useCallback(async (url, title, folderId, position) => {
    const result = await window.glimpse.bookmarks.add(url, title, folderId, position);
    if (result.success) {
      await fetchBookmarks();
    }
    return result;
  }, [fetchBookmarks]);

  const removeBookmark = useCallback(async (id) => {
    const result = await window.glimpse.bookmarks.delete(id);
    if (result.success) {
      await fetchBookmarks();
    }
    return result;
  }, [fetchBookmarks]);

  const updateBookmark = useCallback(async (id, fields) => {
    const result = await window.glimpse.bookmarks.update(id, fields);
    if (result.success) {
      await fetchBookmarks();
    }
    return result;
  }, [fetchBookmarks]);

  const addFolder = useCallback(async (name, parentId) => {
    const result = await window.glimpse.bookmarks.addFolder(name, parentId);
    if (result.success) {
      await fetchBookmarks();
    }
    return result;
  }, [fetchBookmarks]);

  const isBookmarked = useCallback((url) => {
    return bookmarks.some((b) => b.url === url);
  }, [bookmarks]);

  const getBookmarkByUrl = useCallback((url) => {
    return bookmarks.find((b) => b.url === url) || null;
  }, [bookmarks]);

  return {
    bookmarks,
    folders,
    loading,
    addBookmark,
    removeBookmark,
    updateBookmark,
    addFolder,
    isBookmarked,
    getBookmarkByUrl,
    refresh: fetchBookmarks,
  };
}
