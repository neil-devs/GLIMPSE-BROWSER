/**
 * @fileoverview Baidu search engine adapter.
 * @module desktop/tabs/engine-adapters/baidu
 */

'use strict';

module.exports = Object.freeze({
  name: 'baidu',
  displayName: 'Baidu',
  searchUrl: 'https://www.baidu.com/s?wd=',

  matches(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('baidu.com') && parsed.pathname === '/s';
    } catch {
      return false;
    }
  },

  resultLinkSelector: '#content_left .result h3 a, .c-title a, .c-container .t a',

  getSearchQuery(url) {
    try {
      return new URL(url).searchParams.get('wd');
    } catch {
      return null;
    }
  },
});
