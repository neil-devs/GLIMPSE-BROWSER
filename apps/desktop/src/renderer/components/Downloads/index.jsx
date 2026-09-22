import React from 'react';
import DownloadItem from './DownloadItem';
import useDownloads from '../../hooks/useDownloads';
import './Downloads.css';

export default function Downloads() {
  const { downloads, pauseDownload, resumeDownload, cancelDownload, revealDownload, deleteDownload, clearCompleted } = useDownloads();

  const active = downloads.filter((d) => d.status === 'downloading' || d.status === 'pending' || d.status === 'paused');
  const completed = downloads.filter((d) => d.status === 'completed');
  const failed = downloads.filter((d) => d.status === 'failed');

  return (
    <div className="downloads-panel">
      {completed.length > 0 && (
        <div className="downloads-panel__header">
          <button className="btn btn-secondary" onClick={clearCompleted}>Clear Completed</button>
        </div>
      )}

      {active.length > 0 && (
        <div className="downloads-panel__section">
          <h3 className="downloads-panel__title">Active</h3>
          {active.map((dl) => (
            <DownloadItem key={dl.id} download={dl} onPause={pauseDownload} onResume={resumeDownload} onCancel={cancelDownload} onReveal={revealDownload} onDelete={deleteDownload} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="downloads-panel__section">
          <h3 className="downloads-panel__title">Completed</h3>
          {completed.map((dl) => (
            <DownloadItem key={dl.id} download={dl} onPause={pauseDownload} onResume={resumeDownload} onCancel={cancelDownload} onReveal={revealDownload} onDelete={deleteDownload} />
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="downloads-panel__section">
          <h3 className="downloads-panel__title">Failed</h3>
          {failed.map((dl) => (
            <DownloadItem key={dl.id} download={dl} onPause={pauseDownload} onResume={resumeDownload} onCancel={cancelDownload} onReveal={revealDownload} onDelete={deleteDownload} />
          ))}
        </div>
      )}

      {downloads.length === 0 && (
        <div className="downloads-panel__empty">
          <span className="downloads-panel__empty-icon">⬇</span>
          <p>No downloads yet</p>
        </div>
      )}
    </div>
  );
}
