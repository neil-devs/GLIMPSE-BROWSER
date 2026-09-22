/**
 * @fileoverview Yandex search engine adapter.
 * @module desktop/tabs/engine-adapters/yandex
 */

'use strict';

module.exports = Object.freeze({
  name: 'yandex',
  displayName: 'Yandex',
  searchUrl: 'https://yandex.com/search/?text=',

  matches(url) {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.includes('yandex.') &&
        parsed.pathname.startsWith('/search')
      );
    } catch {
      return false;
    }
  },

  resultLinkSelector: '.OrganicTitle-Link, .organic__url, .Organic .Path a',

  getSearchQuery(url) {
    try {
      return new URL(url).searchParams.get('text');
    } catch {
      return null;
    }
  },
});
