import React, { useState, useCallback, useEffect, useRef } from 'react';
import './EngineSelector.css';

const ENGINES = [
  { name: 'google', displayName: 'Google', icon: 'G', color: '#4285f4' },
  { name: 'bing', displayName: 'Bing', icon: 'B', color: '#00809d' },
  { name: 'duckduckgo', displayName: 'DuckDuckGo', icon: 'D', color: '#de5833' },
  { name: 'yahoo', displayName: 'Yahoo', icon: 'Y!', color: '#6001d2' },
  { name: 'baidu', displayName: 'Baidu', icon: '百', color: '#2932e1' },
  { name: 'yandex', displayName: 'Yandex', icon: 'Я', color: '#fc3f1d' },
];

/**
 * Engine selector that shows an inline horizontal picker
 * directly inside the address bar.
 *
 * This avoids ALL popup/dropdown z-index issues caused by the tab
 * WebContentsView overlaying the chrome below 108px.
 */
export default function EngineSelector({ currentEngine, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  const active = ENGINES.find((e) => e.name === currentEngine) || ENGINES[0];

  /* Close on click outside */
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  /* Close on Escape */
  useEffect(() => {
    if (!expanded) return;
    function handleKey(e) {
      if (e.key === 'Escape') setExpanded(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded]);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleSelect = useCallback((engineName) => {
    onSelect(engineName);
    setExpanded(false);
  }, [onSelect]);

  return (
    <div className="engine-selector" ref={containerRef}>
      {expanded ? (
        /* ── Inline horizontal engine picker ─────────────────── */
        <div className="engine-selector__inline-picker">
          {ENGINES.map((engine) => (
            <button
              key={engine.name}
              type="button"
              className={`engine-selector__pill ${engine.name === currentEngine ? 'active' : ''}`}
              onClick={() => handleSelect(engine.name)}
              title={engine.displayName}
            >
              <span
                className="engine-selector__pill-icon"
                style={{ background: engine.color }}
              >
                {engine.icon}
              </span>
              <span className="engine-selector__pill-name">{engine.displayName}</span>
            </button>
          ))}
        </div>
      ) : (
        /* ── Collapsed: just show active engine icon ─────────── */
        <button
          type="button"
          className="engine-selector__btn"
          onClick={handleToggle}
          title={`Search with ${active.displayName} — click to change`}
        >
          <span className="engine-selector__icon" style={{ background: active.color }}>
            {active.icon}
          </span>
        </button>
      )}
    </div>
  );
}
