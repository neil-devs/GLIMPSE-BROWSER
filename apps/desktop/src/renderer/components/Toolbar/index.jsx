import React from 'react';
import BookmarkButton from './BookmarkButton';
import ExtensionsButton from './ExtensionsButton';
import useUiStore from '../../store/ui-store';
import useDownloads from '../../hooks/useDownloads';
import './Toolbar.css';

export default function Toolbar() {
  const { setSidebarPanel, toggleSidebar } = useUiStore();
  const { activeDownloads } = useDownloads();

  const openPanel = (panel) => setSidebarPanel(panel);

  return (
    <div className="toolbar">
      <BookmarkButton />

      <button
        className="btn-icon toolbar__downloads"
        onClick={() => openPanel('downloads')}
        title="Downloads"
        aria-label="Downloads"
      >
        ⬇
        {activeDownloads.length > 0 && (
          <span className="badge toolbar__badge">{activeDownloads.length}</span>
        )}
      </button>

      <ExtensionsButton />

      <button
        className="btn-icon"
        onClick={toggleSidebar}
        title="Toggle Sidebar"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>
    </div>
  );
}
