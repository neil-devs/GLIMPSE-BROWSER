/**
 * @fileoverview TabBar — Chrome-style tab strip with window controls.
 * Layout: [tabs...] [+] [drag spacer] [— □ ×]
 */

import React, { useCallback } from 'react';
import Tab from './Tab';
import TabSearch from './TabSearch';
import useTabs from '../../hooks/useTabs';
import './TabBar.css';

export default function TabBar() {
  const { tabs, activeTabId, createTab, setActiveTab } = useTabs();

  const handleNewTab = useCallback(() => {
    createTab('about:blank');
  }, [createTab]);

  const handleMinimize = () => window.glimpse.app.minimize();
  const handleMaximize = () => window.glimpse.app.maximize();
  const handleClose = () => window.glimpse.app.close();

  return (
    <div className="tab-bar">
      <TabSearch />
      
      <div className="tab-bar__tabs">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onActivate={() => setActiveTab(tab.id)}
          />
        ))}
        <button
          className="tab-bar__new-tab"
          onClick={handleNewTab}
          title="New Tab (Ctrl+T)"
        >
          +
        </button>
      </div>

      {/* Drag spacer fills remaining space */}
      <div className="tab-bar__drag-spacer" />

      {/* Window controls — Chrome style */}
      <div className="tab-bar__window-controls">
        <button className="tab-bar__win-btn" onClick={handleMinimize} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button className="tab-bar__win-btn" onClick={handleMaximize} title="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="tab-bar__win-btn tab-bar__win-btn--close" onClick={handleClose} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
      </div>
    </div>
  );
}
