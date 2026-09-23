import React, { useState } from 'react';
import { SOLID_COLORS } from './ntp-themes';
import './CustomizePanel.css';

export default function CustomizePanel({ 
  onClose, 
  settings, 
  updateSettings,
  openGallery 
}) {
  return (
    <div className="customize-panel">
      <div className="customize-panel__header">
        <h2 className="customize-panel__title">Customize Glimpse</h2>
        <button className="customize-panel__close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="customize-panel__content">
        {/* Appearance Section */}
        <div className="customize-panel__section">
          <h3 className="customize-panel__section-title">Appearance</h3>
          
          <div className="customize-panel__preview">
            {settings.ntp_background_url ? (
              <img src={settings.ntp_background_url} alt="Background" className="customize-panel__preview-img" />
            ) : (
              <div 
                className="customize-panel__preview-color" 
                style={{ background: settings.ntp_theme_color || '#1a1a1d' }} 
              />
            )}
            <button className="customize-panel__change-btn" onClick={openGallery}>
              Change theme
            </button>
          </div>

          <div className="customize-panel__theme-toggles">
            {['light', 'dark', 'device'].map(mode => (
              <button 
                key={mode}
                className={`customize-panel__theme-btn ${settings.ntp_theme_mode === mode ? 'active' : ''}`}
                onClick={() => updateSettings({ ntp_theme_mode: mode })}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          <div className="customize-panel__colors">
            {SOLID_COLORS.map(color => (
              <button
                key={color.id}
                className={`customize-panel__color-swatch ${settings.ntp_theme_color === color.color && !settings.ntp_background_url ? 'active' : ''}`}
                style={{ background: color.color }}
                onClick={() => updateSettings({ ntp_theme_color: color.color, ntp_background_url: '' })}
                title={color.label}
              >
                {settings.ntp_theme_color === color.color && !settings.ntp_background_url && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color.isLight ? '#000' : '#fff'} strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcuts Section */}
        <div className="customize-panel__section">
          <div className="customize-panel__toggle-row">
            <h3 className="customize-panel__section-title">Shortcuts</h3>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={settings.ntp_show_shortcuts}
                onChange={(e) => updateSettings({ ntp_show_shortcuts: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {settings.ntp_show_shortcuts && (
            <div className="customize-panel__radio-group">
              <label className="customize-panel__radio">
                <input 
                  type="radio" 
                  name="shortcut_type"
                  checked={settings.ntp_shortcut_type === 'custom'}
                  onChange={() => updateSettings({ ntp_shortcut_type: 'custom' })}
                />
                <span className="radio-custom" />
                <div className="radio-text">
                  <span className="radio-label">My shortcuts</span>
                  <span className="radio-desc">Shortcuts are curated by you</span>
                </div>
              </label>
              <label className="customize-panel__radio">
                <input 
                  type="radio" 
                  name="shortcut_type"
                  checked={settings.ntp_shortcut_type === 'most_visited'}
                  onChange={() => updateSettings({ ntp_shortcut_type: 'most_visited' })}
                />
                <span className="radio-custom" />
                <div className="radio-text">
                  <span className="radio-label">Most-visited sites</span>
                  <span className="radio-desc">Shortcuts are suggested based on websites that you visit often</span>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Cards Section */}
        <div className="customize-panel__section">
          <div className="customize-panel__toggle-row">
            <h3 className="customize-panel__section-title">Cards</h3>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={settings.ntp_show_cards}
                onChange={(e) => updateSettings({ ntp_show_cards: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

      </div>
    </div>
  );
}
