import React from 'react';
import useSettings from '../../hooks/useSettings';

export default function GeneralSettings() {
  const { getSetting, updateSetting } = useSettings();

  return (
    <div className="settings-section">
      <h3 className="settings-section__title">General</h3>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>Homepage</label>
          <span className="settings-row__desc">URL loaded when you open a new window</span>
        </div>
        <input
          type="text"
          className="settings-row__input"
          value={getSetting('homepage', '')}
          onChange={(e) => updateSetting('homepage', e.target.value)}
          placeholder="about:blank"
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>On Startup</label>
          <span className="settings-row__desc">What to show when Glimpse starts</span>
        </div>
        <select
          className="settings-row__select"
          value={getSetting('startupBehavior', 'newTab')}
          onChange={(e) => updateSetting('startupBehavior', e.target.value)}
        >
          <option value="newTab">Open new tab</option>
          <option value="restoreTabs">Restore previous tabs</option>
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>Hardware Acceleration</label>
          <span className="settings-row__desc">Uses GPU for rendering. Disable if experiencing display issues</span>
        </div>
        <button
          className={`toggle ${getSetting('hardwareAcceleration', true) ? 'active' : ''}`}
          onClick={() => updateSetting('hardwareAcceleration', !getSetting('hardwareAcceleration', true))}
          aria-label="Toggle hardware acceleration"
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>JavaScript</label>
          <span className="settings-row__desc">Enable JavaScript on all pages</span>
        </div>
        <button
          className={`toggle ${getSetting('javascriptEnabled', true) ? 'active' : ''}`}
          onClick={() => updateSetting('javascriptEnabled', !getSetting('javascriptEnabled', true))}
          aria-label="Toggle JavaScript"
        />
      </div>
    </div>
  );
}
