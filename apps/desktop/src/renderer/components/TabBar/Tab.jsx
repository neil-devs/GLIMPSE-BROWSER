import React from 'react';
import './Tab.css';

export default function Tab({ tab, isActive, onClose, onClick, onContextMenu, onMouseDown }) {
  const handleClose = (e) => {
    e.stopPropagation();
    onClose(tab.id);
  };

  const handleMiddleClick = (e) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose(tab.id);
    }
  };

  return (
    <div
      className={`tab ${isActive ? 'tab--active' : ''} ${tab.isPinned ? 'tab--pinned' : ''}`}
      onClick={() => onClick(tab.id)}
      onMouseDown={(e) => {
        handleMiddleClick(e);
        onMouseDown?.(e, tab.id);
      }}
      onContextMenu={(e) => onContextMenu(e, tab)}
      title={tab.title || tab.url}
      role="tab"
      aria-selected={isActive}
    >
      <div className="tab__favicon">
        {tab.isLoading ? (
          <div className="tab__spinner" />
        ) : tab.favicon ? (
          <img src={tab.favicon} alt="" width={16} height={16} />
        ) : (
          <span className="tab__globe">🌐</span>
        )}
      </div>

      {!tab.isPinned && (
        <span className="tab__title">{tab.title || 'New Tab'}</span>
      )}

      {tab.isAudioPlaying && (
        <span className="tab__audio" title={tab.isMuted ? 'Unmute' : 'Mute'}>
          {tab.isMuted ? '🔇' : '🔊'}
        </span>
      )}

      {!tab.isPinned && (
        <button className="tab__close" onClick={handleClose} aria-label="Close tab">
          ×
        </button>
      )}
    </div>
  );
}
