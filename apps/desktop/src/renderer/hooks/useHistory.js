/**
 * @fileoverview useHistory hook.
 * Provides browsing history access with search and pagination.
 * @module renderer/hooks/useHistory
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export default function useHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef(null);

  const fetchRecent = useCallback(async (limit = 200) => {
    try {
      setLoading(true);
      const result = await window.glimpse.history.getRecent(limit);
      if (result.success && result.data) {
        setHistory(result.data);
      }
    } catch {
      /* Silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  const searchHistory = useCallback(async (query) => {
    if (!query || query.trim().length === 0) {
      return fetchRecent();
    }
    try {
      setLoading(true);
      const result = await window.glimpse.history.search(query);
      if (result.success && result.data) {
        setHistory(result.data);
      }
    } catch {
      /* Silently fail */
    } finally {
      setLoading(false);
    }
  }, [fetchRecent]);

  /* Debounced search */
  const debouncedSearch = useCallback((query) => {
    setSearchQuery(query);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchHistory(query);
    }, 300);
  }, [searchHistory]);

  useEffect(() => {
    fetchRecent();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchRecent]);

  const clearHistory = useCallback(async () => {
    const result = await window.glimpse.history.clear();
    if (result.success) {
      setHistory([]);
    }
    return result;
  }, []);

  const deleteEntry = useCallback(async (id) => {
    const result = await window.glimpse.history.delete(id);
    if (result.success) {
      setHistory((prev) => prev.filter((h) => h.id !== id));
    }
    return result;
  }, []);

  /** Group history entries by date */
  const groupedHistory = useCallback(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = { today: [], yesterday: [], thisWeek: [], older: [] };

    for (const entry of history) {
      const date = new Date(entry.visited_at || entry.last_visited_at);
      if (date >= today) {
        groups.today.push(entry);
      } else if (date >= yesterday) {
        groups.yesterday.push(entry);
      } else if (date >= weekAgo) {
        groups.thisWeek.push(entry);
      } else {
        groups.older.push(entry);
      }
    }

    return groups;
  }, [history]);

  return {
    history,
    loading,
    searchQuery,
    searchHistory: debouncedSearch,
    clearHistory,
    deleteEntry,
    groupedHistory,
    refresh: fetchRecent,
  };
}
