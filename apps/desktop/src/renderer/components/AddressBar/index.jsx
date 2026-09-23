/**
 * @fileoverview AddressBar — Chrome-style with native engine picker popup.
 * Layout: [← → ↻] [engine▾ | ═══ URL pill ═══] [⋮]
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useTabs from '../../hooks/useTabs';
import useUiStore from '../../store/ui-store';
import './AddressBar.css';

const ENGINE_BADGES = {
  google: 'G', bing: 'B', duckduckgo: 'D',
  yahoo: 'Y!', baidu: '百', yandex: 'Я'
};
const ENGINE_NAMES = {
  google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo',
  yahoo: 'Yahoo', baidu: 'Baidu', yandex: 'Yandex'
};
const ENGINE_COLORS = {
  google: '#4285f4', bing: '#00809d', duckduckgo: '#de5833',
  yahoo: '#6001d2', baidu: '#2932e1', yandex: '#fc3f1d'
};
const ENGINE_SEARCH_URLS = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  yahoo: 'https://search.yahoo.com/search?p=',
  baidu: 'https://www.baidu.com/s?wd=',
  yandex: 'https://yandex.com/search/?text=',
};

function isValidUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return /^[\w-]+(\.[\w-]+)+/.test(input) && !input.includes(' ');
  }
}

export default function AddressBar() {
  const { activeTab, navigate, activeTabId } = useTabs();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [defaultEngine, setDefaultEngine] = useState('google');
  const inputRef = useRef(null);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  /* Load saved engine */
  useEffect(() => {
    window.glimpse.settings.get('defaultEngine', 'google')
      .then((result) => {
        const val = result?.data || result;
        if (typeof val === 'string' && val.length > 0) setDefaultEngine(val);
      })
      .catch(() => {});
  }, []);

  /* Sync URL with active tab */
  useEffect(() => {
    if (!isFocused && activeTab) {
      const url = activeTab.url;
      setInputValue(!url || url === 'about:blank' ? '' : url);
    }
  }, [activeTab?.url, activeTab?.id, isFocused]);

  /* Listen for engine selection from native menu */
  useEffect(() => {
    const handler = (engineId) => {
      setDefaultEngine(engineId);
      window.glimpse.settings.set('defaultEngine', engineId).catch(() => {});
    };
    if (window.glimpse?.on) window.glimpse.on('engine:selected', handler);
    return () => { if (window.glimpse?.off) window.glimpse.off('engine:selected', handler); };
  }, []);

  /* Listen for menu:action from native menu */
  useEffect(() => {
    const handler = (action) => {
      if (['history', 'downloads', 'bookmarks', 'settings'].includes(action)) {
        setSidebarTab(action);
        setSidebarOpen(true);
      }
    };
    if (window.glimpse?.on) window.glimpse.on('menu:action', handler);
    return () => { if (window.glimpse?.off) window.glimpse.off('menu:action', handler); };
  }, [setSidebarTab, setSidebarOpen]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    let url;
    if (isValidUrl(trimmed)) {
      url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    } else {
      url = (ENGINE_SEARCH_URLS[defaultEngine] || ENGINE_SEARCH_URLS.google) + encodeURIComponent(trimmed);
    }

    if (activeTabId) navigate(activeTabId, url);
    inputRef.current?.blur();
  }, [inputValue, activeTabId, navigate, defaultEngine]);

  const handleBack = () => activeTabId && window.glimpse.tabs.goBack(activeTabId);
  const handleForward = () => activeTabId && window.glimpse.tabs.goForward(activeTabId);
  const handleReload = () => activeTabId && window.glimpse.tabs.reload(activeTabId);

  const handleEngineClick = useCallback(() => {
    window.glimpse.app.showEngineMenu(defaultEngine);
  }, [defaultEngine]);

  const handleShowMenu = useCallback(() => {
    window.glimpse.app.showMenu();
  }, []);

  const isSecure = activeTab?.url?.startsWith('https://');
  const showLock = !isFocused && activeTab?.url && activeTab.url !== 'about:blank';

  return (
    <div className="address-bar">
      {/* Nav buttons */}
      <div className="address-bar__nav">
        <button className="address-bar__nav-btn" onClick={handleBack} disabled={!activeTab?.canGoBack} title="Back (Alt+←)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button className="address-bar__nav-btn" onClick={handleForward} disabled={!activeTab?.canGoForward} title="Forward (Alt+→)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button className="address-bar__nav-btn" onClick={handleReload} title={activeTab?.isLoading ? 'Stop' : 'Reload (Ctrl+R)'}>
          {activeTab?.isLoading ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1.5 7.5a6 6 0 1 1 1.2 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M1.5 11.5v-3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
      </div>

      {/* URL pill */}
      <form className="address-bar__form" onSubmit={handleSubmit}>
        <div className={`address-bar__pill ${isFocused ? 'address-bar__pill--focused' : ''}`}>

          {/* Engine badge — click to open native picker */}
          <button
            type="button"
            className="address-bar__engine-trigger"
            onClick={handleEngineClick}
            title={`Search with ${ENGINE_NAMES[defaultEngine]} — click to change`}
          >
            <span
              className="address-bar__engine-badge"
              style={{ background: ENGINE_COLORS[defaultEngine] }}
            >
              {ENGINE_BADGES[defaultEngine]}
            </span>
            <svg className="address-bar__engine-chevron" width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Lock icon */}
          {showLock && (
            <span className={`address-bar__lock ${isSecure ? 'secure' : 'insecure'}`}>
              {isSecure ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 4v4M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2.5 13.5h11l-5.5-10z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/></svg>
              )}
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            className="address-bar__input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => { setIsFocused(true); setTimeout(() => inputRef.current?.select(), 0); }}
            onBlur={() => setIsFocused(false)}
            placeholder={`Search ${ENGINE_NAMES[defaultEngine] || 'Google'} or type a URL`}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </form>

      {/* Menu button */}
      <button className="address-bar__menu-btn" onClick={handleShowMenu} title="Glimpse Menu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>
      </button>
    </div>
  );
}
