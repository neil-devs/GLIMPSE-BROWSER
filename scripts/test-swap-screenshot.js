const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');

const logFile = path.join(app.getPath('temp'), 'test-swap-debug.log');
function log(msg) {
  try {
    fs.appendFileSync(logFile, String(msg) + '\n');
  } catch (e) {}
}

app.whenReady().then(async () => {
  try {
    log('app ready');
    const win = new BaseWindow({
      width: 1280,
      height: 800,
      show: true,
      backgroundColor: '#1b1e2b',
    });

    const CHROME_HEIGHT = 82;

    const chromeView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    chromeView.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
    win.contentView.addChildView(chromeView);
    await chromeView.webContents.loadURL(`data:text/html,<html><body style="margin:0;background:#0f1117;color:white;"><div style="height:82px;background:#13151f;">Chrome Bar</div></body></html>`);
    log('chromeView loaded');

    const searchView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    searchView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    win.contentView.addChildView(searchView);
    await searchView.webContents.loadURL(`data:text/html,<html><body style="background:white;"><h1>Google Search Results</h1></body></html>`);
    log('searchView loaded');

    // Pool view initialized as in preload-pool.js (index 1 behind searchView)
    const poolView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    poolView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    win.contentView.addChildView(poolView, 1);
    poolView.webContents.setBackgroundThrottling(false);
    log('poolView added at index 1');

    log('Loading URL in pool view...');
    await poolView.webContents.loadURL('https://www.w3schools.com/js/');
    log('Loaded URL: ' + poolView.webContents.getURL() + ' Title: ' + poolView.webContents.getTitle());

    log('Children before swap: ' + win.contentView.children.length);

    // Swap as in tab-manager.js
    win.contentView.removeChildView(searchView);
    searchView.setVisible(false);

    win.contentView.addChildView(poolView);
    poolView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    poolView.setVisible(true);
    poolView.webContents.setBackgroundThrottling(false);
    poolView.webContents.focus();
    poolView.webContents.invalidate();

    log('Children after swap: ' + win.contentView.children.length);
    win.contentView.children.forEach((c, i) => {
      log(`child[${i}]: isChrome=${c===chromeView}, isPool=${c===poolView}, bounds=${JSON.stringify(c.getBounds())}`);
    });

    await new Promise((r) => setTimeout(r, 1000));

    // Capture poolView webContents
    const poolImg = await poolView.webContents.capturePage();
    const poolBuf = poolImg.toBitmap();
    let poolNonZero = 0;
    for (let i = 0; i < poolBuf.length; i += 4) {
      if (poolBuf[i] !== 0 || poolBuf[i+1] !== 0 || poolBuf[i+2] !== 0) poolNonZero++;
    }
    log(`PoolView pixels: total=${poolBuf.length/4}, non-zero=${poolNonZero}`);

    // Capture chromeView webContents
    const chromeImg = await chromeView.webContents.capturePage();
    const chromeBuf = chromeImg.toBitmap();
    log(`ChromeView pixels: total=${chromeBuf.length/4}`);

    // Check window screenshot if possible
    log('Done test');
  } catch (err) {
    log('Error: ' + err.stack);
  } finally {
    app.quit();
  }
});
