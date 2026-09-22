import React from 'react';
import SidebarNav from './SidebarNav';
import Bookmarks from '../Bookmarks';
import History from '../History';
import Downloads from '../Downloads';
import Settings from '../Settings';
import useUiStore from '../../store/ui-store';
import './Sidebar.css';

const PANEL_TITLES = {
  bookmarks: 'Bookmarks',
  history: 'History',
  downloads: 'Downloads',
  settings: 'Settings',
};

export default function Sidebar() {
  const { sidebarOpen, sidebarPanel, closeSidebar } = useUiStore();

  if (!sidebarOpen) return null;

  const renderPanel = () => {
    switch (sidebarPanel) {
      case 'bookmarks': return <Bookmarks />;
      case 'history': return <History />;
      case 'downloads': return <Downloads />;
      case 'settings': return <Settings />;
      default: return <Bookmarks />;
    }
  };

  return (
    <>
      <div className="sidebar-overlay" onClick={closeSidebar} />
      <div className="sidebar slide-in-left">
        <SidebarNav />
        <div className="sidebar__content">
          <div className="sidebar__header">
            <h2 className="sidebar__title">{PANEL_TITLES[sidebarPanel]}</h2>
            <button className="btn-icon" onClick={closeSidebar} aria-label="Close sidebar">✕</button>
          </div>
          <div className="sidebar__body">
            {renderPanel()}
          </div>
        </div>
      </div>
    </>
  );
}
