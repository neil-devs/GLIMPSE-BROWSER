const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');

const logFile = path.join(app.getPath('temp'), 'test-window-capture.log');
function log(msg) {
  try {
    fs.appendFileSync(logFile, String(msg) + '\n');
  } catch (e) {}
}

app.whenReady().then(async () => {
  try {
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

    const searchView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    searchView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    win.contentView.addChildView(searchView);
    await searchView.webContents.loadURL(`data:text/html,<html><body style="background:white;"><h1>Google Search Results</h1></body></html>`);

    // Pool view initialized as in preload-pool.js (index 1 behind searchView)
    const poolView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    poolView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    win.contentView.addChildView(poolView, 1);
    poolView.webContents.setBackgroundThrottling(false);

    await poolView.webContents.loadURL('https://www.w3schools.com/js/');

    // Swap as in tab-manager.js
    win.contentView.removeChildView(searchView);
    searchView.setVisible(false);

    win.contentView.addChildView(poolView);
    poolView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    poolView.setVisible(true);
    poolView.webContents.setBackgroundThrottling(false);
    poolView.webContents.focus();
    poolView.webContents.invalidate();

    await new Promise((r) => setTimeout(r, 1000));

    // Capture the entire WINDOW
    if (typeof win.capturePage === 'function') {
      const winImg = await win.capturePage();
      const winBuf = winImg.toBitmap();
      let winDark = 0;
      let winWhite = 0;
      for (let i = 0; i < winBuf.length; i += 4) {
        // #0f1117 is r=15, g=17, b=23 (BGRA: b=23, g=17, r=15)
        if (winBuf[i] === 23 && winBuf[i+1] === 17 && winBuf[i+2] === 15) winDark++;
        if (winBuf[i] > 200 && winBuf[i+1] > 200 && winBuf[i+2] > 200) winWhite++;
      }
      log(`Window capture: total=${winBuf.length/4}, dark(#0f1117)=${winDark}, white/light=${winWhite}`);
      const outPath = path.join(app.getPath('temp'), 'window-capture.png');
      fs.writeFileSync(outPath, winImg.toPNG());
      log('Window capture saved to: ' + outPath);
    } else {
      log('win.capturePage is not a function on BaseWindow');
    }
  } catch (err) {
    log('Error: ' + err.stack);
  } finally {
    app.quit();
  }
});
