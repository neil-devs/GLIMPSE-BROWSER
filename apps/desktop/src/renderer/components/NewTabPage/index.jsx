/**
 * @fileoverview NewTabPage — landing page with logo, search bar, speed dial, and history.
 * Redesigned with modern aesthetics and radial gradient accent.
 */

import React, { useState, useEffect, useCallback } from 'react';
import SpeedDial from './SpeedDial';
import RecentHistory from './RecentHistory';
import Icon from '../Icon';
import useTabs from '../../hooks/useTabs';
import './NewTabPage.css';

const ENGINE_SEARCH_URLS = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  yahoo: 'https://search.yahoo.com/search?p=',
  baidu: 'https://www.baidu.com/s?wd=',
  yandex: 'https://yandex.com/search/?text=',
};

export default function NewTabPage() {
  const { navigate, activeTabId } = useTabs();
  const [searchInput, setSearchInput] = useState('');
  const [defaultEngine, setDefaultEngine] = useState('google');
  const [recentHistory, setRecentHistory] = useState([]);
  const [topSites, setTopSites] = useState([]);

  /* Load engine */
  useEffect(() => {
    window.glimpse.settings.get('defaultEngine', 'google')
      .then((r) => {
        const val = r?.data || r;
        if (typeof val === 'string') setDefaultEngine(val);
      })
      .catch(() => {});
  }, []);

  /* Load history + top sites */
  useEffect(() => {
    (async () => {
      try {
        const histResult = await window.glimpse.history.getRecent(20);
        if (histResult?.success && histResult.data) {
          setRecentHistory(histResult.data.slice(0, 5));

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
    })();
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
    <div className="ntp">
      <div className="ntp__glow" />

      <div className="ntp__content">
        {/* Logo */}
        <div className="ntp__logo">
          <div className="ntp__logo-icon">
            <Icon name="lightning" size={36} />
          </div>
          <h1 className="ntp__wordmark">Glimpse</h1>
          <p className="ntp__tagline">The web, at the speed of light</p>
        </div>

        {/* Search Bar */}
        <form className="ntp__search" onSubmit={handleSearch}>
          <div className="ntp__search-wrap">
            <Icon name="search" size={16} className="ntp__search-icon" />
            <input
              type="text"
              className="ntp__search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search or enter URL"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </form>

        {/* Speed Dial */}
        {topSites.length > 0 && (
          <SpeedDial sites={topSites} onNavigate={handleNavigate} />
        )}

        {/* Recent History */}
        <RecentHistory entries={recentHistory} onNavigate={handleNavigate} />
      </div>
    </div>
  );
}
