/**
 * @fileoverview RecentHistory — vertical list of recent page visits ("Continue with these tabs" card).
 */

import React from 'react';
import Icon from '../Icon';
import './RecentHistory.css';

function timeAgo(dateString) {
  if (!dateString) return 'a while ago';
  // SQLite dates might lack 'Z', assume UTC
  const dateStr = dateString.includes('Z') ? dateString : dateString + 'Z';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'a while ago';
  
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default function RecentHistory({ entries, onNavigate }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="cards-container">
      <div className="cards-header">
        <span className="cards-header-title">Continue with these tabs</span>
        <button className="cards-header-menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <div className="cards-list">
        {entries.slice(0, 5).map((entry, i) => {
          let hostname = entry.url;
          try {
            hostname = new URL(entry.url).hostname.replace(/^www\./, '');
          } catch { /* ignore */ }
          
          return (
            <div
              key={i}
              className="cards-item"
              onClick={() => onNavigate(entry.url)}
              title={entry.url}
              role="button"
              tabIndex={0}
            >
              <div className="cards-item-icon">
                {entry.favicon_url ? (
                  <img
                    src={entry.favicon_url}
                    alt=""
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <Icon name="globe" size={16} />
                )}
              </div>
              <div className="cards-item-text">
                <div className="cards-item-title">{entry.title || hostname}</div>
                <div className="cards-item-subtitle">
                  {hostname} • You visited {timeAgo(entry.last_visited_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cards-footer">
        <button className="cards-footer-btn" onClick={() => onNavigate('glimpse://history')}>
          See more
        </button>
      </div>
    </div>
  );
}
