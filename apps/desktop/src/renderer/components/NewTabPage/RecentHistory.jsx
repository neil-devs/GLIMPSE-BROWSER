/**
 * @fileoverview RecentHistory — horizontal row of recent page visits.
 */

import React from 'react';
import Icon from '../Icon';

export default function RecentHistory({ entries, onNavigate }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="recent-history">
      <div className="recent-history__label">Recent</div>
      <div className="recent-history__list">
        {entries.slice(0, 5).map((entry, i) => (
          <div
            key={i}
            className="recent-history__item"
            onClick={() => onNavigate(entry.url)}
            title={entry.url}
            role="button"
            tabIndex={0}
          >
            {entry.favicon_url ? (
              <img
                src={entry.favicon_url}
                alt=""
                className="recent-history__item-favicon"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <Icon name="globe" size={14} />
            )}
            <span className="recent-history__item-title">
              {entry.title || entry.url}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
