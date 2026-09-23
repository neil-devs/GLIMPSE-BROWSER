/**
 * @fileoverview NewTabPage — Chrome-style with real favicons and polished shortcuts.
 */

import React, { useState, useEffect, useCallback } from 'react';
import useTabs from '../../hooks/useTabs';
import useTabStore from '../../store/tab-store';
import CustomizePanel from './CustomizePanel';
import ThemeGallery from './ThemeGallery';
import RecentHistory from './RecentHistory';
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

  // Customize settings state
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [showThemeGallery, setShowThemeGallery] = useState(false);
  const [settings, setSettings] = useState({
    ntp_background_url: '',
    ntp_theme_color: '#1a1a1d',
    ntp_theme_mode: 'device',
    ntp_show_shortcuts: true,
    ntp_shortcut_type: 'custom',
    ntp_show_cards: true
  });
  
  const [recentCards, setRecentCards] = useState([]);

  const isVisible = !activeTab?.url || activeTab.url === 'about:blank';

  /* Load shortcuts and settings from DB */
  useEffect(() => {
    if (!isVisible) return;
    (async () => {
      try {
        // Load Settings
        const settingsKeys = Object.keys(settings);
        const loadedSettings = { ...settings };
        for (const key of settingsKeys) {
          const res = await window.glimpse.settings.get(key);
          if (res?.success && res.data !== null) {
            loadedSettings[key] = key.startsWith('ntp_show') ? res.data === 'true' : res.data;
          }
        }
        setSettings(loadedSettings);

        // Load Recent History for Cards
        const histResult = await window.glimpse.history.getRecent(100);
        if (histResult?.success && histResult.data) {
          setRecentCards(histResult.data.slice(0, 5));
        }

        // Load Shortcuts
        const savedShortcuts = await window.glimpse.settings.get('ntp_shortcuts');
        if (savedShortcuts?.success && savedShortcuts.data && loadedSettings.ntp_shortcut_type === 'custom') {
          setShortcuts(JSON.parse(savedShortcuts.data));
          return;
        }
        
        /* If no saved shortcuts or type is most_visited, populate from history */
        let initialShortcuts = DEFAULT_SHORTCUTS;
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
            initialShortcuts = topSites;
          }
        }
        setShortcuts(initialShortcuts);
        if (loadedSettings.ntp_shortcut_type === 'custom') {
          window.glimpse.settings.set('ntp_shortcuts', JSON.stringify(initialShortcuts));
        }
      } catch (err) { console.error('Error loading NTP settings:', err); }
    })();
  }, [isVisible]);

  // Handle setting updates
  const updateSettings = async (updates) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    
    // Persist to DB
    for (const [key, value] of Object.entries(updates)) {
      await window.glimpse.settings.set(key, typeof value === 'boolean' ? value.toString() : value);
    }

    // Handle shortcut type change
    if (updates.ntp_shortcut_type) {
      if (updates.ntp_shortcut_type === 'most_visited') {
        const histResult = await window.glimpse.history.getRecent(100);
        if (histResult?.success && histResult.data) {
          const siteMap = new Map();
          for (const entry of histResult.data) {
            try {
              const hostname = new URL(entry.url).hostname.replace('www.', '');
              if (!siteMap.has(hostname)) {
                siteMap.set(hostname, { title: hostname.split('.')[0], url: entry.url, count: 0 });
              }
              siteMap.get(hostname).count++;
            } catch { /* skip */ }
          }
          const topSites = [...siteMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);
          if (topSites.length >= 4) setShortcuts(topSites);
        }
      } else {
        const saved = await window.glimpse.settings.get('ntp_shortcuts');
        if (saved?.success && saved.data) {
          setShortcuts(JSON.parse(saved.data));
        } else {
          setShortcuts(DEFAULT_SHORTCUTS);
        }
      }
    }
  };

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
    const updated = [...shortcuts, { title: newName.trim(), url }];
    setShortcuts(updated);
    if (settings.ntp_shortcut_type === 'custom') {
      window.glimpse.settings.set('ntp_shortcuts', JSON.stringify(updated));
    }
    setNewName('');
    setNewUrl('');
    setShowAddForm(false);
  }, [newName, newUrl, shortcuts, settings.ntp_shortcut_type]);

  const handleRemoveShortcut = useCallback((index) => {
    if (settings.ntp_shortcut_type === 'most_visited') return; // Cannot edit most visited
    const updated = shortcuts.filter((_, i) => i !== index);
    setShortcuts(updated);
    window.glimpse.settings.set('ntp_shortcuts', JSON.stringify(updated));
  }, [shortcuts, settings.ntp_shortcut_type]);

  if (!isVisible) return null;

  return (
    <div 
      className="ntp"
      style={{
        background: settings.ntp_background_url 
          ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${settings.ntp_background_url}) center/cover no-repeat` 
          : settings.ntp_theme_color,
      }}
    >
      <div className="ntp__content">
        {/* Logo */}
        <div className="ntp__logo">
          <div className="ntp__logo-glow" />
          <div className="ntp__logo-icon">⚡</div>
          <h1 className="ntp__wordmark">Glimpse</h1>
        </div>

        {/* Shortcuts grid */}
        {settings.ntp_show_shortcuts && (
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
                      <img src={favicon} alt="" className="ntp__shortcut-favicon" loading="lazy" />
                    ) : (
                      <span className="ntp__shortcut-letter">{site.title.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="ntp__shortcut-label">{site.title}</span>
                </button>
              );
            })}

            {/* Add shortcut */}
            {settings.ntp_shortcut_type === 'custom' && (
              <button className="ntp__shortcut" onClick={() => setShowAddForm(true)} title="Add shortcut">
                <div className="ntp__shortcut-circle ntp__shortcut-circle--add">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="ntp__shortcut-label">Add shortcut</span>
              </button>
            )}
          </div>
        )}

        {/* Cards */}
        {settings.ntp_show_cards && (
          <div className="ntp__cards">
            <RecentHistory entries={recentCards} onNavigate={handleNavigate} />
          </div>
        )}
      </div>

      {/* Customize Button */}
      <button 
        className="ntp__customize-btn" 
        onClick={() => setShowCustomizePanel(true)}
        title="Customize Glimpse"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <span>Customize Glimpse</span>
      </button>

      {/* Panels and Modals */}
      {showCustomizePanel && (
        <CustomizePanel 
          onClose={() => setShowCustomizePanel(false)}
          settings={settings}
          updateSettings={updateSettings}
          openGallery={() => setShowThemeGallery(true)}
        />
      )}

      {showThemeGallery && (
        <ThemeGallery 
          onClose={() => setShowThemeGallery(false)}
          currentUrl={settings.ntp_background_url}
          onSelect={(url) => updateSettings({ ntp_background_url: url })}
        />
      )}

      {showAddForm && (
        <div className="ntp__modal-backdrop" onClick={() => setShowAddForm(false)}>
          <form className="ntp__modal" onClick={(e) => e.stopPropagation()} onSubmit={handleAddShortcut}>
            <h3 className="ntp__modal-title">Add shortcut</h3>
            <label className="ntp__modal-label">Name</label>
            <input className="ntp__modal-input" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. My Website" autoFocus />
            <label className="ntp__modal-label">URL</label>
            <input className="ntp__modal-input" type="text" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="e.g. https://example.com" />
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
