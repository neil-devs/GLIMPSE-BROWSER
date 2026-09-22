import React from 'react';
import './TitleBar.css';

export default function TitleBar() {
  const handleMinimize = () => window.glimpse.app.minimize();
  const handleMaximize = () => window.glimpse.app.maximize();
  const handleClose = () => window.glimpse.app.close();

  const isWindows = navigator.userAgent.includes('Windows');

  return (
    <div className="titlebar">
      <div className="titlebar__drag-region">
        <span className="titlebar__brand">
          <span className="titlebar__brand-icon">⚡</span>
          <span className="titlebar__brand-name">Glimpse</span>
        </span>
      </div>

      {/* Windows uses native titlebar overlay, but we keep custom buttons as fallback */}
      {!isWindows && (
        <div className="titlebar__controls">
          <button className="titlebar__btn titlebar__btn--minimize" onClick={handleMinimize} aria-label="Minimize">
            <svg width="10" height="1"><rect width="10" height="1" fill="currentColor" /></svg>
          </button>
          <button className="titlebar__btn titlebar__btn--maximize" onClick={handleMaximize} aria-label="Maximize">
            <svg width="10" height="10"><rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} aria-label="Close">
            <svg width="10" height="10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" /><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
