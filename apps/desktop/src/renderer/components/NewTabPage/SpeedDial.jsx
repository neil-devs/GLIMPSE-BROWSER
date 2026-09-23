/**
 * @fileoverview SpeedDial — grid of frequently visited sites.
 */

import React from 'react';
import Icon from '../Icon';

export default function SpeedDial({ sites, onNavigate }) {
  return (
    <div className="speed-dial">
      <div className="speed-dial__grid">
        {sites.map((site, i) => {
          let displayName;
          try {
            displayName = new URL(site.url).hostname.replace('www.', '');
          } catch {
            displayName = site.title || 'Site';
          }

          return (
            <div
              key={i}
              className="speed-dial__card"
              onClick={() => onNavigate(site.url)}
              title={site.url}
              role="button"
              tabIndex={0}
            >
              {site.favicon ? (
                <img
                  src={site.favicon}
                  alt=""
                  className="speed-dial__card-favicon"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div
                  className="speed-dial__card-favicon"
                  style={{
                    background: `hsl(${(i * 47) % 360}, 50%, 45%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="speed-dial__card-name">{displayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
