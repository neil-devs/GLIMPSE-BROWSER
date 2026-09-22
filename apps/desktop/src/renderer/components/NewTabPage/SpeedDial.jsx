import React from 'react';
import './NewTabPage.css';

export default function SpeedDial({ sites, onNavigate, onRemove }) {
  return (
    <div className="speed-dial">
      {sites.map((site, i) => (
        <button key={i} className="speed-dial__item" onClick={() => onNavigate(site.url)} title={site.url}>
          <div className="speed-dial__icon">
            {site.favicon ? (
              <img src={site.favicon} alt="" width={24} height={24} />
            ) : (
              <span className="speed-dial__letter" style={{ background: `hsl(${(i * 47) % 360}, 60%, 50%)` }}>
                {(site.title || site.url).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="speed-dial__name truncate">{site.title || new URL(site.url).hostname}</span>
        </button>
      ))}
    </div>
  );
}
