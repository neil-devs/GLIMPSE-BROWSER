import React, { useState, useEffect, useRef, useCallback } from 'react';
import NavControls from './NavControls';
import EngineSelector from './EngineSelector';
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
        if (typeof val === 'string' && val.length > 0) {
          setDefaultEngine(val);
        }
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

    if (activeTabId) {
      navigate(activeTabId, url);
    }

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
    console.log('[AddressBar] Engine changed to:', engine);
    setDefaultEngine(engine);
    window.glimpse.settings.set('defaultEngine', engine).catch(() => {});
  }, []);

  const isSecure = activeTab?.url?.startsWith('https://');

  return (
    <div className="address-bar">
      <NavControls />

      <form className="address-bar__form" onSubmit={handleSubmit}>
        <div className={`address-bar__input-wrapper ${isFocused ? 'focused' : ''}`}>
          {!isFocused && activeTab?.url && activeTab.url !== 'about:blank' && (
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
