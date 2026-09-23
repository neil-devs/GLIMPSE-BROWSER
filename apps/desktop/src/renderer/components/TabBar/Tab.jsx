/**
 * @fileoverview Individual Tab component — Chrome-style.
 */

import React, { useCallback } from 'react';
import useTabs from '../../hooks/useTabs';
import './Tab.css';

export default function Tab({ tab, isActive, onActivate }) {
  const { closeTab } = useTabs();

  const handleClose = useCallback((e) => {
    e.stopPropagation();
    closeTab(tab.id);
  }, [closeTab, tab.id]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab.id);
    }
  }, [closeTab, tab.id]);

  const displayTitle = tab.title || 'New Tab';
  const isNewTab = !tab.url || tab.url === 'about:blank';

  return (
    <div
      className={`tab ${isActive ? 'active' : ''}`}
      onClick={onActivate}
      onMouseDown={handleMouseDown}
      title={tab.title || tab.url || 'New Tab'}
    >
      <div className="tab__favicon">
        {tab.isLoading ? (
          <div className="tab__spinner" />
        ) : tab.favicon ? (
          <img
            src={tab.favicon}
            alt=""
            width={16}
            height={16}
            className="tab__favicon-img"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="tab__favicon-placeholder">
            {isNewTab ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1.5 8h13M8 1.5c-2 2-2 11 0 13M8 1.5c2 2 2 11 0 13" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            ) : (
              (tab.title || 'N').charAt(0).toUpperCase()
            )}
          </div>
        )}
      </div>

      <span className="tab__title">{displayTitle}</span>

      <button
        className="tab__close"
        onClick={handleClose}
        title="Close tab"
      >
        ×
      </button>
    </div>
  );
}
