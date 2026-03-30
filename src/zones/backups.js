/**
 * backups.js — Backup Management zone for Claude World
 *
 * Lists all database backups with date, size, and auto/manual badges.
 * Supports manual backup creation, restore with confirmation,
 * auto-backup settings, storage usage display, and export/import.
 *
 * Vanilla JS + CSS. Pairs with backups.css.
 */

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(iso) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function relativeTime(iso) {
  if (!iso) return 'Unknown';
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Backups class ────────────────────────────────────────────────────

export class Backups {
  constructor() {
    /** @type {HTMLElement} */
    this._root = null;
    /** @type {string|null} */
    this._worldId = null;
    /** @type {Array<object>} */
    this._backups = [];
    /** @type {object} */
    this._storage = { totalSize: 0, count: 0 };
    /** @type {boolean} */
    this._autoEnabled = true;
    /** @type {number} */
    this._intervalMinutes = 30;
    /** @type {boolean} */
    this._loading = false;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Create and return the root DOM element.
   * @returns {HTMLElement}
   */
  render() {
    this._injectCSS();

    const el = document.createElement('div');
    el.className = 'backups';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Backup Management');

    el.innerHTML = `
      <!-- Header -->
      <div class="backups__header">
        <div class="backups__title-row">
          <h2 class="backups__title">Backup Management</h2>
          <span class="backups__subtitle">Protect your world data</span>
        </div>
        <div class="backups__actions-bar">
          <button class="backups__btn backups__btn--primary" data-action="create">
            <span class="backups__btn-icon">+</span> Create Backup
          </button>
          <button class="backups__btn backups__btn--secondary" data-action="import">
            Import
          </button>
        </div>
      </div>

      <!-- Storage usage -->
      <div class="backups__storage">
        <div class="backups__storage-header">
          <span class="backups__storage-label">Storage Usage</span>
          <span class="backups__storage-value" data-el="storage-text">--</span>
        </div>
        <div class="backups__storage-bar-track">
          <div class="backups__storage-bar-fill" data-el="storage-bar" style="width: 0%"></div>
        </div>
        <div class="backups__storage-meta">
          <span data-el="backup-count">0 backups</span>
          <button class="backups__link-btn" data-action="cleanup">Cleanup old backups</button>
        </div>
      </div>

      <!-- Auto-backup settings -->
      <div class="backups__settings">
        <div class="backups__settings-header">
          <span class="backups__settings-title">Auto-Backup</span>
          <label class="backups__toggle">
            <input type="checkbox" data-el="auto-toggle" checked>
            <span class="backups__toggle-slider"></span>
          </label>
        </div>
        <div class="backups__settings-row">
          <span class="backups__settings-label">Interval</span>
          <select class="backups__select" data-el="interval-select">
            <option value="15">Every 15 min</option>
            <option value="30" selected>Every 30 min</option>
            <option value="60">Every 1 hour</option>
            <option value="240">Every 4 hours</option>
          </select>
        </div>
      </div>

      <!-- Backup list -->
      <div class="backups__list-header">
        <span class="backups__list-title">All Backups</span>
        <span class="backups__list-count" data-el="list-count"></span>
      </div>
      <div class="backups__list" data-el="backup-list">
        <div class="backups__empty">Loading backups...</div>
      </div>

      <!-- Restore confirmation modal -->
      <div class="backups__modal-overlay" data-el="modal-overlay" style="display: none;">
        <div class="backups__modal">
          <div class="backups__modal-header">
            <h3>Restore Backup</h3>
            <button class="backups__modal-close" data-action="modal-close">&times;</button>
          </div>
          <div class="backups__modal-body">
            <p class="backups__modal-warning">
              This will replace your current database with the selected backup.
              A safety backup will be created automatically before restoring.
            </p>
            <div class="backups__modal-info">
              <div class="backups__modal-row">
                <span class="backups__modal-label">Backup:</span>
                <span class="backups__modal-value" data-el="modal-filename">--</span>
              </div>
              <div class="backups__modal-row">
                <span class="backups__modal-label">Created:</span>
                <span class="backups__modal-value" data-el="modal-date">--</span>
              </div>
              <div class="backups__modal-row">
                <span class="backups__modal-label">Size:</span>
                <span class="backups__modal-value" data-el="modal-size">--</span>
              </div>
            </div>
            <p class="backups__modal-note">The app will need to restart after restore.</p>
          </div>
          <div class="backups__modal-footer">
            <button class="backups__btn backups__btn--secondary" data-action="modal-close">Cancel</button>
            <button class="backups__btn backups__btn--danger" data-action="confirm-restore">Restore</button>
          </div>
        </div>
      </div>
    `;

    this._root = el;
    this._cacheElements();
    this._bindEvents();
    return el;
  }

  /**
   * Initialize with world data.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadBackups();
    await this._loadStorage();
  }

  // ── Internal: DOM cache ─────────────────────────────────────────

  _cacheElements() {
    this._els = {};
    this._root.querySelectorAll('[data-el]').forEach(el => {
      this._els[el.dataset.el] = el;
    });
  }

  _injectCSS() {
    const id = 'backups-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'src/zones/backups.css';
    document.head.appendChild(link);
  }

  // ── Internal: events ────────────────────────────────────────────

  _bindEvents() {
    // Delegate clicks
    this._root.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      switch (action) {
        case 'create':     this._handleCreate(); break;
        case 'import':     this._handleImport(); break;
        case 'cleanup':    this._handleCleanup(); break;
        case 'modal-close': this._closeModal(); break;
        case 'confirm-restore': this._handleConfirmRestore(); break;
      }

      // Per-backup actions
      const card = e.target.closest('[data-backup]');
      if (!card) return;
      const filename = card.dataset.backup;

      switch (action) {
        case 'restore': this._openRestoreModal(filename); break;
        case 'delete':  this._handleDelete(filename); break;
        case 'export':  this._handleExport(filename); break;
      }
    });

    // Auto-backup toggle
    const toggle = this._els['auto-toggle'];
    if (toggle) {
      toggle.addEventListener('change', () => {
        this._autoEnabled = toggle.checked;
        this._applyAutoBackupSettings();
      });
    }

    // Interval selector
    const select = this._els['interval-select'];
    if (select) {
      select.addEventListener('change', () => {
        this._intervalMinutes = parseInt(select.value, 10);
        this._applyAutoBackupSettings();
      });
    }
  }

  // ── Data loading ────────────────────────────────────────────────

  async _loadBackups() {
    this._loading = true;
    try {
      this._backups = await window.api.backup.list();
    } catch (err) {
      console.error('[backups] Failed to load backups:', err);
      this._backups = [];
    }
    this._loading = false;
    this._renderList();
  }

  async _loadStorage() {
    try {
      this._storage = await window.api.backup.getStorageUsage();
    } catch (err) {
      console.error('[backups] Failed to load storage:', err);
      this._storage = { totalSize: 0, count: 0 };
    }
    this._renderStorage();
  }

  // ── Rendering ───────────────────────────────────────────────────

  _renderList() {
    const list = this._els['backup-list'];
    const count = this._els['list-count'];
    if (!list) return;

    if (count) count.textContent = `(${this._backups.length})`;

    if (this._backups.length === 0) {
      list.innerHTML = '<div class="backups__empty">No backups found. Create your first backup above.</div>';
      return;
    }

    list.innerHTML = this._backups.map(bk => {
      const isAuto = !bk.filename.includes('manual');
      const badge = `<span class="backups__badge backups__badge--${isAuto ? 'auto' : 'manual'}">${isAuto ? 'Auto' : 'Manual'}</span>`;
      return `
        <div class="backups__card" data-backup="${escapeHTML(bk.filename)}">
          <div class="backups__card-main">
            <div class="backups__card-info">
              <span class="backups__card-name">${escapeHTML(bk.filename)}</span>
              <span class="backups__card-meta">
                ${formatDateTime(bk.created_at)} &middot; ${formatBytes(bk.size)} ${badge}
              </span>
            </div>
            <div class="backups__card-time">${relativeTime(bk.created_at)}</div>
          </div>
          <div class="backups__card-actions">
            <button class="backups__card-btn backups__card-btn--restore" data-action="restore" title="Restore this backup">Restore</button>
            <button class="backups__card-btn backups__card-btn--export" data-action="export" title="Export to file">Export</button>
            <button class="backups__card-btn backups__card-btn--delete" data-action="delete" title="Delete this backup">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  _renderStorage() {
    const text = this._els['storage-text'];
    const bar = this._els['storage-bar'];
    const countEl = this._els['backup-count'];

    if (text) text.textContent = formatBytes(this._storage.totalSize);
    if (countEl) countEl.textContent = `${this._storage.count} backup${this._storage.count !== 1 ? 's' : ''}`;

    // Bar fill: assume 500 MB max for visual scale
    if (bar) {
      const pct = Math.min(100, (this._storage.totalSize / (500 * 1024 * 1024)) * 100);
      bar.style.width = `${pct}%`;
      bar.classList.toggle('backups__storage-bar-fill--warning', pct > 70);
      bar.classList.toggle('backups__storage-bar-fill--danger', pct > 90);
    }
  }

  // ── Handlers ────────────────────────────────────────────────────

  async _handleCreate() {
    const btn = this._root.querySelector('[data-action="create"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      const result = await window.api.backup.create('manual');
      if (result.success) {
        this._showToast('Backup created successfully');
      } else {
        this._showToast(`Backup failed: ${result.error}`, 'error');
      }
    } catch (err) {
      this._showToast(`Backup failed: ${err.message}`, 'error');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="backups__btn-icon">+</span> Create Backup'; }
    await this._loadBackups();
    await this._loadStorage();
  }

  async _handleDelete(filename) {
    if (!filename) return;
    try {
      const result = await window.api.backup.delete(filename);
      if (result.success) {
        this._showToast('Backup deleted');
      } else {
        this._showToast(`Delete failed: ${result.error}`, 'error');
      }
    } catch (err) {
      this._showToast(`Delete failed: ${err.message}`, 'error');
    }
    await this._loadBackups();
    await this._loadStorage();
  }

  async _handleExport(filename) {
    if (!filename) return;
    try {
      const result = await window.api.backup.export(filename);
      if (result.success) {
        this._showToast('Backup exported');
      } else if (result.cancelled) {
        // User cancelled save dialog — no message needed
      } else {
        this._showToast(`Export failed: ${result.error}`, 'error');
      }
    } catch (err) {
      this._showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  async _handleImport() {
    try {
      const result = await window.api.backup.import();
      if (result.success) {
        this._showToast('Backup imported');
        await this._loadBackups();
        await this._loadStorage();
      } else if (result.cancelled) {
        // User cancelled open dialog
      } else {
        this._showToast(`Import failed: ${result.error}`, 'error');
      }
    } catch (err) {
      this._showToast(`Import failed: ${err.message}`, 'error');
    }
  }

  async _handleCleanup() {
    try {
      const result = await window.api.backup.cleanup();
      this._showToast(`Cleaned up ${result.deleted} old backup(s)`);
      await this._loadBackups();
      await this._loadStorage();
    } catch (err) {
      this._showToast(`Cleanup failed: ${err.message}`, 'error');
    }
  }

  async _applyAutoBackupSettings() {
    try {
      await window.api.backup.setAutoBackup(this._autoEnabled, this._intervalMinutes);
    } catch (err) {
      console.error('[backups] Failed to apply settings:', err);
    }
  }

  // ── Modal ───────────────────────────────────────────────────────

  _openRestoreModal(filename) {
    const bk = this._backups.find(b => b.filename === filename);
    if (!bk) return;

    this._restoreTarget = bk;

    const overlay = this._els['modal-overlay'];
    if (overlay) overlay.style.display = 'flex';

    const fnEl = this._els['modal-filename'];
    const dateEl = this._els['modal-date'];
    const sizeEl = this._els['modal-size'];

    if (fnEl) fnEl.textContent = bk.filename;
    if (dateEl) dateEl.textContent = formatDateTime(bk.created_at);
    if (sizeEl) sizeEl.textContent = formatBytes(bk.size);
  }

  _closeModal() {
    const overlay = this._els['modal-overlay'];
    if (overlay) overlay.style.display = 'none';
    this._restoreTarget = null;
  }

  async _handleConfirmRestore() {
    if (!this._restoreTarget) return;

    const btn = this._root.querySelector('[data-action="confirm-restore"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Restoring...'; }

    try {
      const result = await window.api.backup.restore(this._restoreTarget.path);
      if (result.success) {
        this._showToast('Database restored. Restarting app...');
        // The app should restart for the restored DB to take effect
        setTimeout(() => {
          window.api.backup.restartApp();
        }, 1500);
      } else {
        this._showToast(`Restore failed: ${result.error}`, 'error');
      }
    } catch (err) {
      this._showToast(`Restore failed: ${err.message}`, 'error');
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Restore'; }
    this._closeModal();
  }

  // ── Toast ───────────────────────────────────────────────────────

  _showToast(message, type = 'success') {
    // Remove existing toast
    const old = this._root.querySelector('.backups__toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = `backups__toast backups__toast--${type}`;
    toast.textContent = message;
    this._root.appendChild(toast);

    setTimeout(() => toast.classList.add('backups__toast--visible'), 10);
    setTimeout(() => {
      toast.classList.remove('backups__toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
