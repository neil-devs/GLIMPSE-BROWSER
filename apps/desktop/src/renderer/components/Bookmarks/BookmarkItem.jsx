import React from 'react';
import useTabs from '../../hooks/useTabs';

export default function BookmarkItem({ bookmark, onDelete, onEdit }) {
  const { navigate, activeTabId } = useTabs();

  const handleClick = () => {
    if (activeTabId) navigate(activeTabId, bookmark.url);
  };

  return (
    <div className="bookmark-item" onClick={handleClick} title={bookmark.url}>
      <div className="bookmark-item__favicon">
        {bookmark.favicon_url ? <img src={bookmark.favicon_url} alt="" width={16} height={16} /> : <span>🔖</span>}
      </div>
      <span className="bookmark-item__title truncate">{bookmark.title || bookmark.url}</span>
      <div className="bookmark-item__actions">
        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id); }} title="Delete">🗑</button>
      </div>
    </div>
  );
}
