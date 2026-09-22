import React, { useEffect } from 'react';
import useSettings from '../../hooks/useSettings';
import usePrefetchStatus from '../../hooks/usePrefetchStatus';

const LEVELS = [
  { value: 'conservative', label: 'Conservative', desc: 'Prefetch fewer pages, less bandwidth' },
  { value: 'balanced', label: 'Balanced', desc: 'Recommended for most connections' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Prefetch more pages, faster browsing' },
];

export default function PrefetchSettings() {
  const { getSetting, updateSetting } = useSettings();
  const { cacheStatus, recentLog, clearCache, setAggressiveness, refreshStatus, refreshLog } = usePrefetchStatus();

  const prefetchEnabled = getSetting('prefetchEnabled', true);
  const aggressiveness = getSetting('prefetchAggressiveness', 'balanced');
  const onMetered = getSetting('prefetchOnMeteredNetwork', false);
  const cacheLimit = getSetting('cacheSizeLimitMb', 500);

  useEffect(() => {
    refreshStatus();
    refreshLog();
  }, [refreshStatus, refreshLog]);

  const handleAggressivenessChange = async (level) => {
    updateSetting('prefetchAggressiveness', level);
    await setAggressiveness(level);
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section__title">Prefetch Engine</h3>

      <div className="settings-row settings-row--prominent">
        <div className="settings-row__info">
          <label>Enable Prefetching</label>
          <span className="settings-row__desc">Pre-load search results for instant page loads</span>
        </div>
        <button
          className={`toggle ${prefetchEnabled ? 'active' : ''}`}
          onClick={() => updateSetting('prefetchEnabled', !prefetchEnabled)}
          aria-label="Toggle prefetching"
        />
      </div>

      {prefetchEnabled && (
        <>
          <div className="settings-row">
            <div className="settings-row__info">
              <label>Aggressiveness</label>
            </div>
            <div className="prefetch-levels">
              {LEVELS.map((level) => (
                <button
                  key={level.value}
                  className={`prefetch-level ${aggressiveness === level.value ? 'active' : ''}`}
                  onClick={() => handleAggressivenessChange(level.value)}
                >
                  <strong>{level.label}</strong>
                  <span>{level.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row__info">
              <label>Prefetch on Metered Networks</label>
              <span className="settings-row__desc">Allow prefetching on cellular/metered connections</span>
            </div>
            <button
              className={`toggle ${onMetered ? 'active' : ''}`}
              onClick={() => updateSetting('prefetchOnMeteredNetwork', !onMetered)}
            />
          </div>

          <div className="settings-row">
            <div className="settings-row__info">
              <label>Cache Size Limit</label>
              <span className="settings-row__desc">{cacheLimit} MB</span>
            </div>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={cacheLimit}
              onChange={(e) => updateSetting('cacheSizeLimitMb', parseInt(e.target.value))}
              className="settings-row__slider"
            />
          </div>

          <div className="prefetch-status">
            <div className="prefetch-status__stat">
              <span className="prefetch-status__number">{cacheStatus.count || 0}</span>
              <span className="prefetch-status__label">Pages Cached</span>
            </div>
            <div className="prefetch-status__stat">
              <span className="prefetch-status__number">{cacheStatus.totalSizeMb || '0.00'} MB</span>
              <span className="prefetch-status__label">Cache Used</span>
            </div>
            <button className="btn btn-secondary" onClick={clearCache}>Clear Cache</button>
          </div>

          {recentLog.length > 0 && (
            <div className="prefetch-log">
              <h4>Recent Activity</h4>
              <div className="prefetch-log__list">
                {recentLog.slice(0, 20).map((entry, i) => (
                  <div key={i} className="prefetch-log__item">
                    <span className="prefetch-log__status">
                      {entry.status === 'success' ? '✅' : entry.status === 'failed' ? '❌' : '⏳'}
                    </span>
                    <span className="prefetch-log__url truncate">{entry.url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
