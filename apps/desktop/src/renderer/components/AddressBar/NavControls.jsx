/**
 * @fileoverview NavControls — Back, Forward, Reload/Stop buttons.
 * Uses clean SVG icons.
 */

import React, { useCallback } from 'react';
import Icon from '../Icon';
import useTabs from '../../hooks/useTabs';
import './NavControls.css';

export default function NavControls() {
  const { activeTab, activeTabId } = useTabs();

  const handleBack = useCallback(() => {
    if (activeTabId) window.glimpse.tabs.goBack(activeTabId);
  }, [activeTabId]);

  const handleForward = useCallback(() => {
    if (activeTabId) window.glimpse.tabs.goForward(activeTabId);
  }, [activeTabId]);

  const handleReload = useCallback(() => {
    if (activeTabId) window.glimpse.tabs.reload(activeTabId);
  }, [activeTabId]);

  return (
    <div className="nav-controls">
      <button
        className="nav-controls__btn"
        onClick={handleBack}
        disabled={!activeTab?.canGoBack}
        title="Back (Alt+Left)"
        aria-label="Go back"
      >
        <Icon name="arrow-left" size={16} />
      </button>

      <button
        className="nav-controls__btn"
        onClick={handleForward}
        disabled={!activeTab?.canGoForward}
        title="Forward (Alt+Right)"
        aria-label="Go forward"
      >
        <Icon name="arrow-right" size={16} />
      </button>

      <button
        className="nav-controls__btn"
        onClick={handleReload}
        title={activeTab?.isLoading ? 'Stop (Esc)' : 'Reload (Ctrl+R)'}
        aria-label={activeTab?.isLoading ? 'Stop loading' : 'Reload page'}
      >
        {activeTab?.isLoading ? (
          <Icon name="x" size={16} />
        ) : (
          <Icon name="refresh" size={16} />
        )}
      </button>
    </div>
  );
}
