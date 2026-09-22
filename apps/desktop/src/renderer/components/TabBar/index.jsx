import React, { useState, useCallback } from 'react';
import Tab from './Tab';
import TabContextMenu from './TabContextMenu';
import useTabs from '../../hooks/useTabs';
import './Tab.css';

export default function TabBar() {
  const { tabs, activeTabId, createTab, closeTab, reload, setActiveTab, duplicateTab, muteTab } = useTabs();
  const [contextMenu, setContextMenu] = useState({ tab: null, position: null });

  const handleNewTab = useCallback(() => {
    createTab('about:blank');
  }, [createTab]);

  const handleContextMenu = useCallback((e, tab) => {
    e.preventDefault();
    setContextMenu({ tab, position: { x: e.clientX, y: e.clientY } });
  }, []);

  const handleCloseOthers = useCallback((tabId) => {
    tabs.forEach((t) => {
      if (t.id !== tabId) closeTab(t.id);
    });
  }, [tabs, closeTab]);

  const handleCloseRight = useCallback((tabId) => {
    const idx = tabs.findIndex((t) => t.id === tabId);
    tabs.forEach((t, i) => {
      if (i > idx) closeTab(t.id);
    });
  }, [tabs, closeTab]);

  const handleDoubleClick = useCallback((e) => {
    if (e.target.closest('.tab')) return;
    handleNewTab();
  }, [handleNewTab]);

  const contextActions = {
    newTab: handleNewTab,
    reload,
    duplicate: duplicateTab,
    pin: (tabId) => window.glimpse.tabs.mute(tabId, false), /* Pin through main IPC */
    mute: muteTab,
    close: closeTab,
    closeOthers: handleCloseOthers,
    closeRight: handleCloseRight,
  };

  /* Separate pinned tabs to render first */
  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const unpinnedTabs = tabs.filter((t) => !t.isPinned);

  return (
    <>
      <div className="tab-bar" onDoubleClick={handleDoubleClick}>
        <div className="tab-bar__tabs">
          {pinnedTabs.map((tab) => (
            <Tab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onClick={setActiveTab}
              onClose={closeTab}
              onContextMenu={handleContextMenu}
            />
          ))}
          {unpinnedTabs.map((tab) => (
            <Tab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onClick={setActiveTab}
              onClose={closeTab}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
        <button className="tab-bar__new" onClick={handleNewTab} title="New Tab (Ctrl+T)">
          +
        </button>
      </div>

      <TabContextMenu
        tab={contextMenu.tab}
        position={contextMenu.position}
        onClose={() => setContextMenu({ tab: null, position: null })}
        actions={contextActions}
      />
    </>
  );
}
