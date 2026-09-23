/**
 * @fileoverview Glimpse Browser — Electron main process entry point.
 * Initializes the app, database, IPC handlers, and creates the browser window.
 * @module desktop/main
 */

'use strict';

const path = require('node:path');
if (!require('electron').app.isPackaged) {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
  } catch (e) {}
}

const { app } = require('electron');
const { logger } = require('./utils/logger');
const { setupErrorHandlers } = require('./utils/error-handler');
const { initAutoUpdater } = require('./utils/auto-updater');
const { initDatabase } = require('./storage/db');
const { registerAllHandlers } = require('./ipc/handlers');
const windowManager = require('./windows/window-manager');
const tabManager = require('./tabs/tab-manager');
const tabState = require('./tabs/tab-state');
const prefetchScheduler = require('./prefetch/prefetch-scheduler');
const cacheManager = require('./prefetch/cache-manager');
const modelLoader = require('./ml/model-loader');

/* ── Error Handlers ─────────────────────────────────────────────── */

setupErrorHandlers();

/* ── Windows Taskbar ID ─────────────────────────────────────────── */

if (process.platform === 'win32') {
  app.setAppUserModelId('com.glimpse.browser');
}

/* ── Hardware Acceleration ──────────────────────────────────────── */

/* We check the setting after DB init; for now, keep it enabled */

/* ── App Ready ──────────────────────────────────────────────────── */

app.whenReady().then(async () => {
  logger.info('══════════════════════════════════════════');
  logger.info('  Glimpse Browser — Starting');
  logger.info(`  Version: ${app.getVersion()}`);
  logger.info(`  Platform: ${process.platform}`);
  logger.info(`  Node: ${process.version}`);
  logger.info('══════════════════════════════════════════');

  /* 1. Initialize the database */
  try {
    initDatabase();
    logger.info('Database initialized');
  } catch (err) {
    logger.error('Failed to initialize database', { message: err.message });
    app.quit();
    return;
  }

  /* 2. Initialize the prefetch cache manager */
  cacheManager.init();

  /* 3. Initialize the ML model loader */
  modelLoader.init();
  modelLoader.refreshModel().catch((err) => {
    logger.debug('ML model refresh skipped', { message: err.message });
  });

  /* 4. Register all IPC handlers */
  registerAllHandlers({
    tabManager,
    cacheManager,
    windowManager,
  });

  /* 5. Create the main browser window */
  const isDev = !app.isPackaged;
  const rendererUrl = process.env.ELECTRON_RENDERER_URL || (isDev ? 'http://localhost:5173' : null);
  const { window: mainWin, chromeView } = windowManager.createWindow({
    rendererUrl,
  });

  /* 6. Wire up the chrome WebContents to tab state and prefetch scheduler */
  const chromeWc = chromeView.webContents;
  tabState.setChromeWebContents(chromeWc);
  prefetchScheduler.setChromeWebContents(chromeWc);

  /* 7. Initialize the tab manager with the main window */
  tabManager.init(mainWin, chromeView);

  /* 8. Handle window resize — update tab views */
  mainWin.on('resize', () => {
    tabManager.onWindowResize();
  });

  /* 9. Create the initial tab */
  tabManager.createTab('about:blank');

  /* 10. Initialize auto updater */
  initAutoUpdater(chromeWc);

  logger.info('Glimpse Browser started successfully');
});

/* ── Window Lifecycle ───────────────────────────────────────────── */

app.on('window-all-closed', () => {
  /* Quit on all platforms except macOS */
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  /* macOS: re-create window when dock icon is clicked */
  if (windowManager.getWindowCount() === 0) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || null;
    windowManager.createWindow({ rendererUrl });
  }
});

/* ── Graceful Shutdown ──────────────────────────────────────────── */

app.on('before-quit', () => {
  logger.info('Glimpse Browser shutting down');
});
