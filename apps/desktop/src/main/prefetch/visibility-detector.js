/**
 * @fileoverview Visibility detector script builder.
 * Generates a JavaScript string that gets injected into search result pages
 * via webContents.executeJavaScript(). This script runs INSIDE the webpage
 * (browser context) — it cannot use Node.js APIs.
 *
 * Uses IntersectionObserver to detect which result links are visible
 * in the viewport, and sends events to the main process via the
 * __glimpseIPC bridge exposed by tab-preload.js.
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
  return `
(function() {
  'use strict';

  /* Prevent double injection */
  if (window.__glimpseInjected) return;
  window.__glimpseInjected = true;

  var SELECTOR = ${JSON.stringify(resultLinkSelector)};
  var OBSERVED = new Set();
  var VISIBLE_URLS = new Map();

  /**
   * Extract the real destination URL from a search result link.
   * Search engines often wrap links in redirect URLs.
   */
  function getRealUrl(anchor) {
    var dataHref = anchor.getAttribute('data-href');
    if (dataHref && dataHref.startsWith('http')) return dataHref;

    var href = anchor.href;
    if (!href || !href.startsWith('http')) return null;

    try {
      var parsed = new URL(href);
      /* Google redirect: /url?q=<real_url> */
      if (parsed.pathname === '/url' && parsed.searchParams.has('q')) {
        return parsed.searchParams.get('q');
      }
      /* Bing redirect: check for 'u' param */
      if (parsed.searchParams.has('u')) {
        var u = parsed.searchParams.get('u');
        if (u.startsWith('http')) return u;
      }
      return href;
    } catch(e) {
      return href;
    }
  }

  /**
   * Extract the domain from a URL string.
   */
  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\\\\./, '');
    } catch(e) {
      return 'unknown';
    }
  }

  /**
   * Get the 1-indexed position of a link among all result links.
   */
  function getPosition(link) {
    var links = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < links.length; i++) {
      if (links[i] === link || links[i].contains(link) || link.contains(links[i])) return i + 1;
    }
    return 0;
  }

  /**
   * Send a message to Electron main process via the preload bridge.
   */
  function sendToMain(type, data) {
    if (typeof window.__glimpseIPC === 'function') {
      window.__glimpseIPC(type, data);
    }
  }

  /* ── IntersectionObserver ──────────────────────────────────── */

  var observer = new IntersectionObserver(
    function(entries) {
      entries.forEach(function(entry) {
        var anchor = entry.target.closest('a') || entry.target;
        var url = getRealUrl(anchor);
        if (!url || !url.startsWith('http')) return;

        var domain = getDomain(url);
        var position = getPosition(anchor);

        if (entry.isIntersecting) {
          if (!VISIBLE_URLS.has(url)) {
            VISIBLE_URLS.set(url, { position: position, domain: domain });
            sendToMain('link-visible', { url: url, position: position, domain: domain });
          }
        } else {
          if (VISIBLE_URLS.has(url)) {
            VISIBLE_URLS.delete(url);
            sendToMain('link-hidden', { url: url });
          }
        }
      });
    },
    {
      threshold: 0.1,
      root: null,
    }
  );

  /* ── Observe all result links ──────────────────────────────── */

  function observeLinks() {
    var links = document.querySelectorAll(SELECTOR);
    var newCount = 0;
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (OBSERVED.has(link)) continue;
      OBSERVED.add(link);
      observer.observe(link);
      newCount++;
    }
    if (newCount > 0) {
      console.log('[Glimpse] Observing ' + links.length + ' result links');
    }
  }

  /* Initial observation */
  observeLinks();

  /* Re-observe when DOM changes (lazy-loaded results, infinite scroll) */
  var mutationObserver = new MutationObserver(function() {
    observeLinks();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  /* ── Click tracking ────────────────────────────────────────── */

  document.addEventListener('click', function(event) {
    var anchor = event.target.closest('a');
    if (!anchor) return;

    var url = getRealUrl(anchor);
    if (!url) return;

    var info = VISIBLE_URLS.get(url);
    var position = info ? info.position : -1;

    /* Check if the page was served from prefetch cache via Resource Timing API */
    var fromCache = false;
    try {
      var entries = performance.getEntriesByName(url, 'resource');
      if (entries.length > 0) {
        var entry = entries[entries.length - 1];
        fromCache = entry.transferSize === 0;
      }
    } catch(e) {
      /* Resource Timing may not be available */
    }

    sendToMain('link-clicked', { url: url, position: position, fromCache: fromCache });
  }, true);

  /* ── Cleanup on navigation ─────────────────────────────────── */

  window.addEventListener('beforeunload', function() {
    observer.disconnect();
    mutationObserver.disconnect();
    OBSERVED.clear();
    VISIBLE_URLS.clear();
    window.__glimpseInjected = false;
  });

  console.log('[Glimpse] Visibility detector injected');
})();
`;
}

module.exports = { buildVisibilityDetectorScript };
