/**
 * @fileoverview Tab preload script.
 * Much more restricted than the chrome preload — only exposes
 * a minimal bridge for the visibility detector to report link events
 * back to the main process.
 *
 * This runs in individual tab WebContentsViews.
 *
 * @module desktop/preload/tab-preload
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Minimal API exposed to web pages in tabs.
 * The visibility detector script (injected via executeJavaScript)
 * dispatches CustomEvents on window. This preload listens for those
 * events and forwards them to the main process via ipcRenderer.send().
 */

/* Listen for custom events dispatched by the injected visibility detector */
window.addEventListener('glimpse:link-visible', (event) => {
  const { url, position, domain } = event.detail || {};
  if (url) {
    ipcRenderer.send('tab:link-visible', { url, position, domain });
  }
});

window.addEventListener('glimpse:link-hidden', (event) => {
  const { url } = event.detail || {};
  if (url) {
    ipcRenderer.send('tab:link-hidden', { url });
  }
});

window.addEventListener('glimpse:link-clicked', (event) => {
  const { url, position, fromCache } = event.detail || {};
  if (url) {
    ipcRenderer.send('tab:link-clicked', { url, position, fromCache });
  }
});

/* Expose a minimal __glimpse_tab API for direct calls from injected scripts */
contextBridge.exposeInMainWorld('__glimpse_tab', {
  reportVisible: (url, position, domain) => {
    ipcRenderer.send('tab:link-visible', { url, position, domain });
  },
  reportHidden: (url) => {
    ipcRenderer.send('tab:link-hidden', { url });
  },
  reportClicked: (url, fromCache) => {
    ipcRenderer.send('tab:link-clicked', { url, fromCache });
  },
});
