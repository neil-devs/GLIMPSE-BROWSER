import React from 'react';
import useUiStore from '../../store/ui-store';

const NAV_ITEMS = [
  { panel: 'bookmarks', icon: '📚', label: 'Bookmarks' },
  { panel: 'history', icon: '🕐', label: 'History' },
  { panel: 'downloads', icon: '⬇', label: 'Downloads' },
  { panel: 'settings', icon: '⚙', label: 'Settings' },
];

export default function SidebarNav() {
  const { sidebarPanel, setSidebarPanel } = useUiStore();

  return (
    <nav className="sidebar-nav">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.panel}
          className={`sidebar-nav__item ${sidebarPanel === item.panel ? 'active' : ''}`}
          onClick={() => setSidebarPanel(item.panel)}
          title={item.label}
          aria-label={item.label}
        >
          <span className="sidebar-nav__icon">{item.icon}</span>
        </button>
      ))}
    </nav>
  );
}
