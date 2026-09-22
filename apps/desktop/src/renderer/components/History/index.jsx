import React, { useState } from 'react';
import HistoryItem from './HistoryItem';
import HistorySearch from './HistorySearch';
import useHistory from '../../hooks/useHistory';
import './History.css';

export default function History() {
  const { searchQuery, searchHistory, clearHistory, deleteEntry, groupedHistory, loading } = useHistory();
  const [showConfirm, setShowConfirm] = useState(false);
  const groups = groupedHistory();

  const handleClear = async () => {
    await clearHistory();
    setShowConfirm(false);
  };

  const renderGroup = (title, entries) => {
    if (entries.length === 0) return null;
    return (
      <div className="history-group" key={title}>
        <h3 className="history-group__title">{title}</h3>
        {entries.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} onDelete={deleteEntry} />
        ))}
      </div>
    );
  };

  return (
    <div className="history-panel">
      <div className="history-panel__header">
        <HistorySearch query={searchQuery} onChange={searchHistory} />
        {!showConfirm ? (
          <button className="btn btn-danger" onClick={() => setShowConfirm(true)}>Clear All</button>
        ) : (
          <div className="history-panel__confirm">
            <span>Clear all history?</span>
            <button className="btn btn-danger" onClick={handleClear}>Confirm</button>
            <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="history-panel__list">
        {loading ? (
          <div className="history-panel__loading">Loading...</div>
        ) : (
          <>
            {renderGroup('Today', groups.today)}
            {renderGroup('Yesterday', groups.yesterday)}
            {renderGroup('This Week', groups.thisWeek)}
            {renderGroup('Older', groups.older)}
            {Object.values(groups).every((g) => g.length === 0) && (
              <div className="history-panel__empty">
                <span>🕐</span>
                <p>No history found</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
