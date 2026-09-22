import React, { useState } from 'react';
import BookmarkItem from './BookmarkItem';
import BookmarkFolder from './BookmarkFolder';
import useBookmarks from '../../hooks/useBookmarks';
import './Bookmarks.css';

export default function Bookmarks() {
  const { bookmarks, folders, removeBookmark, addBookmark, addFolder } = useBookmarks();
  const [search, setSearch] = useState('');
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [folderName, setFolderName] = useState('');

  const filteredBookmarks = search
    ? bookmarks.filter((b) =>
        (b.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.url || '').toLowerCase().includes(search.toLowerCase())
      )
    : bookmarks;

  /* Bookmarks not in any folder */
  const rootBookmarks = filteredBookmarks.filter((b) => !b.folder_id);
  /* Root-level folders */
  const rootFolders = folders.filter((f) => !f.parent_id);

  const handleAddFolder = async () => {
    if (folderName.trim()) {
      await addFolder(folderName.trim());
      setFolderName('');
      setShowAddFolder(false);
    }
  };

  return (
    <div className="bookmarks-panel">
      <div className="bookmarks-panel__header">
        <div className="bookmarks-panel__search">
          <span>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookmarks..."
            spellCheck={false}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => setShowAddFolder(!showAddFolder)}>+ Folder</button>
      </div>

      {showAddFolder && (
        <div className="bookmarks-panel__add-folder">
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Folder name..."
            onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleAddFolder}>Add</button>
        </div>
      )}

      <div className="bookmarks-panel__list">
        {rootFolders.map((folder) => (
          <BookmarkFolder
            key={folder.id}
            folder={folder}
            bookmarks={filteredBookmarks}
            allFolders={folders}
            onDeleteBookmark={removeBookmark}
          />
        ))}
        {rootBookmarks.map((bm) => (
          <BookmarkItem key={bm.id} bookmark={bm} onDelete={removeBookmark} />
        ))}
        {rootBookmarks.length === 0 && rootFolders.length === 0 && (
          <div className="bookmarks-panel__empty">
            <span>🔖</span>
            <p>{search ? 'No bookmarks match your search' : 'No bookmarks yet'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
