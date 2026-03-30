'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Constants ─────────────────────────────────────────────────────────
const BACKUP_DIR = path.join(os.homedir(), '.claude-world', 'backups');
const MAX_BACKUPS = 10;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const PREFIX = 'claude-world-';
const SUFFIX = '.db.bak';

// ── State ─────────────────────────────────────────────────────────────
let _dbPath = null;
let _intervalHandle = null;
let _intervalMs = DEFAULT_INTERVAL_MS;
let _enabled = true;

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Ensure the backup directory exists.
 */
function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Generate a timestamped backup filename.
 * Format: claude-world-20260330T143022.db.bak
 * @returns {string}
 */
function backupFilename() {
  const now = new Date();
  const ts = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', 'T')
    .replace(/\.\d+Z$/, '');
  return `${PREFIX}${ts}${SUFFIX}`;
}

/**
 * Parse timestamp from a backup filename.
 * @param {string} filename
 * @returns {Date|null}
 */
function parseTimestamp(filename) {
  const base = filename.replace(PREFIX, '').replace(SUFFIX, '');
  // base looks like 20260330T143022
  if (base.length < 15) return null;
  const year  = base.slice(0, 4);
  const month = base.slice(4, 6);
  const day   = base.slice(6, 8);
  const hour  = base.slice(9, 11);
  const min   = base.slice(11, 13);
  const sec   = base.slice(13, 15);
  const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Check if the source database file exists and is non-empty.
 * @returns {boolean}
 */
function dbExists() {
  if (!_dbPath) return false;
  try {
    const stat = fs.statSync(_dbPath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

// ── Core functions ────────────────────────────────────────────────────

/**
 * Create a backup of the database.
 * @param {'auto'|'manual'} [trigger='auto'] — What triggered this backup.
 * @returns {{ success: boolean, path?: string, filename?: string, size?: number, trigger?: string, error?: string }}
 */
function createBackup(trigger = 'auto') {
  if (!dbExists()) {
    return { success: false, error: 'Database file not found or empty' };
  }

  try {
    ensureDir();
    const filename = backupFilename();
    const dest = path.join(BACKUP_DIR, filename);

    // Use fs.copyFileSync for atomic-ish copy.
    // SQLite WAL mode: the copy is crash-safe for reads once the main
    // file is copied.  For maximum safety we also copy -wal and -shm
    // if they exist, but a plain copy of the main DB is usually fine
    // for cold backups (app launch, quit) and warm snapshots.
    fs.copyFileSync(_dbPath, dest);

    // Also copy WAL/SHM if present (best-effort)
    for (const ext of ['-wal', '-shm']) {
      const src = _dbPath + ext;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest + ext);
      }
    }

    const stat = fs.statSync(dest);

    console.log(`[backup] Created ${trigger} backup: ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);

    // Prune old backups after successful write
    pruneBackups();

    return {
      success: true,
      path: dest,
      filename,
      size: stat.size,
      trigger,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[backup] Failed to create backup:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * List all backups, sorted newest-first.
 * @returns {Array<{ filename: string, path: string, size: number, created_at: string|null }>}
 */
function listBackups() {
  ensureDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(PREFIX) && f.endsWith(SUFFIX));

    const backups = files.map(filename => {
      const fullPath = path.join(BACKUP_DIR, filename);
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch { /* skip */ }
      const ts = parseTimestamp(filename);
      return {
        filename,
        path: fullPath,
        size,
        created_at: ts ? ts.toISOString() : null,
      };
    });

    // Sort newest first
    backups.sort((a, b) => {
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return backups;
  } catch (err) {
    console.error('[backup] Failed to list backups:', err.message);
    return [];
  }
}

/**
 * Delete backups beyond MAX_BACKUPS (keeps newest).
 * @returns {number} Number of deleted backups.
 */
function pruneBackups() {
  const backups = listBackups();
  let deleted = 0;
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const bk of toDelete) {
      try {
        fs.unlinkSync(bk.path);
        // Also remove WAL/SHM companions
        for (const ext of ['-wal', '-shm']) {
          const companion = bk.path + ext;
          if (fs.existsSync(companion)) fs.unlinkSync(companion);
        }
        deleted++;
      } catch (err) {
        console.warn('[backup] Failed to delete old backup:', bk.filename, err.message);
      }
    }
    if (deleted > 0) {
      console.log(`[backup] Pruned ${deleted} old backup(s)`);
    }
  }
  return deleted;
}

/**
 * Delete a specific backup by filename.
 * @param {string} filename
 * @returns {{ success: boolean, error?: string }}
 */
function deleteBackup(filename) {
  const fullPath = path.join(BACKUP_DIR, filename);
  try {
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Backup file not found' };
    }
    fs.unlinkSync(fullPath);
    for (const ext of ['-wal', '-shm']) {
      const companion = fullPath + ext;
      if (fs.existsSync(companion)) fs.unlinkSync(companion);
    }
    console.log(`[backup] Deleted backup: ${filename}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Restore the database from a backup file.
 * The app should be restarted after restore for safety.
 *
 * @param {string} backupPath — Full path to the backup file.
 * @returns {{ success: boolean, error?: string }}
 */
function restoreFromBackup(backupPath) {
  if (!_dbPath) {
    return { success: false, error: 'Database path not initialized' };
  }
  if (!fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file does not exist' };
  }

  try {
    // Create a safety backup of the current DB before overwriting
    createBackup('pre-restore');

    // Copy backup over the active DB
    fs.copyFileSync(backupPath, _dbPath);

    // Remove WAL/SHM from the active DB so SQLite starts fresh
    for (const ext of ['-wal', '-shm']) {
      const walPath = _dbPath + ext;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    }

    console.log('[backup] Restored database from:', backupPath);
    return { success: true };
  } catch (err) {
    console.error('[backup] Restore failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get total size of all backups.
 * @returns {{ totalSize: number, count: number }}
 */
function getStorageUsage() {
  const backups = listBackups();
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  return { totalSize, count: backups.length };
}

// ── Scheduling ────────────────────────────────────────────────────────

/**
 * Start periodic auto-backups.
 * @param {number} [intervalMs] — Interval in milliseconds. Defaults to 30 min.
 */
function scheduleBackups(intervalMs) {
  stopSchedule();
  _intervalMs = intervalMs || DEFAULT_INTERVAL_MS;
  if (!_enabled) return;
  _intervalHandle = setInterval(() => {
    createBackup('auto');
  }, _intervalMs);
  console.log(`[backup] Scheduled auto-backup every ${(_intervalMs / 60000).toFixed(0)} min`);
}

/**
 * Stop the scheduled backup interval.
 */
function stopSchedule() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

/**
 * Initialize the backup system.
 * Creates a startup backup and starts the schedule.
 *
 * @param {string} dbPath — Full path to the active SQLite database.
 */
function initBackup(dbPath) {
  _dbPath = dbPath;
  console.log('[backup] Initialized. DB path:', dbPath);
  console.log('[backup] Backup dir:', BACKUP_DIR);

  // Startup backup (before any writes)
  createBackup('auto');

  // Start periodic backups
  scheduleBackups(_intervalMs);
}

/**
 * Cleanup: create a final backup and stop the scheduler.
 * Call this on app quit.
 */
function cleanup() {
  stopSchedule();
  if (_enabled && dbExists()) {
    createBackup('auto');
  }
  console.log('[backup] Cleanup complete');
}

// ── Module exports ────────────────────────────────────────────────────

module.exports = {
  initBackup,
  scheduleBackups,
  createBackup,
  restoreFromBackup,
  listBackups,
  deleteBackup,
  getStorageUsage,
  pruneBackups,
  cleanup,
  getBackupDir: () => BACKUP_DIR,
  getDbPath: () => _dbPath,
};
