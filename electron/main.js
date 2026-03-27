const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('path');
const { initAutoUpdater } = require('./auto-updater');

let mainWindow = null;
let db = null;

// ── Database initialization ────────────────────────────────────────────
function initDatabase() {
  try {
    const { Database } = require('../src/db/database');
    const dbPath = path.join(app.getPath('userData'), 'claude-world.db');
    db = new Database(dbPath);
    console.log('[main] Database initialized at', dbPath);
    return db;
  } catch (err) {
    console.warn('[main] Database module not ready, using null db:', err.message);
    return null;
  }
}

// ── Window creation ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Claude World',
    backgroundColor: '#0a0a14',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false, // show when ready to prevent flicker
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Show window once content is ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    initAutoUpdater(mainWindow);
  });

  // CSP headers — applied to all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://cdn.jsdelivr.net https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com http://localhost:*",
            "font-src 'self'",
          ].join('; '),
        ],
      },
    });
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── App lifecycle ──────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Initialize database before creating window
  db = initDatabase();

  createWindow();

  // Register IPC handlers (pass db so handlers can use it)
  const { registerHandlers } = require('./ipc-handlers');
  registerHandlers(ipcMain, db);

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS apps typically stay open; but for this app we quit
  app.quit();
});

app.on('before-quit', () => {
  // Graceful database shutdown
  if (db) {
    try {
      db.close();
      console.log('[main] Database closed');
    } catch (err) {
      console.error('[main] Error closing database:', err.message);
    }
  }
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error);
  dialog.showErrorBox(
    'Claude World — Unexpected Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe app will continue running but may be unstable.`
  );
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
});
