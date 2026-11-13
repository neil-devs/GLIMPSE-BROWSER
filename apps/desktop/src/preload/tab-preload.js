/**
 * @fileoverview Tab preload script.
 * Exposes a minimal IPC bridge for the visibility detector (injected via
 * executeJavaScript into the main world) to communicate back to the main process.
 *
 * This runs in individual tab WebContentsViews with sandbox:true.
 *
 * @module desktop/preload/tab-preload
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose an IPC bridge to the main world so that scripts injected via
 * executeJavaScript() can send messages to the Electron main process.
 *
 * The visibility detector calls window.__glimpseIPC(type, data) which
 * forwards to ipcRenderer.send('prefetch:<type>', data).
 */
contextBridge.exposeInMainWorld('__glimpseIPC', (type, data) => {
  ipcRenderer.send('prefetch:' + type, data);
});
