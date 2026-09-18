# Glimpse Browser — Search Engine Adapters

## Overview

Engine adapters are the bridge between the prefetch engine and each supported search engine's DOM structure. Each adapter knows how to identify result links on a specific search engine's results page.

## Supported Engines

| Engine     | URL Pattern                       | Adapter File       |
|-----------|-----------------------------------|--------------------|
| Google    | `google.com/search`               | `google.js`        |
| Bing      | `bing.com/search`                 | `bing.js`          |
| DuckDuckGo| `duckduckgo.com/`                 | `duckduckgo.js`    |
| Yahoo     | `search.yahoo.com/search`         | `yahoo.js`         |
| Baidu     | `baidu.com/s`                     | `baidu.js`         |
| Yandex    | `yandex.com/search`               | `yandex.js`        |

## Adapter Interface

Every adapter exports the same interface:

```javascript
module.exports = {
  /** Unique engine identifier */
  name: 'google',

  /**
   * Test whether a URL belongs to this engine's results page.
   * @param {string} url - The current page URL
   * @returns {boolean}
   */
  isResultsPage(url) { ... },

  /**
   * CSS selector that matches organic result links.
   * Used by the IntersectionObserver to watch for visibility.
   * @returns {string}
   */
  getResultSelector() { ... },

  /**
   * Extract the actual destination URL from a link element.
   * Some engines wrap URLs in redirects (Google's /url?q= pattern).
   * @param {HTMLAnchorElement} linkElement
   * @returns {string} Clean destination URL
   */
  extractUrl(linkElement) { ... },

  /**
   * Get the position of a link in the search results.
   * @param {HTMLAnchorElement} linkElement
   * @returns {number} 1-indexed position
   */
  getPosition(linkElement) { ... },

  /**
   * Extract the search query from the URL.
   * @param {string} url - Results page URL
   * @returns {string} Search query text
   */
  extractQuery(url) { ... },
};
```

## Engine-Specific Notes

### Google

Google wraps result URLs in a redirect (`/url?q=https://...`). The adapter extracts the real URL from the `q` parameter:

```javascript
extractUrl(link) {
  const href = link.href;
  if (href.includes('/url?')) {
    const params = new URLSearchParams(new URL(href).search);
    return params.get('q') || href;
  }
  return href;
}
```

**Selectors**: `div.g a[href]:not([href*="google"])` — matches organic result links while excluding Google's own navigation links, ads, and knowledge panel internal links.

### Bing

Bing's result structure is straightforward:

```javascript
getResultSelector() {
  return 'li.b_algo h2 a';
}
```

**Note**: Bing also uses `li.b_ans` for answer boxes — these are excluded to focus on organic results.

### DuckDuckGo

DuckDuckGo uses `data-testid` attributes which are more stable than class names:

```javascript
getResultSelector() {
  return 'article[data-testid="result"] a[data-testid="result-title-a"]';
}
```

### Yahoo

Yahoo wraps results in `.algo` containers:

```javascript
getResultSelector() {
  return 'div.algo a.ac-algo';
}
```

### Baidu

Baidu uses numeric IDs for results (`div#1`, `div#2`, etc.):

```javascript
getResultSelector() {
  return 'div.result h3 a, div.c-result h3 a';
}
```

### Yandex

Yandex uses `serp-item` list items:

```javascript
getResultSelector() {
  return 'li.serp-item a.link, li.serp-item a.OrganicTitle-Link';
}
```

## Adapter Selection

The adapter registry auto-selects the correct adapter based on the URL:

```javascript
function getAdapter(url) {
  for (const adapter of adapters) {
    if (adapter.isResultsPage(url)) {
      return adapter;
    }
  }
  return null; // Not a search results page
}
```

If no adapter matches, the prefetch engine stays dormant — it only activates on recognized search results pages.

## Adding a New Engine

1. Create `src/renderer/engines/{engine-name}.js`
2. Implement all 5 interface methods
3. Add the engine to `SEARCH_ENGINES` array in `packages/shared/src/constants.js`
4. Register the adapter in the adapter registry
5. Add the engine name to the `engine_adapters` feature engineering pipeline (one-hot encoding)

## Testing Adapters

Each adapter should be tested against:

1. **Live DOM snapshots** — Save HTML from real search results pages
2. **Selector stability** — Verify selectors match across locales and result types
3. **URL extraction** — Verify redirect unwrapping for Google, Yahoo, etc.
4. **Position accuracy** — Verify position extraction matches visual order
5. **Edge cases** — Ads, knowledge panels, "People also ask", video results, image carousels
