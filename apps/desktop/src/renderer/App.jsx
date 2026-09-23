/**
 * @fileoverview App shell — 2-row Chrome-style header + NewTabPage overlay.
 */

import React, { useEffect } from 'react';
import TabBar from './components/TabBar';
import AddressBar from './components/AddressBar';
import NewTabPage from './components/NewTabPage';
import Sidebar from './components/Sidebar';
import Notifications from './components/Notifications';
import useTabStore from './store/tab-store';
import useUiStore from './store/ui-store';
import './styles/global.css';
import './App.css';

export default function App() {
  /* Fetch initial tab state on mount */
  useEffect(() => {
    window.glimpse.tabs.getState().then((state) => {
      if (state) {
        useTabStore.setState({
          tabs: state.tabs || [],
          activeTabId: state.activeTabId,
        });
      }
    }).catch(console.error);
  }, []);

  /* Sync overlay state with main process (for correct Z-index layering) */
  const isSidebarOpen = useUiStore((s) => s.sidebarOpen);
  const isOverlayOpen = useUiStore((s) => s.overlayOpen);
  
  useEffect(() => {
    window.glimpse.app.setOverlayActive(isSidebarOpen || isOverlayOpen);
  }, [isSidebarOpen, isOverlayOpen]);

  return (
    <div className="app">
      <div className="app__chrome">
        <TabBar />
        <AddressBar />
      </div>
      <NewTabPage />
      <Sidebar />
      <Notifications />
    </div>
  );
}
