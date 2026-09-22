/**
 * @fileoverview TabBar — horizontal tab strip with new tab button.
 * Chrome 2025-style rounded tabs with smooth transitions.
 */

import React, { useCallback } from 'react';
import Tab from './Tab';
import Icon from '../Icon';
import useTabs from '../../hooks/useTabs';
import './TabBar.css';

export default function TabBar() {
  const { tabs, activeTabId, createTab, setActive } = useTabs();

  const handleNewTab = useCallback(() => {
    createTab('about:blank');
  }, [createTab]);

  return (
    <div className="tabbar">
      <div className="tabbar__tabs">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onActivate={() => setActive(tab.id)}
          />
        ))}
      </div>

      <button
        className="tabbar__new-tab"
        onClick={handleNewTab}
        title="New Tab (Ctrl+T)"
        aria-label="New Tab"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
