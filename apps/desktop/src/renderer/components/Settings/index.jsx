import React, { useState } from 'react';
import GeneralSettings from './GeneralSettings';
import SearchSettings from './SearchSettings';
import PrefetchSettings from './PrefetchSettings';
import PrivacySettings from './PrivacySettings';
import SyncSettings from './SyncSettings';
import useUiStore from '../../store/ui-store';
import './Settings.css';

const SECTIONS = [
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'prefetch', label: 'Prefetch', icon: '⚡' },
  { id: 'privacy', label: 'Privacy', icon: '🛡' },
  { id: 'appearance', label: 'Theme', icon: '🎨' },
  { id: 'sync', label: 'Sync', icon: '☁' },
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general');
  const { theme, setTheme } = useUiStore();

  const renderSection = () => {
    switch (activeSection) {
      case 'general': return <GeneralSettings />;
      case 'search': return <SearchSettings />;
      case 'prefetch': return <PrefetchSettings />;
      case 'privacy': return <PrivacySettings />;
      case 'appearance':
        return (
          <div className="settings-section">
            <h3 className="settings-section__title">Appearance</h3>
            <div className="theme-selector">
              {['dark', 'light', 'system'].map((t) => (
                <button
                  key={t}
                  className={`theme-option ${theme === t ? 'active' : ''}`}
                  onClick={() => setTheme(t)}
                >
                  <span className="theme-option__icon">
                    {t === 'dark' ? '🌙' : t === 'light' ? '☀' : '💻'}
                  </span>
                  <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case 'sync': return <SyncSettings />;
      default: return <GeneralSettings />;
    }
  };

  return (
    <div className="settings-panel">
      <nav className="settings-nav">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            className={`settings-nav__item ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="settings-nav__icon">{section.icon}</span>
            <span>{section.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {renderSection()}
      </div>
    </div>
  );
}
