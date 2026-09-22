import { useState, useEffect, useCallback } from 'react';

const DEFAULT_SETTINGS = {
  defaultEngine: 'google',
  prefetchEnabled: true,
  prefetchAggressiveness: 'balanced',
  theme: 'system',
  language: 'en',
  historyRetentionDays: 90,
  cacheSizeLimitMb: 500,
  blockAds: false,
  blockTrackers: false,
  hardwareAcceleration: true,
  javascriptEnabled: true,
  prefetchOnMeteredNetwork: false,
  doNotTrack: false,
  telemetryEnabled: false,
  homepage: '',
  startupBehavior: 'newTab',
};

export default function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    /* Load all settings on mount */
    window.glimpse.settings.getAll().then((result) => {
      if (result && result.success && result.data) {
        setSettings((prev) => ({ ...prev, ...result.data }));
      } else if (result && typeof result === 'object' && !result.success) {
        /* Result is direct data (not wrapped) */
      }
    }).catch(() => {});
  }, []);

  const getSetting = useCallback((key, defaultValue) => {
    return settings[key] !== undefined ? settings[key] : defaultValue;
  }, [settings]);

  const updateSetting = useCallback(async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await window.glimpse.settings.set(key, value);
    } catch (e) {
      console.error('Failed to save setting:', key, e);
    }
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await window.glimpse.settings.reset();
    } catch (e) {
      /* silently fail */
    }
  }, []);

  return { settings, getSetting, updateSetting, resetSettings };
}
