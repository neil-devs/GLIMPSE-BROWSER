/**
 * @fileoverview DuckDuckGo search engine adapter.
 * @module desktop/tabs/engine-adapters/duckduckgo
 */

'use strict';

module.exports = Object.freeze({
  name: 'duckduckgo',
  displayName: 'DuckDuckGo',
  searchUrl: 'https://duckduckgo.com/?q=',

  matches(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('duckduckgo.com') && parsed.searchParams.has('q');
    } catch {
      return false;
    }
  },

  resultLinkSelector:
    '[data-testid="result-title-a"], .result__a, article[data-testid="result"] a[href^="http"]',

  getSearchQuery(url) {
    try {
      return new URL(url).searchParams.get('q');
    } catch {
      return null;
    }
  },
});
