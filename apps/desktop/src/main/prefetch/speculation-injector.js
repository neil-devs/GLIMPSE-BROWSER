/**
 * @fileoverview Speculation Rules API injector.
 * Injects Chromium's native Speculation Rules into web pages to enable
 * prefetching and prerendering of URLs in the background.
 *
 * Uses webContents.executeJavaScript() to manipulate the page's DOM.
 *
 * @see https://developer.chrome.com/blog/speculation-rules-improvements
 * @module desktop/prefetch/speculation-injector
 */

'use strict';

const { logger } = require('../utils/logger');

/** ID used on the injected script element for easy removal */
const SCRIPT_ID = 'glimpse-speculation-rules';

/**
 * Inject Speculation Rules into a page to prefetch/prerender URLs.
 *
 * @param {Electron.WebContents} webContents - The tab's webContents
 * @param {string[]} urls - Array of URLs to prefetch/prerender
 * @param {'prefetch'|'prerender'} [mode='prefetch'] - Speculation mode
 * @returns {Promise<boolean>} true if injection succeeded
 */
async function injectSpeculationRules(webContents, urls, mode = 'prefetch') {
  if (!webContents || webContents.isDestroyed() || !urls || urls.length === 0) {
    return false;
  }

  /* Filter out invalid URLs */
  const validUrls = urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });

  if (validUrls.length === 0) return false;

  const rulesJson = JSON.stringify({
    [mode]: [
      {
        urls: validUrls,
        eagerness: 'immediate',
      },
    ],
  });

  const script = `
    (function() {
      try {
        /* Remove any existing rules */
        const existing = document.getElementById(${JSON.stringify(SCRIPT_ID)});
        if (existing) existing.remove();

        /* Create new speculation rules script */
        const script = document.createElement('script');
        script.type = 'speculationrules';
        script.id = ${JSON.stringify(SCRIPT_ID)};
        script.textContent = ${JSON.stringify(rulesJson)};
        document.head.appendChild(script);
        return true;
      } catch (e) {
        return false;
      }
    })();
  `;

  try {
    const result = await webContents.executeJavaScript(script);
    if (result) {
      logger.debug('Speculation rules injected', {
        mode,
        urlCount: validUrls.length,
      });
    }
    return result;
  } catch (err) {
    logger.error('Failed to inject speculation rules', { message: err.message });
    return false;
  }
}

/**
 * Remove all Glimpse speculation rules from a page.
 *
 * @param {Electron.WebContents} webContents
 * @returns {Promise<boolean>}
 */
async function removeSpeculationRules(webContents) {
  if (!webContents || webContents.isDestroyed()) return false;

  const script = `
    (function() {
      const el = document.getElementById(${JSON.stringify(SCRIPT_ID)});
      if (el) { el.remove(); return true; }
      return false;
    })();
  `;

  try {
    return await webContents.executeJavaScript(script);
  } catch {
    return false;
  }
}

/**
 * Replace existing speculation rules with a new set of URLs.
 * This is an atomic remove-then-inject operation.
 *
 * @param {Electron.WebContents} webContents
 * @param {string[]} urls - New URL set
 * @param {'prefetch'|'prerender'} [mode='prefetch']
 * @returns {Promise<boolean>}
 */
async function updateSpeculationRules(webContents, urls, mode = 'prefetch') {
  return injectSpeculationRules(webContents, urls, mode);
}

/**
 * Get the list of URLs currently in the speculation rules.
 *
 * @param {Electron.WebContents} webContents
 * @returns {Promise<string[]>} Array of URLs in the current rules
 */
async function getSpeculationStatus(webContents) {
  if (!webContents || webContents.isDestroyed()) return [];

  const script = `
    (function() {
      const el = document.getElementById(${JSON.stringify(SCRIPT_ID)});
      if (!el) return [];
      try {
        const rules = JSON.parse(el.textContent);
        const urls = [];
        for (const mode of ['prefetch', 'prerender']) {
          if (rules[mode]) {
            for (const rule of rules[mode]) {
              if (rule.urls) urls.push(...rule.urls);
            }
          }
        }
        return urls;
      } catch { return []; }
    })();
  `;

  try {
    return await webContents.executeJavaScript(script);
  } catch {
    return [];
  }
}

module.exports = {
  injectSpeculationRules,
  removeSpeculationRules,
  updateSpeculationRules,
  getSpeculationStatus,
};
