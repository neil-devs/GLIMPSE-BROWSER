/**
 * @fileoverview Visibility detector script builder.
 * Generates a JavaScript string that gets injected into search result pages
 * via webContents.executeJavaScript(). This script runs INSIDE the webpage
 * (browser context) — it cannot use Node.js APIs.
 *
 * Uses IntersectionObserver to detect which result links are visible
 * in the viewport, and dispatches CustomEvents for the main process to handle.
 *
 * @module desktop/prefetch/visibility-detector
 */

'use strict';

/**
 * Build the visibility detector script to inject into a search results page.
 *
 * @param {string} resultLinkSelector - CSS selector for search result links
 * @returns {string} JavaScript source code string to execute in the page context
 */
function buildVisibilityDetectorScript(resultLinkSelector) {
  /* The entire function body is a template string that becomes the injected script.
     It must be self-contained — no closures over Node.js variables. */
  return `
(function() {
  'use strict';

  /* Prevent double injection */
  if (window.__glimpseVisibilityDetector) return;
  window.__glimpseVisibilityDetector = true;

  const SELECTOR = ${JSON.stringify(resultLinkSelector)};
  const OBSERVED = new Set();
  const VISIBLE_URLS = new Map();
  let positionCounter = 0;

  /**
   * Extract the real destination URL from a search result link.
   * Search engines often wrap links in redirect URLs — try to extract the actual target.
   */
  function getRealUrl(anchor) {
    /* Google wraps in /url?q= redirects or data-href attributes */
    const dataHref = anchor.getAttribute('data-href');
    if (dataHref && dataHref.startsWith('http')) return dataHref;

    const href = anchor.href;
    if (!href || !href.startsWith('http')) return null;

    try {
      const parsed = new URL(href);
      /* Google redirect: /url?q=<real_url> */
      if (parsed.pathname === '/url' && parsed.searchParams.has('q')) {
        return parsed.searchParams.get('q');
      }
      /* Bing redirect: check for 'u' param */
      if (parsed.searchParams.has('u')) {
        const u = parsed.searchParams.get('u');
        if (u.startsWith('http')) return u;
      }
      return href;
    } catch {
      return href;
    }
  }

  /**
   * Extract the domain from a URL string.
   */
  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\\./, '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Dispatch a custom event that the tab preload script can intercept.
   */
  function emitEvent(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /* ── IntersectionObserver ──────────────────────────────────── */

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const anchor = entry.target;
        const url = getRealUrl(anchor);
        if (!url) continue;

        const domain = getDomain(url);

        if (entry.isIntersecting) {
          if (!VISIBLE_URLS.has(url)) {
            positionCounter++;
            const position = positionCounter;
            VISIBLE_URLS.set(url, { position, domain });

            emitEvent('glimpse:link-visible', { url, position, domain });
          }
        } else {
          if (VISIBLE_URLS.has(url)) {
            VISIBLE_URLS.delete(url);
            emitEvent('glimpse:link-hidden', { url });
          }
        }
      }
    },
    {
      /* Link is "visible" when at least 10% of it enters the viewport */
      threshold: 0.1,
      /* Use the viewport as the root */
      root: null,
    }
  );

  /* ── Observe all result links ──────────────────────────────── */

  function observeLinks() {
    const links = document.querySelectorAll(SELECTOR);
    for (const link of links) {
      if (OBSERVED.has(link)) continue;
      OBSERVED.add(link);
      observer.observe(link);
    }
  }

  /* Initial observation */
  observeLinks();

  /* Re-observe when DOM changes (lazy-loaded results, infinite scroll) */
  const mutationObserver = new MutationObserver(() => {
    observeLinks();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  /* ── Click tracking ────────────────────────────────────────── */

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;

    const url = getRealUrl(anchor);
    if (!url) return;

    const info = VISIBLE_URLS.get(url);
    const position = info ? info.position : -1;

    /* Check if the page was served from prefetch cache via Resource Timing API */
    let fromCache = false;
    try {
      const entries = performance.getEntriesByName(url, 'resource');
      if (entries.length > 0) {
        const entry = entries[entries.length - 1];
        /* transferSize === 0 typically means served from cache */
        fromCache = entry.transferSize === 0;
      }
    } catch {
      /* Resource Timing may not be available */
    }

    emitEvent('glimpse:link-clicked', { url, position, fromCache });
  }, true);

  /* ── Cleanup on navigation ─────────────────────────────────── */

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    mutationObserver.disconnect();
    OBSERVED.clear();
    VISIBLE_URLS.clear();
    window.__glimpseVisibilityDetector = false;
  });
})();
`;
}

module.exports = { buildVisibilityDetectorScript };
