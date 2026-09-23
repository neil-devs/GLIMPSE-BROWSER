/**
 * @fileoverview TabSearch — Chrome-style dropdown to search open tabs and recent history.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useTabStore from '../../store/tab-store';
import useUiStore from '../../store/ui-store';
import './TabSearch.css';

/**
 * Format relative time (e.g. "27 mins ago")
 */
function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} secs ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export default function TabSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState([]);
  const dropdownRef = useRef(null);

  const setOverlayOpen = useUiStore((s) => s.setOverlayOpen);
  const { tabs, setActiveTab, closeTab } = useTabStore();

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    setOverlayOpen(isOpen);
    if (isOpen) {
      window.glimpse.history.getRecent(15).then((response) => {
        if (!response || !response.success) return;
        const data = response.data;
        // Filter out empty URLs or duplicates roughly
        const unique = [];
        const seen = new Set();
        for (const item of data || []) {
          if (item.url && !seen.has(item.url)) {
            seen.add(item.url);
            unique.push(item);
          }
        }
        setRecent(unique);
      }).catch(console.error);
    } else {
      setSearch('');
    }
  }, [isOpen, setOverlayOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    
    function handleKeyDown(e) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    setIsOpen(false);
  };

  const handleRecentClick = (url) => {
    window.glimpse.tabs.create(url);
    setIsOpen(false);
  };

  const filteredTabs = tabs.filter(
    (t) =>
      (t.title && t.title.toLowerCase().includes(search.toLowerCase())) ||
      (t.url && t.url.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredRecent = recent.filter(
    (r) =>
      (r.title && r.title.toLowerCase().includes(search.toLowerCase())) ||
      (r.url && r.url.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="tab-search" ref={dropdownRef}>
      <button 
        className={`tab-search__btn ${isOpen ? 'active' : ''}`}
        onClick={toggleOpen}
        title="Search tabs (Ctrl+Shift+A)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 5L8 10L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </button>

      {isOpen && (
        <div className="tab-search__dropdown">
          <div className="tab-search__header">
            <svg className="tab-search__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="tab-search__input"
              placeholder="Search tabs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {!search && <span className="tab-search__shortcut">Ctrl+Shift+A</span>}
          </div>

          <div className="tab-search__content">
            {filteredTabs.length > 0 && (
              <div className="tab-search__section">
                <div className="tab-search__section-title">Open tabs</div>
                {filteredTabs.map((tab) => (
                  <div key={tab.id} className="tab-search__item" onClick={() => handleTabClick(tab.id)}>
                    {tab.favicon ? (
                      <img src={tab.favicon} className="tab-search__item-favicon" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div className="tab-search__item-placeholder">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 8h13M8 1.5c-2 2-2 11 0 13M8 1.5c2 2 2 11 0 13" stroke="currentColor" strokeWidth="1.2"/></svg>
                      </div>
                    )}
                    <div className="tab-search__item-details">
                      <div className="tab-search__item-title">{tab.title || tab.url || 'New Tab'}</div>
                      <div className="tab-search__item-url">{tab.url}</div>
                    </div>
                    <button 
                      className="tab-search__item-close" 
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                      title="Close tab"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {filteredRecent.length > 0 && (
              <div className="tab-search__section">
                <div className="tab-search__section-title">
                  Recently Closed
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                    <path d="M3 11L8 6L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {filteredRecent.map((entry, i) => (
                  <div key={i} className="tab-search__item" onClick={() => handleRecentClick(entry.url)}>
                    {entry.favicon_url ? (
                      <img src={entry.favicon_url} className="tab-search__item-favicon" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div className="tab-search__item-placeholder">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 8h13M8 1.5c-2 2-2 11 0 13M8 1.5c2 2 2 11 0 13" stroke="currentColor" strokeWidth="1.2"/></svg>
                      </div>
                    )}
                    <div className="tab-search__item-details">
                      <div className="tab-search__item-title">{entry.title || entry.url}</div>
                      <div className="tab-search__item-url">
                        {(() => {
                          try {
                            return new URL(entry.url).hostname.replace(/^www\./, '');
                          } catch {
                            return entry.url;
                          }
                        })()}
                        {entry.last_visited_at && ` • ${getRelativeTime(entry.last_visited_at)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
