/**
 * @fileoverview Root App component — Glimpse Browser chrome shell.
 * Assembles: TabBar → AddressBar → Toolbar → (Sidebar + Notifications).
 * Renders inside the Chrome WebContentsView.
 */

import React, { useEffect } from 'react';
import TabBar from './components/TabBar';
import AddressBar from './components/AddressBar';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import Notifications from './components/Notifications';
import useUiStore from './store/ui-store';
import './styles/global.css';
import './App.css';

export default function App() {
  const theme = useUiStore((s) => s.theme);

  /* Apply theme attribute */
  useEffect(() => {
    const effective =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', effective);
  }, [theme]);

  /* Load saved theme on mount */
  useEffect(() => {
    (async () => {
      try {
        const result = await window.glimpse.settings.get('theme', 'dark');
        if (result?.success && result.data) {
          useUiStore.getState().setTheme(result.data);
        }
      } catch {
        /* default dark */
      }
    })();
  }, []);

  return (
    <div className="app">
      <div className="app__chrome">
        <TabBar />
        <AddressBar />
        <Toolbar />
      </div>

      <Sidebar />
      <Notifications />
    </div>
  );
}
