import React from 'react';
import useSettings from '../../hooks/useSettings';

export default function PrivacySettings() {
  const { getSetting, updateSetting } = useSettings();

  return (
    <div className="settings-section">
      <h3 className="settings-section__title">Privacy & Security</h3>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>Block Ads</label>
          <span className="settings-row__desc">Block advertisements on web pages</span>
        </div>
        <button
          className={`toggle ${getSetting('blockAds', false) ? 'active' : ''}`}
          onClick={() => updateSetting('blockAds', !getSetting('blockAds', false))}
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>Block Trackers</label>
          <span className="settings-row__desc">Prevent cross-site tracking scripts</span>
        </div>
        <button
          className={`toggle ${getSetting('blockTrackers', false) ? 'active' : ''}`}
          onClick={() => updateSetting('blockTrackers', !getSetting('blockTrackers', false))}
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>Send Do Not Track</label>
          <span className="settings-row__desc">Request websites not to track your browsing</span>
        </div>
        <button
          className={`toggle ${getSetting('doNotTrack', false) ? 'active' : ''}`}
          onClick={() => updateSetting('doNotTrack', !getSetting('doNotTrack', false))}
        />
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <label>Help Improve Glimpse</label>
          <span className="settings-row__desc">Send anonymous usage data to help us improve</span>
        </div>
        <button
          className={`toggle ${getSetting('telemetryEnabled', false) ? 'active' : ''}`}
          onClick={() => updateSetting('telemetryEnabled', !getSetting('telemetryEnabled', false))}
        />
      </div>
    </div>
  );
}
