import React, { useState, useEffect, useCallback } from 'react';
import SpeedDial from './SpeedDial';
import RecentHistory from './RecentHistory';
import useTabs from '../../hooks/useTabs';
import useSettings from '../../hooks/useSettings';
import './NewTabPage.css';

const ENGINE_SEARCH_URLS = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  yahoo: 'https://search.yahoo.com/search?p=',
  baidu: 'https://www.baidu.com/s?wd=',
  yandex: 'https://yandex.com/search/?text=',
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function NewTabPage() {
  const { navigate, activeTabId } = useTabs();
  const { getSetting } = useSettings();
  const [searchInput, setSearchInput] = useState('');
  const [recentHistory, setRecentHistory] = useState([]);
  const [topSites, setTopSites] = useState([]);

  const defaultEngine = getSetting('defaultEngine', 'google');

  useEffect(() => {
    const loadData = async () => {
      try {
        const histResult = await window.glimpse.history.getRecent(20);
        if (histResult.success && histResult.data) {
          setRecentHistory(histResult.data.slice(0, 5));

          /* Build top sites from history frequency */
          const siteMap = new Map();
          for (const entry of histResult.data) {
            try {
              const domain = new URL(entry.url).hostname;
              if (!siteMap.has(domain)) {
                siteMap.set(domain, { url: entry.url, title: entry.title, favicon: entry.favicon_url, count: 0 });
              }
              siteMap.get(domain).count++;
            } catch { /* skip */ }
          }
          const sorted = [...siteMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
          setTopSites(sorted);
        }
      } catch { /* silently fail */ }
    };
    loadData();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed || !activeTabId) return;

    const searchBase = ENGINE_SEARCH_URLS[defaultEngine] || ENGINE_SEARCH_URLS.google;
    navigate(activeTabId, searchBase + encodeURIComponent(trimmed));
  };

  const handleNavigate = useCallback((url) => {
    if (activeTabId) navigate(activeTabId, url);
  }, [activeTabId, navigate]);

  return (
    <div className="new-tab-page">
      <div className="new-tab-page__content">
        <div className="new-tab-page__logo">
          <span className="new-tab-page__logo-icon">⚡</span>
          <h1 className="new-tab-page__title">Glimpse</h1>
        </div>

        <p className="new-tab-page__greeting">{getGreeting()}</p>

        <form className="new-tab-page__search" onSubmit={handleSearch}>
          <input
            type="text"
            className="new-tab-page__search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search with ${defaultEngine.charAt(0).toUpperCase() + defaultEngine.slice(1)}...`}
            autoFocus
            spellCheck={false}
          />
        </form>

        {topSites.length > 0 && (
          <SpeedDial sites={topSites} onNavigate={handleNavigate} />
        )}

        <RecentHistory entries={recentHistory} onNavigate={handleNavigate} />
      </div>
    </div>
  );
}
