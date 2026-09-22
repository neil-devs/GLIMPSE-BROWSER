import React from 'react';

export default function RecentHistory({ entries, onNavigate }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="recent-history">
      <h3 className="recent-history__title">Recently Visited</h3>
      <div className="recent-history__list">
        {entries.slice(0, 5).map((entry, i) => (
          <button key={i} className="recent-history__item" onClick={() => onNavigate(entry.url)} title={entry.url}>
            <span className="recent-history__favicon">
              {entry.favicon_url ? <img src={entry.favicon_url} alt="" width={14} height={14} /> : '🌐'}
            </span>
            <span className="recent-history__name truncate">{entry.title || entry.url}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
