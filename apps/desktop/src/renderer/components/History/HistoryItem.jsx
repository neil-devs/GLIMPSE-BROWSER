import React from 'react';
import useTabs from '../../hooks/useTabs';

export default function HistoryItem({ entry, onDelete }) {
  const { navigate, activeTabId } = useTabs();

  const handleClick = () => {
    if (activeTabId) navigate(activeTabId, entry.url);
  };

  const time = new Date(entry.visited_at || entry.last_visited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="history-item" onClick={handleClick}>
      <div className="history-item__favicon">
        {entry.favicon_url ? <img src={entry.favicon_url} alt="" width={16} height={16} /> : <span>🌐</span>}
      </div>
      <div className="history-item__info">
        <div className="history-item__title truncate">{entry.title || entry.url}</div>
        <div className="history-item__url truncate">{entry.url}</div>
      </div>
      <span className="history-item__time">{time}</span>
      <button className="btn-icon history-item__delete" onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }} title="Delete">🗑</button>
    </div>
  );
}
