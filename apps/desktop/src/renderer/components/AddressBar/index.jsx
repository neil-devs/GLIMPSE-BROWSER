/**
 * @fileoverview AddressBar — URL input with nav controls and engine selector.
 * Chrome 2025-style pill-shaped input with security indicator.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import NavControls from './NavControls';
import EngineSelector from './EngineSelector';
import Icon from '../Icon';
import useTabs from '../../hooks/useTabs';
import './AddressBar.css';

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

  /* Load saved engine on mount */
  useEffect(() => {
    window.glimpse.settings.get('defaultEngine', 'google')
      .then((result) => {
        const val = result?.data || result;
        if (typeof val === 'string' && val.length > 0) setDefaultEngine(val);
      })
      .catch(() => {});
  }, []);

  /* Sync input with active tab URL */
  useEffect(() => {
    if (!isFocused && activeTab) {
      setInputValue(activeTab.url === 'about:blank' ? '' : activeTab.url);
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
      const searchBase = ENGINE_SEARCH_URLS[defaultEngine] || ENGINE_SEARCH_URLS.google;
      url = searchBase + encodeURIComponent(trimmed);
    }

    if (activeTabId) navigate(activeTabId, url);
    inputRef.current?.blur();
  }, [inputValue, activeTabId, navigate, defaultEngine]);

  const handleFocus = () => {
    setIsFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleEngineChange = useCallback((engine) => {
    setDefaultEngine(engine);
    window.glimpse.settings.set('defaultEngine', engine).catch(() => {});
  }, []);

  const isSecure = activeTab?.url?.startsWith('https://');
  const showLock = !isFocused && activeTab?.url && activeTab.url !== 'about:blank';

  return (
    <div className="addressbar">
      <NavControls />

      <form className="addressbar__form" onSubmit={handleSubmit}>
        <div className={`addressbar__input-wrap ${isFocused ? 'addressbar__input-wrap--focused' : ''}`}>
          {showLock && (
            <span className={`addressbar__lock ${isSecure ? 'addressbar__lock--secure' : 'addressbar__lock--insecure'}`}>
              <Icon name={isSecure ? 'lock' : 'alert-triangle'} size={14} />
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            className="addressbar__input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={`Search with ${defaultEngine.charAt(0).toUpperCase() + defaultEngine.slice(1)} or enter URL`}
            spellCheck={false}
            autoComplete="off"
          />

          <EngineSelector
            currentEngine={defaultEngine}
            onSelect={handleEngineChange}
          />
        </div>
      </form>
    </div>
  );
}
