/**
 * @fileoverview Toolbar — action buttons below address bar.
 * The ⋮ button triggers a native Electron popup menu via IPC.
 */

import React, { useState, useEffect, useCallback } from 'react';
import useUiStore from '../../store/ui-store';
import './Toolbar.css';

export default function Toolbar() {
  const [prefetchCount, setPrefetchCount] = useState(0);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  /* Listen for prefetch updates */
  useEffect(() => {
    const handler = (data) => {
      if (data?.cachedCount !== undefined) setPrefetchCount(data.cachedCount);
    };
    if (window.glimpse?.on) window.glimpse.on('prefetch:statusUpdated', handler);
    return () => { if (window.glimpse?.off) window.glimpse.off('prefetch:statusUpdated', handler); };
  }, []);

  /* Listen for menu:action from native menu */
  useEffect(() => {
    const handler = (_event, action) => {
      if (action === 'history' || action === 'downloads' || action === 'bookmarks' || action === 'settings') {
        setSidebarTab(action);
        setSidebarOpen(true);
      }
    };
    if (window.glimpse?.on) window.glimpse.on('menu:action', handler);
    return () => { if (window.glimpse?.off) window.glimpse.off('menu:action', handler); };
  }, [setSidebarTab, setSidebarOpen]);

  const openSidebarTab = useCallback((tab) => {
    if (setSidebarTab) setSidebarTab(tab);
    toggleSidebar();
  }, [toggleSidebar, setSidebarTab]);

  const handleShowMenu = useCallback(() => {
    window.glimpse.app.showMenu();
  }, []);

  return (
    <div className="toolbar">
      {prefetchCount > 0 && (
        <div className="toolbar__prefetch-badge">
          ⚡ {prefetchCount} cached
        </div>
      )}

      <div className="toolbar__spacer" />

      <button className="toolbar__btn toolbar__menu-btn" onClick={handleShowMenu} title="Menu">
        ⋮
      </button>
    </div>
  );
}
