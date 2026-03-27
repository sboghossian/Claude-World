// auto-updater.js — Checks for app updates via GitHub Releases
const { autoUpdater, dialog, app } = require('electron');

const FEED_URL = 'https://update.electronjs.org/stephaneboghossian/claude-world/' + process.platform + '/' + app.getVersion();

function initAutoUpdater(mainWindow) {
  // Only run in packaged app
  if (!app.isPackaged) return;

  try {
    autoUpdater.setFeedURL({ url: FEED_URL });

    autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Update Available',
        message: `Claude World ${releaseName} is ready`,
        detail: 'A new version has been downloaded. Restart to apply the update.',
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', (err) => {
      console.warn('[updater] Error:', err.message);
    });

    // Check on startup, then every 4 hours
    autoUpdater.checkForUpdates();
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);

  } catch (err) {
    console.warn('[updater] Could not init auto-updater:', err.message);
  }
}

module.exports = { initAutoUpdater };
