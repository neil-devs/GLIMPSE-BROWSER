/**
 * @fileoverview NewTabPage — Chrome-style with real favicons and polished shortcuts.
 */

import React, { useState, useEffect, useCallback } from 'react';
import useTabs from '../../hooks/useTabs';
import useTabStore from '../../store/tab-store';
import './NewTabPage.css';

/** Google's favicon service — returns real site icons */
const faviconUrl = (url) => {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
};

const DEFAULT_SHORTCUTS = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'GitHub', url: 'https://www.github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Twitter / X', url: 'https://x.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { title: 'ChatGPT', url: 'https://chat.openai.com' },
  { title: 'Amazon', url: 'https://www.amazon.com' },
  { title: 'LinkedIn', url: 'https://www.linkedin.com' },
];

export default function NewTabPage() {
  const { navigate, activeTab, activeTabId } = useTabs();
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const isVisible = !activeTab?.url || activeTab.url === 'about:blank';

  /* Merge with top sites from history */
  useEffect(() => {
    if (!isVisible) return;
    (async () => {
      try {
        const histResult = await window.glimpse.history.getRecent(100);
        if (histResult?.success && histResult.data && histResult.data.length > 4) {
          const siteMap = new Map();
          for (const entry of histResult.data) {
            try {
              const hostname = new URL(entry.url).hostname.replace('www.', '');
              if (!siteMap.has(hostname)) {
                siteMap.set(hostname, {
                  title: hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1),
                  url: entry.url,
                  count: 0,
                });
              }
              siteMap.get(hostname).count++;
            } catch { /* skip */ }
          }
          const topSites = [...siteMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

          if (topSites.length >= 4) {
            setShortcuts(topSites);
          }
        }
      } catch { /* use defaults */ }
    })();
  }, [isVisible]);

  const handleNavigate = useCallback((url) => {
    if (!activeTabId) return;
    /* Immediately update the store URL so the NTP hides instantly */
    useTabStore.getState().updateTab(activeTabId, { url });
    navigate(activeTabId, url);
  }, [activeTabId, navigate]);

  const handleAddShortcut = useCallback((e) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    const url = newUrl.startsWith('http') ? newUrl : `https://${newUrl}`;
    setShortcuts((prev) => [...prev, { title: newName.trim(), url }]);
    setNewName('');
    setNewUrl('');
    setShowAddForm(false);
  }, [newName, newUrl]);

  const handleRemoveShortcut = useCallback((index) => {
    setShortcuts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  if (!isVisible) return null;

  return (
    <div className="ntp">
      <div className="ntp__content">
        {/* Logo */}
        <div className="ntp__logo">
          <div className="ntp__logo-glow" />
          <div className="ntp__logo-icon">⚡</div>
          <h1 className="ntp__wordmark">Glimpse</h1>
          <p className="ntp__tagline">Browse at the speed of thought</p>
        </div>

        {/* Shortcuts grid */}
        <div className="ntp__shortcuts">
          {shortcuts.map((site, i) => {
            const favicon = faviconUrl(site.url);
            return (
              <button
                key={`${site.url}-${i}`}
                className="ntp__shortcut"
                onClick={() => handleNavigate(site.url)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRemoveShortcut(i);
                }}
                title={site.url}
              >
                <div className="ntp__shortcut-circle">
                  {favicon ? (
                    <img
                      src={favicon}
                      alt=""
                      className="ntp__shortcut-favicon"
                      loading="lazy"
                    />
                  ) : (
                    <span className="ntp__shortcut-letter">
                      {site.title.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="ntp__shortcut-label">{site.title}</span>
              </button>
            );
          })}

          {/* Add shortcut */}
          <button
            className="ntp__shortcut"
            onClick={() => setShowAddForm(true)}
            title="Add shortcut"
          >
            <div className="ntp__shortcut-circle ntp__shortcut-circle--add">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="ntp__shortcut-label">Add shortcut</span>
          </button>
        </div>
      </div>

      {/* Add shortcut modal */}
      {showAddForm && (
        <div className="ntp__modal-backdrop" onClick={() => setShowAddForm(false)}>
          <form
            className="ntp__modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddShortcut}
          >
            <h3 className="ntp__modal-title">Add shortcut</h3>
            <label className="ntp__modal-label">Name</label>
            <input
              className="ntp__modal-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. My Website"
              autoFocus
            />
            <label className="ntp__modal-label">URL</label>
            <input
              className="ntp__modal-input"
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="e.g. https://example.com"
            />
            <div className="ntp__modal-actions">
              <button type="button" className="ntp__modal-btn ntp__modal-btn--cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="ntp__modal-btn ntp__modal-btn--done">Done</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
