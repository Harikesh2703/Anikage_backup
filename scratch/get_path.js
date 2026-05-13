const { app } = require('electron');
app.whenReady().then(() => {
  console.log('USER_DATA:', app.getPath('userData'));
  process.exit(0);
});
