/**
 * @fileoverview Bing search engine adapter.
 * @module desktop/tabs/engine-adapters/bing
 */

'use strict';

module.exports = Object.freeze({
  name: 'bing',
  displayName: 'Bing',
  searchUrl: 'https://www.bing.com/search?q=',

  matches(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('bing.com') && parsed.pathname === '/search';
    } catch {
      return false;
    }
  },

  resultLinkSelector: '#b_results .b_algo h2 a, #b_results .b_algo .b_title a',

  getSearchQuery(url) {
    try {
      return new URL(url).searchParams.get('q');
    } catch {
      return null;
    }
  },
});
