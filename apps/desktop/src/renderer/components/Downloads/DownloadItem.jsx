import React from 'react';

export default function DownloadItem({ download, onPause, onResume, onCancel, onReveal, onDelete }) {
  const { id, filename, status, bytesDownloaded, totalBytes, speed, percentComplete } = download;
  const isActive = status === 'downloading' || status === 'pending';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const percent = percentComplete || (totalBytes > 0 ? ((bytesDownloaded / totalBytes) * 100).toFixed(1) : 0);

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatSpeed = (bps) => {
    if (!bps || bps === 0) return '';
    if (bps < 1024) return `${bps} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  return (
    <div className={`download-item download-item--${status}`}>
      <div className="download-item__icon">
        {isCompleted ? '✅' : isFailed ? '❌' : '📄'}
      </div>
      <div className="download-item__info">
        <div className="download-item__name truncate">{filename || 'Unknown file'}</div>
        {isActive && (
          <>
            <div className="download-item__progress-bar">
              <div className="download-item__progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="download-item__meta">
              <span>{percent}%</span>
              {speed > 0 && <span>{formatSpeed(speed)}</span>}
              <span>{formatSize(bytesDownloaded)} / {formatSize(totalBytes)}</span>
            </div>
          </>
        )}
        {isCompleted && (
          <div className="download-item__meta">
            <span>{formatSize(download.file_size || totalBytes)}</span>
          </div>
        )}
        {isFailed && (
          <div className="download-item__error">{download.error || 'Download failed'}</div>
        )}
      </div>
      <div className="download-item__actions">
        {isActive && status !== 'paused' && <button className="btn-icon" onClick={() => onPause(id)} title="Pause">⏸</button>}
        {status === 'paused' && <button className="btn-icon" onClick={() => onResume(id)} title="Resume">▶</button>}
        {isActive && <button className="btn-icon" onClick={() => onCancel(id)} title="Cancel">✕</button>}
        {isCompleted && <button className="btn-icon" onClick={() => onReveal(id)} title="Show in folder">📂</button>}
        {(isCompleted || isFailed) && <button className="btn-icon" onClick={() => onDelete(id)} title="Remove">🗑</button>}
      </div>
    </div>
  );
}
