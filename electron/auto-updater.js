// auto-updater.js — Checks for app updates via GitHub Releases
const { autoUpdater, dialog, app } = require("electron");

const REPO_OWNER = "sboghossian";
const REPO_NAME = "Claude-World";

function getFeedURL() {
  const version = app.getVersion();
  const platform = process.platform;
  return `https://update.electronjs.org/${REPO_OWNER}/${REPO_NAME}/${platform}/${version}`;
}

function initAutoUpdater(mainWindow) {
  // Only run in production (packaged app)
  if (!app.isPackaged) {
    console.log("[updater] Skipping auto-updater in development mode");
    return;
  }

  try {
    const feedURL = getFeedURL();
    if (!feedURL) {
      console.warn("[updater] No update feed URL configured, skipping");
      return;
    }

    autoUpdater.setFeedURL({ url: feedURL });

    autoUpdater.on("update-available", () => {
      console.log("[updater] Update available, downloading...");
    });

    autoUpdater.on("update-not-available", () => {
      console.log("[updater] App is up to date");
    });

    autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          buttons: ["Restart", "Later"],
          title: "Update Available",
          message: `Claude World ${releaseName || "update"} is ready`,
          detail:
            "A new version has been downloaded. Restart to apply the update.",
        })
        .then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall();
        })
        .catch((err) => {
          console.warn("[updater] Dialog error:", err.message);
        });
    });

    autoUpdater.on("error", (err) => {
      // Don't crash the app — just log and continue
      console.warn("[updater] Update check failed:", err.message);
    });

    // Check on startup (with a short delay to not block launch), then every 4 hours
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdates();
      } catch (err) {
        console.warn("[updater] Initial update check failed:", err.message);
      }
    }, 5000);

    setInterval(
      () => {
        try {
          autoUpdater.checkForUpdates();
        } catch (err) {
          console.warn("[updater] Periodic update check failed:", err.message);
        }
      },
      4 * 60 * 60 * 1000,
    );
  } catch (err) {
    console.warn("[updater] Could not init auto-updater:", err.message);
  }
}

module.exports = { initAutoUpdater };
