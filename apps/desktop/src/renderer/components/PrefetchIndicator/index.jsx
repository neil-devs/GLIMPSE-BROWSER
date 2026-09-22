import React from 'react';
import usePrefetchStore from '../../store/prefetch-store';
import './PrefetchIndicator.css';

export default function PrefetchIndicator() {
  const prefetchedCount = usePrefetchStore((s) => s.prefetchedUrls.size);
  const isActive = usePrefetchStore((s) => s.isActive);

  if (!isActive && prefetchedCount === 0) return null;

  return (
    <div className="prefetch-indicator" title={`${prefetchedCount} page(s) prefetched and ready`}>
      <span className={`prefetch-indicator__dot ${isActive ? 'active' : ''}`} />
      <span className="prefetch-indicator__count">{prefetchedCount}</span>
      <span className="prefetch-indicator__label">prefetched</span>
    </div>
  );
}
