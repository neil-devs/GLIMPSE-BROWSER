/**
 * @fileoverview Sidebar — slides in from right.
 * Tabs: Bookmarks, History, Downloads, Settings.
 */

import React, { useEffect, useCallback } from 'react';
import Icon from '../Icon';
import useUiStore from '../../store/ui-store';
import './Sidebar.css';

const SIDEBAR_TABS = [
  { id: 'bookmarks', label: 'Bookmarks', icon: 'star' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar() {
  const isOpen = useUiStore((s) => s.sidebarOpen);
  const activeTab = useUiStore((s) => s.sidebarTab || 'bookmarks');
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape') toggleSidebar();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, toggleSidebar]);

  const handleTabChange = useCallback((tabId) => {
    if (setSidebarTab) setSidebarTab(tabId);
  }, [setSidebarTab]);

  return (
    <div className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__header">
        <h2 className="sidebar__title">
          {SIDEBAR_TABS.find((t) => t.id === activeTab)?.label || 'Sidebar'}
        </h2>
        <button
          className="sidebar__close"
          onClick={toggleSidebar}
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="sidebar__nav">
        {SIDEBAR_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sidebar__nav-tab ${activeTab === tab.id ? 'sidebar__nav-tab--active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <Icon name={tab.icon} size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar__content">
        {activeTab === 'bookmarks' && (
          <div className="sidebar__placeholder">
            <Icon name="star" size={32} />
            <p>Your bookmarks will appear here</p>
          </div>
        )}
        {activeTab === 'history' && (
          <div className="sidebar__placeholder">
            <Icon name="clock" size={32} />
            <p>Your browsing history will appear here</p>
          </div>
        )}
        {activeTab === 'downloads' && (
          <div className="sidebar__placeholder">
            <Icon name="download" size={32} />
            <p>Your downloads will appear here</p>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="sidebar__placeholder">
            <Icon name="settings" size={32} />
            <p>Settings coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
