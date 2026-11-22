const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const win = new BaseWindow({
      width: 1280,
      height: 800,
      show: true,
      backgroundColor: '#1b1e2b',
    });

    const CHROME_HEIGHT = 82;

    // 1. Chrome view (full window size, with dark background #0f1117)
    const chromeView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    chromeView.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
    win.contentView.addChildView(chromeView);
    await chromeView.webContents.loadURL(`data:text/html,<html><body style="margin:0;background:#0f1117;color:white;font-family:sans-serif;"><div style="height:82px;background:#13151f;border-bottom:1px solid #333;">Chrome Bar</div></body></html>`);

    // 2. Initial Tab view (Google Search)
    const searchView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    searchView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    win.contentView.addChildView(searchView);
    await searchView.webContents.loadURL(`data:text/html,<html><body style="background:white;"><h1>Google Search Results</h1></body></html>`);

    // 3. Pool view
    const poolView = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    poolView.setBounds({ x: 0, y: -10000, width: 1280, height: 800 });
    win.contentView.addChildView(poolView);
    poolView.webContents.setBackgroundThrottling(false);
    await poolView.webContents.loadURL('https://www.w3schools.com/js/');

    console.log('Window children count before swap:', win.contentView.children.length);

    // 4. Swap!
    win.contentView.removeChildView(searchView);
    searchView.setVisible(false);

    try { win.contentView.removeChildView(poolView); } catch {}
    win.contentView.addChildView(poolView);
    poolView.setBounds({ x: 0, y: CHROME_HEIGHT, width: 1280, height: 800 - CHROME_HEIGHT });
    poolView.setVisible(true);
    poolView.webContents.invalidate();

    console.log('Window children after swap:', win.contentView.children.map((c, i) => ({
      idx: i,
      isChrome: c === chromeView,
      isPool: c === poolView,
      isSearch: c === searchView,
      bounds: c.getBounds(),
    })));

    // Let's capture the window itself (or both views)
    await new Promise((r) => setTimeout(r, 1000));

    // Capture window
    const img = await poolView.webContents.capturePage();
    const buf = img.toBitmap();
    let nonZero = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i] !== 0 || buf[i+1] !== 0 || buf[i+2] !== 0) nonZero++;
    }
    console.log('PoolView capture non-black pixels:', nonZero, 'of', buf.length / 4);

    // Now what if we capture chromeView?
    const imgChrome = await chromeView.webContents.capturePage();
    const bufChrome = imgChrome.toBitmap();
    let darkPixels = 0;
    for (let i = 0; i < bufChrome.length; i += 4) {
      if (bufChrome[i] === 0x17 && bufChrome[i+1] === 0x11 && bufChrome[i+2] === 0x0f) darkPixels++;
    }
    console.log('ChromeView #0f1117 pixels:', darkPixels);

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    app.quit();
  }
});
