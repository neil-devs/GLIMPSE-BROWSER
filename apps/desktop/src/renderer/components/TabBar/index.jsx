/**
 * @fileoverview TabBar — horizontal tab strip with new tab button.
 */

import React, { useCallback } from 'react';
import Tab from './Tab';
import useTabs from '../../hooks/useTabs';
import './TabBar.css';

export default function TabBar() {
  const { tabs, activeTabId, createTab, setActiveTab } = useTabs();

  const handleNewTab = useCallback(() => {
    createTab('about:blank');
  }, [createTab]);

  return (
    <div className="tab-bar">
      <div className="tab-bar__tabs">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onActivate={() => setActiveTab(tab.id)}
          />
        ))}

        {/* + button sits right after last tab, scrolls with them */}
        <button
          className="tab-bar__new-tab"
          onClick={handleNewTab}
          title="New Tab (Ctrl+T)"
        >
          +
        </button>
      </div>

      {/* Empty drag region fills remaining space */}
      <div className="tab-bar__drag-spacer" />
    </div>
  );
}
