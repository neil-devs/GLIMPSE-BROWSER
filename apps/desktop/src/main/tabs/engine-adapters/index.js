/**
 * @fileoverview Engine adapter router.
 * Matches a URL to the correct search engine adapter and provides
 * utilities for determining if a page is a search results page.
 * @module desktop/tabs/engine-adapters
 */

'use strict';

const google = require('./google');
const bing = require('./bing');
const duckduckgo = require('./duckduckgo');
const yahoo = require('./yahoo');
const baidu = require('./baidu');
const yandex = require('./yandex');

/** All registered engine adapters */
const adapters = [google, bing, duckduckgo, yahoo, baidu, yandex];

/**
 * Get the engine adapter that matches a given URL.
 * @param {string} url - The page URL to test
 * @returns {object|null} The matching adapter or null
 */
function getAdapter(url) {
  if (!url) return null;
  for (const adapter of adapters) {
    if (adapter.matches(url)) {
      return adapter;
    }
  }
  return null;
}

/**
 * Check if a URL is a search results page for any supported engine.
 * @param {string} url
 * @returns {boolean}
 */
function isSearchResultsPage(url) {
  return getAdapter(url) !== null;
}

/**
 * Get an adapter by engine name.
 * @param {string} name - Engine name (e.g., 'google', 'bing')
 * @returns {object|null}
 */
function getAdapterByName(name) {
  return adapters.find((a) => a.name === name) || null;
}

/**
 * Get all registered adapters.
 * @returns {object[]}
 */
function getAllAdapters() {
  return [...adapters];
}

module.exports = {
  getAdapter,
  isSearchResultsPage,
  getAdapterByName,
  getAllAdapters,
};
