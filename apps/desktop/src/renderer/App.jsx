/**
 * @fileoverview Root App component — Glimpse Browser chrome shell.
 * Renders the browser chrome: TabBar → AddressBar → Toolbar.
 */

import React from 'react';
import TabBar from './components/TabBar';
import AddressBar from './components/AddressBar';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import Notifications from './components/Notifications';
import './styles/global.css';
import './App.css';

export default function App() {
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
