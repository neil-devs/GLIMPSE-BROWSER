import React from 'react';
import useSettings from '../../hooks/useSettings';

const ENGINES = [
  { name: 'google', displayName: 'Google', color: '#4285f4' },
  { name: 'bing', displayName: 'Bing', color: '#00809d' },
  { name: 'duckduckgo', displayName: 'DuckDuckGo', color: '#de5833' },
  { name: 'yahoo', displayName: 'Yahoo', color: '#6001d2' },
  { name: 'baidu', displayName: 'Baidu', color: '#2932e1' },
  { name: 'yandex', displayName: 'Yandex', color: '#fc3f1d' },
];

export default function SearchSettings() {
  const { getSetting, updateSetting } = useSettings();
  const currentEngine = getSetting('defaultEngine', 'google');

  return (
    <div className="settings-section">
      <h3 className="settings-section__title">Search Engine</h3>

      <div className="search-engines-grid">
        {ENGINES.map((engine) => (
          <button
            key={engine.name}
            className={`search-engine-card ${engine.name === currentEngine ? 'active' : ''}`}
            onClick={() => updateSetting('defaultEngine', engine.name)}
          >
            <span className="search-engine-card__icon" style={{ background: engine.color }}>
              {engine.displayName.charAt(0)}
            </span>
            <span className="search-engine-card__name">{engine.displayName}</span>
            {engine.name === currentEngine && <span className="search-engine-card__check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
