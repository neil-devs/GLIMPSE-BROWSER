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

  /** CSS selector that targets organic search result links */
  resultLinkSelector:
    '#search .g a[href^="http"]:not([href*="google."]):not([role="button"]), ' +
    '#rso .g a[href^="http"]:not([href*="google."]):not([role="button"])',

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
});
