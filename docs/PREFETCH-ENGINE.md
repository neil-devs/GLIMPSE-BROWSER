# Glimpse Browser — Prefetch Engine Architecture (v2.0)

## Overview

The prefetch engine is Glimpse's core differentiator. It detects which search result links are visible in the user's viewport, uses an on-device machine learning model to rank predicted click probabilities, and pre-renders high-probability pages into hidden `WebContentsView` pool slots. When the user clicks, the page appears with zero buffering and near-zero latency ($< 5$ ms).

---

## 1. End-to-End Prefetch Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. VISIBILITY DETECTION (visibility-detector.js)                       │
│    - IntersectionObserver detects organic result links in viewport     │
│    - Adapts dynamically to window dimensions & zoom levels             │
│    - >80ms cursor hover triggers Hover Boost (instant top-priority)    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. PRECONNECT ACCELERATION (numSockets: 3)                             │
│    - Immediately opens parallel TCP + TLS handshakes to visible origins│
├────────────────────────────────────────────────────────────────────────┤
│ 3. ML RANKING (click-predictor.js & @glimpse/shared/features)          │
│    - 39-feature vector scored by on-device flat-array GBDT             │
│    - Priority queue decides which links enter prefetch pool slots      │
├────────────────────────────────────────────────────────────────────────┤
│ 4. PRELOAD POOL (preload-pool.js)                                      │
│    - Dedicated WebContentsViews pre-rendered at exact window bounds    │
│    - Placed directly in window hierarchy behind active tab (index 1)   │
│    - Memory ceiling guard: evicts oldest entry if RAM > 1.5 GB         │
│    - TTL: 120-second automatic expiration                              │
├────────────────────────────────────────────────────────────────────────┤
│ 5. INSTANT SWAP (tab-manager.js)                                       │
│    - On link click: addChildView(poolView) brings view to top of stack │
│    - ZERO surface teardown — DirectComposition visual stays intact     │
│    - Unmutes audio, focuses WebContents, and runs without throttling   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Zero-Blackout Instant Swap Architecture

Earlier versions suffered from blacked-out screens or flickering when swapping views due to:
1. **Compositor Surface Teardown**: Calling `removeChildView(view)` destroys the underlying DirectComposition / RenderWidgetHost surface on Windows. Re-adding it requires Chromium to allocate a new swapchain, leaving an empty frame until the next paint.
2. **Viewport Culling**: Placing pool views at extreme off-screen coordinates (`y: -10000`) caused Chromium's compositor to cull tiles, skipping rasterization entirely.

### The Solution:
- **Exact-Size Composition**: Pooled `WebContentsViews` are created with the exact current window dimensions:
  `{ x: 0, y: CHROME_HEIGHT, width: winBounds.width, height: winBounds.height - CHROME_HEIGHT }`
- **Z-Index Layering**: The view is inserted into `contentView` at index 1 (behind the active tab). Because it is within the viewport, Chromium renders and rasters tiles with full GPU acceleration.
- **Topmost Reordering**: When the user clicks, calling `contentView.addChildView(poolView)` without removing it automatically reorders the view to become topmost in the visual tree without tearing down the native surface.

---

## 3. Prefetch Engine Flags & Tuning

| Flag | Default | Description |
|---|---|---|
| `preconnectAll` | `true` | Opens 3 parallel sockets (DNS + TCP + TLS) to all visible search result domains. |
| `hoverBoost` | `true` | If cursor lingers over an organic link for $> 80$ ms, preconnects and pools it with priority 0. |
| `stagedConcurrency` | `2` | Limits concurrently loading pool entries to avoid saturating consumer broadband connections. |
| `readyMode` | `'usable'` | Marks pool slots ready upon `dom-ready` rather than waiting for slow external ads/trackers. |
| `poolSize` | `6` | Maximum concurrent views in pool (3 for conservative, 6 for balanced, 12 for aggressive). |
| `throttleAfterReady` | `true` | Throttles background timers in pooled views once `ready` to reduce CPU usage to $< 8\%$. |

---

## 4. Live HUD Diagnostics (`Ctrl+Shift+P` / `Cmd+Shift+P`)

Developers and power users can press `Ctrl+Shift+P` (or `Cmd+Shift+P`) at any time to inspect live prefetch metrics:
- Active pool slots & ready count
- Estimated memory footprint
- Session Hit Rate (%)
- Real-time click-to-usable swap latency (ms)
