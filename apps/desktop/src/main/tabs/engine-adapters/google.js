/**
 * @fileoverview Google search engine adapter.
 * @module desktop/tabs/engine-adapters/google
 */

'use strict';

module.exports = Object.freeze({
  name: 'google',
  displayName: 'Google',
  searchUrl: 'https://www.google.com/search?q=',

  /**
   * Test whether a URL is a Google search results page.
   * @param {string} url
   * @returns {boolean}
   */
  matches(url) {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.includes('google.') &&
        parsed.pathname === '/search' &&
        parsed.searchParams.has('q')
      );
    } catch {
      return false;
    }
  },

  /** CSS selector that targets organic search result links.
   *  Google wraps result links as google.com/url?... redirects,
   *  so we CANNOT exclude [href*="google."] — the getRealUrl()
   *  function in visibility-detector handles extracting the real URL.
   *  We only exclude obvious non-result links (buttons, nav, footer).
   */
  resultLinkSelector:
    '#rso a[href]:not([role="button"]):not([href="#"]):not([href^="javascript"]), ' +
    '#search a[href]:not([role="button"]):not([href="#"]):not([href^="javascript"]), ' +
    'div[data-sokoban] a[href]:not([role="button"])',

  /**
   * Extract the search query from a Google results URL.
   * @param {string} url
   * @returns {string|null}
   */
  getSearchQuery(url) {
    try {
      return new URL(url).searchParams.get('q');
    } catch {
      return null;
    }
  },

  /**
   * Resolve the real destination URL from a Google redirect link.
   * @param {string} href
   * @returns {string}
   */
  resolveDestination(href) {
    try {
      const parsed = new URL(href);
      if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
        const real = parsed.searchParams.get('q') || parsed.searchParams.get('url');
        if (real && real.startsWith('http')) return real;
      }
      /* /goto URLs use encrypted payloads — can't decode, return as-is.
       * The pool WebContentsView will follow the redirect automatically. */
    } catch { /* fall through */ }
    return href;
  },
});
