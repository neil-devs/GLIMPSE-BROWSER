/**
 * @fileoverview Root App component.
 * Assembles the chrome UI shell: TitleBar → TabBar → AddressBar → Sidebar + Notifications.
 * This renders in the Chrome WebContentsView (108px tall) — NOT in tab views.
 */

import React, { useEffect } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import AddressBar from './components/AddressBar';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PrefetchIndicator from './components/PrefetchIndicator';
import Notifications from './components/Notifications';
import useUiStore from './store/ui-store';
import './styles/global.css';

export default function App() {
  const theme = useUiStore((s) => s.theme);

  /* Apply theme on mount */
  useEffect(() => {
    const effectiveTheme =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }, [theme]);

  /* Load saved theme from settings on first mount */
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const result = await window.glimpse.settings.get('theme', 'dark');
        if (result.success && result.data) {
          useUiStore.getState().setTheme(result.data);
        }
      } catch {
        /* Use default dark theme */
      }
    };
    loadTheme();
  }, []);

  return (
    <div id="glimpse-chrome">
      <TitleBar />

      <div className="chrome-toolbar-row">
        <TabBar />
      </div>

      <div className="chrome-addressbar-row">
        <AddressBar />
        <PrefetchIndicator />
        <Toolbar />
      </div>

      <Sidebar />
      <Notifications />
    </div>
  );
}
