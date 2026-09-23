/**
 * @fileoverview Sidebar — slide-in panel from right with dark backdrop.
 */

import React, { useEffect, useCallback } from 'react';
import useUiStore from '../../store/ui-store';
import './Sidebar.css';

const SIDEBAR_TABS = [
  { id: 'bookmarks', label: 'Bookmarks', icon: '☆' },
  { id: 'history', label: 'History', icon: '⏱' },
  { id: 'downloads', label: 'Downloads', icon: '↓' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  const isOpen = useUiStore((s) => s.sidebarOpen);
  const activeTab = useUiStore((s) => s.sidebarPanel || 'bookmarks');
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape') toggleSidebar();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, toggleSidebar]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="sidebar-backdrop" onClick={toggleSidebar} />

      {/* Sidebar panel */}
      <div className="sidebar">
        <div className="sidebar__header">
          <h2 className="sidebar__title">
            {SIDEBAR_TABS.find((t) => t.id === activeTab)?.label || 'Sidebar'}
          </h2>
          <button className="sidebar__close" onClick={toggleSidebar} title="Close">
            ×
          </button>
        </div>

        <div className="sidebar__nav">
          {SIDEBAR_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar__nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setSidebarTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar__content">
          <div className="sidebar__placeholder">
            <span style={{ fontSize: 32, opacity: 0.3 }}>
              {SIDEBAR_TABS.find((t) => t.id === activeTab)?.icon}
            </span>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 12 }}>
              {activeTab === 'bookmarks' && 'Your bookmarks will appear here'}
              {activeTab === 'history' && 'Your browsing history will appear here'}
              {activeTab === 'downloads' && 'Your downloads will appear here'}
              {activeTab === 'settings' && 'Settings coming soon'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
