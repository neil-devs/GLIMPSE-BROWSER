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
    </div>
  );
}
