/**
 * @fileoverview AddressBar — Chrome-style URL bar with nav buttons and inline engine pills.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useTabs from '../../hooks/useTabs';
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
const ALL_ENGINES = ['google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'yandex'];

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

  /* Load saved engine */
  useEffect(() => {
    window.glimpse.settings.get('defaultEngine', 'google')
      .then((result) => {
        const val = result?.data || result;
        if (typeof val === 'string' && val.length > 0) setDefaultEngine(val);
      })
      .catch(() => {});
  }, []);

  /* Sync URL */
  useEffect(() => {
    if (!isFocused && activeTab) {
      const url = activeTab.url;
      setInputValue(!url || url === 'about:blank' ? '' : url);
    }
  }, [activeTab?.url, activeTab?.id, isFocused]);

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

  const handleEngineChange = useCallback((engine) => {
    setDefaultEngine(engine);
    window.glimpse.settings.set('defaultEngine', engine).catch(() => {});
  }, []);

  const isSecure = activeTab?.url?.startsWith('https://');
  const showLock = !isFocused && activeTab?.url && activeTab.url !== 'about:blank';

  return (
    <div className="address-bar">
      {/* Nav buttons */}
      <button
        className="address-bar__nav-btn"
        onClick={handleBack}
        disabled={!activeTab?.canGoBack}
        title="Back"
      >
        ←
      </button>
      <button
        className="address-bar__nav-btn"
        onClick={handleForward}
        disabled={!activeTab?.canGoForward}
        title="Forward"
      >
        →
      </button>
      <button
        className="address-bar__nav-btn"
        onClick={handleReload}
        title={activeTab?.isLoading ? 'Stop' : 'Reload'}
      >
        {activeTab?.isLoading ? '✕' : '↻'}
      </button>

      {/* URL input */}
      <form className="address-bar__form" onSubmit={handleSubmit}>
        <div className={`address-bar__input-wrapper ${isFocused ? 'focused' : ''}`}>
          {showLock && (
            <span className={`address-bar__lock ${isSecure ? 'secure' : 'insecure'}`}>
              {isSecure ? '🔒' : '⚠'}
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

      {/* Engine pills */}
      <div className="engine-pills">
        {ALL_ENGINES.map((engine) => (
          <button
            key={engine}
            className={`engine-pill ${defaultEngine === engine ? 'active' : ''}`}
            onClick={() => handleEngineChange(engine)}
            title={ENGINE_NAMES[engine]}
          >
            <span
              className="engine-pill__badge"
              style={{ background: ENGINE_COLORS[engine] }}
            >
              {ENGINE_BADGES[engine]}
            </span>
            <span className="engine-pill__name">{ENGINE_NAMES[engine]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
