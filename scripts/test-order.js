const fs = require('fs');
const path = require('path');
const logFile = 'C:\\Users\\HP\\AppData\\Local\\Temp\\test-order-debug.log';

function log(msg) {
  try {
    fs.appendFileSync(logFile, String(msg) + '\n');
  } catch (e) {}
}

log('Script started');

try {
  const electron = require('electron');
  log('Electron required, keys: ' + Object.keys(electron).join(','));
  const { app, BaseWindow, WebContentsView } = electron;
  
  if (!app) {
    log('app is undefined!');
    process.exit(1);
  }

  app.whenReady().then(() => {
    log('app ready');
    try {
      const win = new BaseWindow({ show: false });
      const v1 = new WebContentsView();
      const v2 = new WebContentsView();
      const v3 = new WebContentsView();
      win.contentView.addChildView(v1);
      win.contentView.addChildView(v2);
      win.contentView.addChildView(v3);

      const before = [
        win.contentView.children.indexOf(v1),
        win.contentView.children.indexOf(v2),
        win.contentView.children.indexOf(v3)
      ];

      log('Before: ' + before.join(', '));
      win.contentView.addChildView(v2);

      const after = [
        win.contentView.children.indexOf(v1),
        win.contentView.children.indexOf(v2),
        win.contentView.children.indexOf(v3)
      ];
      log('After: ' + after.join(', '));
      app.quit();
    } catch (e) {
      log('Inner error: ' + e.stack);
      app.quit();
    }
  }).catch(e => {
    log('whenReady error: ' + e.stack);
  });
} catch (e) {
  log('Outer error: ' + e.stack);
}
