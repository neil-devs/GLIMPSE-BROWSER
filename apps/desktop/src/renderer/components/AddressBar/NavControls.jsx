import React from 'react';
import useTabs from '../../hooks/useTabs';

export default function NavControls() {
  const { activeTab, goBack, goForward, reload } = useTabs();

  return (
    <div className="nav-controls">
      <button
        className="btn-icon nav-controls__btn"
        onClick={() => goBack()}
        disabled={!activeTab?.canGoBack}
        title="Back (Alt+←)"
        aria-label="Go back"
      >
        ←
      </button>
      <button
        className="btn-icon nav-controls__btn"
        onClick={() => goForward()}
        disabled={!activeTab?.canGoForward}
        title="Forward (Alt+→)"
        aria-label="Go forward"
      >
        →
      </button>
      <button
        className="btn-icon nav-controls__btn"
        onClick={() => reload()}
        title={activeTab?.isLoading ? 'Stop (Esc)' : 'Reload (F5)'}
        aria-label={activeTab?.isLoading ? 'Stop loading' : 'Reload'}
      >
        {activeTab?.isLoading ? '✕' : '↻'}
      </button>
    </div>
  );
}
