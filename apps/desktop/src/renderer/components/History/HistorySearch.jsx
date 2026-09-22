import React from 'react';

export default function HistorySearch({ query, onChange }) {
  return (
    <div className="history-search">
      <span className="history-search__icon">🔍</span>
      <input
        type="text"
        className="history-search__input"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search history..."
        spellCheck={false}
      />
    </div>
  );
}
