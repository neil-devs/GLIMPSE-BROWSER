# Glimpse Browser — Prefetch Engine

## Overview

The prefetch engine is Glimpse's core differentiator. It detects which search result links are visible on screen, predicts which one the user is most likely to click, and silently prerenders those pages in the background using Chromium's Speculation Rules API. When the user clicks, the page loads instantly.

## How It Works

### 1. Visibility Detection (`visibility-detector.js`)

When a search results page loads, the preload script injects an `IntersectionObserver` that watches all result link elements on the page.

```javascript
// Simplified — the actual implementation is in the preload script
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      // Link is now visible in the viewport
      ipcRenderer.send('prefetch:linkDetected', {
        url: entry.target.href,
        position: getPosition(entry.target),
        domain: new URL(entry.target.href).hostname,
      });
    }
  }
}, {
  threshold: 0.5, // At least 50% of the link must be visible
});
```

**Key design decisions:**
- Uses `threshold: 0.5` — a link must be at least 50% visible to trigger
- The observer adapts to ANY screen resolution or window size automatically
- No hardcoded pixel values or link counts
- As the user scrolls, newly visible links are detected and queued

### 2. Engine Adapters (`engine-adapters/`)

Each supported search engine has an adapter that knows the CSS selector for that engine's result links:

| Engine      | CSS Selector                            |
|-------------|----------------------------------------|
| Google      | `div.g a[href]:not([href*="google"])`   |
| Bing        | `li.b_algo h2 a`                        |
| DuckDuckGo  | `article[data-testid="result"] a`       |
| Yahoo       | `div.algo a.ac-algo`                    |
| Baidu       | `div.result h3 a`                       |
| Yandex      | `li.serp-item a.link`                   |

The adapter is selected automatically based on the current URL hostname.

### 3. Click Prediction (`ml/click-predictor.js`)

When bandwidth or memory is constrained, the ML model ranks visible links by predicted click probability. This determines prefetch priority.

Features used:
- **Link position** (top links get higher scores)
- **Domain reputation** (wikipedia.org → 1.0, unknown → 0.5)
- **Search engine** (one-hot encoded)
- **Query length** (short/medium/long buckets)
- **Prefetch status** (already prefetched or not)

The model runs entirely on-device as a tiny decision tree ensemble evaluator — no ML libraries needed at runtime.

### 4. Speculation Rules Injection (`speculation-injector.js`)

Once target URLs are selected, the engine injects Chromium's Speculation Rules API into the page:

```javascript
// Injected into the webContents via executeJavaScript
const speculationRules = {
  prerender: [{
    urls: ["https://example.com/page1", "https://example.com/page2"],
    eagerness: "moderate"
  }]
};

const script = document.createElement('script');
script.type = 'speculationrules';
script.textContent = JSON.stringify(speculationRules);
document.head.appendChild(script);
```

This tells Chromium to prerender these pages in hidden tabs, so they're ready to swap in instantly on navigation.

### 5. Prefetch Scheduler (`prefetch-scheduler.js`)

The scheduler coordinates the overall flow:

```
Visible links detected
       ↓
Filter out already-prefetched URLs
       ↓
ML model ranks remaining links by click probability
       ↓
Bandwidth guard checks available bandwidth
       ↓
Take top N links (based on aggressiveness level)
       ↓
Inject speculation rules
       ↓
Track prefetch status and performance
```

### 6. Bandwidth Guard (`bandwidth-guard.js`)

Prevents prefetching from degrading the user's browsing experience:

- Estimates available bandwidth using the Network Information API
- Checks `navigator.connection.effectiveType` and `downlink`
- Respects the `prefetchOnMeteredNetwork` setting
- Reduces concurrent prefetches on slow connections

### 7. Cache Manager (`cache-manager.js`)

Manages the prefetch cache:

- Tracks which URLs are currently prerendered
- Enforces the `cacheSizeLimitMb` setting
- Evicts least-recently-used entries when the cache is full
- Logs cache hits/misses to `prefetch_cache_log` for analytics

## Aggressiveness Levels

| Level        | Max Concurrent | Min Visibility | Bandwidth Threshold | Max Cache |
|-------------|---------------|---------------|-------------------|-----------|
| Conservative | 2             | 1500ms        | 5 Mbps            | 200 MB    |
| Balanced     | 4             | 800ms         | 2 Mbps            | 500 MB    |
| Aggressive   | 6             | 300ms         | 0.5 Mbps          | 1000 MB   |

- **Min Visibility**: How long a link must be visible before triggering prefetch
- **Bandwidth Threshold**: Minimum available bandwidth to start prefetching
- **Max Concurrent**: Maximum simultaneous prerender operations

## Telemetry & Metrics

Every prefetch operation is tracked:

```
Event Type              → Storage Location
────────────────────────────────────────────
Link detected as visible → result_link_events.was_visible_on_load
Prefetch triggered       → result_link_events.prefetch_started_at
Prefetch completed       → result_link_events.prefetch_completed_at
Prefetch duration        → result_link_events.prefetch_duration_ms
Link clicked             → result_link_events.was_clicked
Cache hit                → result_link_events.cache_hit
Page load time           → result_link_events.page_load_time_ms
Bytes transferred        → prefetch_performance_log.bytes_transferred
Failure reason           → prefetch_performance_log.failure_reason
```

This data is used to:
1. Show the user real-time prefetch status in the UI (PrefetchIndicator)
2. Retrain the ML model with real-world click patterns
3. Compare prefetched vs non-prefetched page load times (A/B metrics)

## Error Handling

- If a prefetch fails (network error, 404, timeout), it's logged and skipped
- The user's browsing experience is never interrupted by a prefetch failure
- Failed prefetches do not retry automatically (to avoid wasting bandwidth)
- All errors are logged to both local SQLite and (if online) cloud telemetry
