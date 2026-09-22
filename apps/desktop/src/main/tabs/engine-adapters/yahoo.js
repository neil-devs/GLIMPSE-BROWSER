/**
 * @fileoverview Yahoo search engine adapter.
 * @module desktop/tabs/engine-adapters/yahoo
 */

'use strict';

module.exports = Object.freeze({
  name: 'yahoo',
  displayName: 'Yahoo',
  searchUrl: 'https://search.yahoo.com/search?p=',

  matches(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('search.yahoo.com') && parsed.pathname.startsWith('/search');
    } catch {
      return false;
    }
  },

  resultLinkSelector: '#web .algo h3 a, #web .compTitle a, #web .title a',

  getSearchQuery(url) {
    try {
      return new URL(url).searchParams.get('p');
    } catch {
      return null;
    }
  },
});
