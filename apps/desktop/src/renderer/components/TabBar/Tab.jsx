/**
 * @fileoverview Individual Tab component.
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

  return (
    <div
      className={`tab ${isActive ? 'active' : ''}`}
      onClick={onActivate}
      onMouseDown={handleMouseDown}
      title={tab.title || tab.url}
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
            {(tab.title || 'N').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <span className="tab__title">
        {tab.title || 'New Tab'}
      </span>

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
