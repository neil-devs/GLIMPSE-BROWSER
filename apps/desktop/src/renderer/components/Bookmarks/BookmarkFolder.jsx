import React, { useState } from 'react';
import BookmarkItem from './BookmarkItem';

export default function BookmarkFolder({ folder, bookmarks, allFolders, onDeleteBookmark, onDeleteFolder }) {
  const [collapsed, setCollapsed] = useState(false);
  const children = bookmarks.filter((b) => b.folder_id === folder.id);
  const subFolders = allFolders.filter((f) => f.parent_id === folder.id);

  return (
    <div className="bookmark-folder">
      <div className="bookmark-folder__header" onClick={() => setCollapsed(!collapsed)}>
        <span className="bookmark-folder__arrow">{collapsed ? '▸' : '▾'}</span>
        <span className="bookmark-folder__icon">📁</span>
        <span className="bookmark-folder__name truncate">{folder.title || 'Folder'}</span>
        <span className="bookmark-folder__count">{children.length}</span>
      </div>
      {!collapsed && (
        <div className="bookmark-folder__children">
          {subFolders.map((sub) => (
            <BookmarkFolder
              key={sub.id}
              folder={sub}
              bookmarks={bookmarks}
              allFolders={allFolders}
              onDeleteBookmark={onDeleteBookmark}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
          {children.map((bm) => (
            <BookmarkItem key={bm.id} bookmark={bm} onDelete={onDeleteBookmark} />
          ))}
          {children.length === 0 && subFolders.length === 0 && (
            <div className="bookmark-folder__empty">Empty folder</div>
          )}
        </div>
      )}
    </div>
  );
}
