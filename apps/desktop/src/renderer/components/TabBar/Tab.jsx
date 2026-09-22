/**
 * @fileoverview Individual Tab component.
 * Chrome 2025-style with rounded top corners, favicon, close button.
 */

import React, { useCallback } from 'react';
import Icon from '../Icon';
import useTabs from '../../hooks/useTabs';
import './Tab.css';

export default function Tab({ tab, isActive, onActivate }) {
  const { closeTab } = useTabs();

  const handleClose = useCallback((e) => {
    e.stopPropagation();
    closeTab(tab.id);
  }, [closeTab, tab.id]);

  const handleMouseDown = useCallback((e) => {
    /* Middle-click to close */
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab.id);
    }
  }, [closeTab, tab.id]);

  return (
    <div
      className={`tab ${isActive ? 'tab--active' : ''} ${tab.isLoading ? 'tab--loading' : ''}`}
      onClick={onActivate}
      onMouseDown={handleMouseDown}
      title={tab.title || tab.url}
      role="tab"
      aria-selected={isActive}
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
          <Icon name="globe" size={14} />
        )}
      </div>

      <span className="tab__title">
        {tab.title || 'New Tab'}
      </span>

      {tab.isAudioPlaying && (
        <button
          className="tab__audio-btn"
          onClick={(e) => {
            e.stopPropagation();
            window.glimpse.tabs.mute(tab.id, !tab.isMuted);
          }}
          title={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
        >
          <Icon name={tab.isMuted ? 'speaker-off' : 'speaker'} size={12} />
        </button>
      )}

      <button
        className="tab__close"
        onClick={handleClose}
        title="Close tab"
        aria-label="Close tab"
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
