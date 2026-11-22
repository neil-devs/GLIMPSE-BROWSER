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

  resolveDestination(href) {
    try {
      const parsed = new URL(href);
      const u = parsed.searchParams.get('u');
      if (u) {
        const payload = u.startsWith('a1') ? u.slice(2) : u;
        if (payload.startsWith('http')) return payload;
        try {
          const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
          if (decoded.startsWith('http')) return decoded;
        } catch { /* not base64 */ }
      }
    } catch { /* fall through */ }
    return href;
  },
});
