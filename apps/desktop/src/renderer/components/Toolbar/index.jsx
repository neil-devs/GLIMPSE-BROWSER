/**
 * @fileoverview Toolbar — bookmark star, downloads, prefetch status, menu.
 * Sits below the address bar.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Icon from '../Icon';
import useUiStore from '../../store/ui-store';
import './Toolbar.css';

export default function Toolbar() {
  const [prefetchCount, setPrefetchCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  /* Listen for prefetch updates */
  useEffect(() => {
    const handler = (data) => {
      if (data?.cachedCount !== undefined) setPrefetchCount(data.cachedCount);
    };
    window.glimpse.on('prefetch:statusUpdated', handler);
    return () => window.glimpse.off('prefetch:statusUpdated', handler);
  }, []);

  /* Close menu on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const openSidebarTab = useCallback((tab) => {
    if (setSidebarTab) setSidebarTab(tab);
    toggleSidebar();
  }, [toggleSidebar, setSidebarTab]);

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <button
          className="toolbar__btn"
          onClick={() => openSidebarTab('bookmarks')}
          title="Bookmarks"
        >
          <Icon name="star" size={15} />
        </button>

        <button
          className="toolbar__btn"
          onClick={() => openSidebarTab('downloads')}
          title="Downloads"
        >
          <Icon name="download" size={15} />
        </button>

        {prefetchCount > 0 && (
          <div className="toolbar__prefetch">
            <Icon name="lightning" size={13} />
            <span className="toolbar__prefetch-count">{prefetchCount} cached</span>
          </div>
        )}
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button
          className="toolbar__btn"
          onClick={() => toggleSidebar()}
          title="Toggle Sidebar"
        >
          <Icon name="sidebar" size={15} />
        </button>

        <div className="toolbar__menu-wrap" ref={menuRef}>
          <button
            className="toolbar__btn"
            onClick={() => setMenuOpen((p) => !p)}
            title="Menu"
          >
            <Icon name="menu" size={15} />
          </button>

          {menuOpen && (
            <div className="toolbar__menu scale-in">
              <button className="toolbar__menu-item" onClick={() => { window.glimpse.tabs.create('about:blank'); setMenuOpen(false); }}>
                <Icon name="plus" size={16} /> <span>New Tab</span>
                <span className="toolbar__menu-shortcut">Ctrl+T</span>
              </button>
              <div className="toolbar__menu-sep" />
              <button className="toolbar__menu-item" onClick={() => { openSidebarTab('history'); setMenuOpen(false); }}>
                <Icon name="clock" size={16} /> <span>History</span>
                <span className="toolbar__menu-shortcut">Ctrl+H</span>
              </button>
              <button className="toolbar__menu-item" onClick={() => { openSidebarTab('bookmarks'); setMenuOpen(false); }}>
                <Icon name="book-open" size={16} /> <span>Bookmarks</span>
                <span className="toolbar__menu-shortcut">Ctrl+D</span>
              </button>
              <button className="toolbar__menu-item" onClick={() => { openSidebarTab('downloads'); setMenuOpen(false); }}>
                <Icon name="download" size={16} /> <span>Downloads</span>
                <span className="toolbar__menu-shortcut">Ctrl+J</span>
              </button>
              <div className="toolbar__menu-sep" />
              <button className="toolbar__menu-item" onClick={() => { openSidebarTab('settings'); setMenuOpen(false); }}>
                <Icon name="settings" size={16} /> <span>Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
