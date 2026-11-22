const { app, WebContentsView, View } = require('electron');

app.whenReady().then(() => {
  const v = new WebContentsView();
  console.log('setVisible:', typeof v.setVisible);
  console.log('isVisible:', typeof v.isVisible);
  console.log('v methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(v)));
  console.log('View methods:', Object.getOwnPropertyNames(View.prototype));
  app.quit();
});
