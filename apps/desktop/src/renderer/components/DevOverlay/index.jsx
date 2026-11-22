/**
 * @fileoverview Dev Overlay HUD (Ctrl+Shift+P / Cmd+Shift+P).
 * Real-time on-screen diagnostics for pool size, memory, click class breakdown, and avg hit/miss ms.
 * @module renderer/components/DevOverlay
 */

import React, { useState, useEffect } from 'react';
import './DevOverlay.css';

export default function DevOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState({
    entries: 0,
    ready: 0,
    hits: 0,
    misses: 0,
    avgHitMs: 0,
    avgMissMs: 0,
  });

  // Toggle shortcut: Ctrl+Shift+P or Cmd+Shift+P
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Poll stats when overlay is open
  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      try {
        if (window.glimpse?.prefetch?.getStats) {
          const res = await window.glimpse.prefetch.getStats();
          if (res) setStats(res);
        }
      } catch { /* best effort */ }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const totalClicks = stats.hits + stats.misses;
  const hitRate = totalClicks > 0 ? Math.round((stats.hits / totalClicks) * 100) : 0;

  return (
    <div className="dev-overlay">
      <div className="dev-overlay__header">
        <div className="dev-overlay__title">
          <span>⚡ Prefetch Diagnostics</span>
          <span className="dev-overlay__badge">Live HUD</span>
        </div>
        <button className="dev-overlay__close" onClick={() => setIsOpen(false)} title="Close (Ctrl+Shift+P)">
          ✕
        </button>
      </div>

      <div className="dev-overlay__body">
        <div className="dev-overlay__row">
          <span className="dev-overlay__label">Pool Slots in Memory:</span>
          <span className="dev-overlay__val">{stats.entries} (ready: {stats.ready})</span>
        </div>

        <div className="dev-overlay__row">
          <span className="dev-overlay__label">Estimated Pool RAM:</span>
          <span className="dev-overlay__val">{stats.entries * 45} MB</span>
        </div>

        <div className="dev-overlay__divider" />

        <div className="dev-overlay__row">
          <span className="dev-overlay__label">Hit Rate:</span>
          <span className={`dev-overlay__val ${hitRate >= 50 ? 'dev-overlay__val--green' : 'dev-overlay__val--yellow'}`}>
            {hitRate}% ({stats.hits} hits / {totalClicks} total)
          </span>
        </div>

        <div className="dev-overlay__row">
          <span className="dev-overlay__label">Avg HIT Swap Latency:</span>
          <span className="dev-overlay__val dev-overlay__val--green">{stats.avgHitMs} ms</span>
        </div>

        <div className="dev-overlay__row">
          <span className="dev-overlay__label">Avg MISS Render Time:</span>
          <span className="dev-overlay__val">{stats.avgMissMs} ms</span>
        </div>

        <div className="dev-overlay__divider" />

        <div className="dev-overlay__row">
          <span className="dev-overlay__label">Active ML Model:</span>
          <span className="dev-overlay__val">v2.0.0 (GBDT 39-feat)</span>
        </div>
      </div>

      <div className="dev-overlay__footer">
        Toggle with Ctrl+Shift+P / Cmd+Shift+P
      </div>
    </div>
  );
}
