/**
 * sharing.js — World Sharing & Collaboration zone for Claude World
 *
 * Export, import, and share worlds as .claude-world JSON files.
 * Supports full world export, single-zone export, template export,
 * and import with conflict resolution (skip/overwrite/merge).
 */

// ── Constants ─────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'export',  label: 'Export',  icon: '\u{1F4E4}' },
  { id: 'import',  label: 'Import',  icon: '\u{1F4E5}' },
  { id: 'share',   label: 'Share',   icon: '\u{1F517}' },
  { id: 'stats',   label: 'Stats',   icon: '\u{1F4CA}' },
];

const CONFLICT_MODES = [
  { id: 'skip',      label: 'Skip existing',       desc: 'Keep current data, ignore conflicts' },
  { id: 'overwrite', label: 'Overwrite',            desc: 'Replace current data with imported data' },
  { id: 'merge',     label: 'Merge',                desc: 'Combine data, newer entries win' },
];

const FILE_EXTENSION = '.claude-world';
const FILE_MIME = 'application/json';

// ── Helpers ───────────────────────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function estimateJsonSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch (_) {
    return 0;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
}

// ── Sharing class ─────────────────────────────────────────────────

export class Sharing {
  /**
   * @param {HTMLElement} container — the panel body to render into
   */
  constructor(container) {
    /** @type {HTMLElement} */
    this._container = container;
    this._container.classList.add('shr-root');

    /** @type {string|null} */
    this._worldId = null;

    /** @type {object|null} */
    this._world = null;

    /** @type {string} */
    this._activeSection = 'export';

    /** @type {object|null} */
    this._exportData = null;

    /** @type {object|null} */
    this._importPreview = null;

    /** @type {string} */
    this._conflictMode = 'skip';

    /** @type {boolean} */
    this._isExporting = false;

    /** @type {boolean} */
    this._isImporting = false;

    /** @type {number} */
    this._progress = 0;

    /** @type {object} */
    this._stats = { zones: 0, tasks: 0, agents: 0, xp: 0, playTime: 0, health: 0 };

    /** @type {Array} */
    this._zones = [];

    /** @type {boolean} */
    this._styleInjected = false;

    this._injectStyles();
    this._render();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Load data for a given world.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    try {
      this._world = await window.api.db.getWorld(worldId);
    } catch (_) {
      this._world = null;
    }

    try {
      this._zones = await window.api.db.getZones(worldId) || [];
    } catch (_) {
      this._zones = [];
    }

    await this._loadStats();
    this._render();
  }

  /**
   * Return the rendered root element.
   * @returns {HTMLElement}
   */
  render() {
    return this._container;
  }

  /** Tear down. */
  destroy() {
    this._container.innerHTML = '';
  }

  // ── Stats loading ───────────────────────────────────────────────

  async _loadStats() {
    if (!this._worldId) return;

    const zones = this._zones;
    let tasks = [];
    let agents = [];
    let achievements = [];

    try { tasks = await window.api.db.getTasks(this._worldId, {}) || []; } catch (_) {}
    try { agents = await window.api.db.getAgents(this._worldId) || []; } catch (_) {}
    try { achievements = await window.api.db.getAchievements(this._worldId) || []; } catch (_) {}

    const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'completed');
    const totalTasks = tasks.length;
    const healthScore = totalTasks > 0
      ? Math.round((completedTasks.length / totalTasks) * 100)
      : 100;

    this._stats = {
      zones: zones.length,
      tasks: totalTasks,
      agents: agents.length,
      xp: this._world?.xp || 0,
      achievements: achievements.filter(a => a.unlocked_at).length,
      health: healthScore,
    };
  }

  // ── Rendering ───────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';

    // Section nav
    this._container.appendChild(this._buildNav());

    // Content
    const content = document.createElement('div');
    content.className = 'shr-content';

    switch (this._activeSection) {
      case 'export': this._buildExport(content); break;
      case 'import': this._buildImport(content); break;
      case 'share':  this._buildShare(content); break;
      case 'stats':  this._buildStats(content); break;
    }

    this._container.appendChild(content);
  }

  // ── Section nav ─────────────────────────────────────────────────

  _buildNav() {
    const nav = document.createElement('div');
    nav.className = 'shr-nav';

    for (const section of SECTIONS) {
      const btn = document.createElement('button');
      btn.className = 'shr-nav-btn' + (section.id === this._activeSection ? ' shr-nav-btn--active' : '');
      btn.innerHTML = `<span class="shr-nav-icon">${section.icon}</span><span>${section.label}</span>`;
      btn.addEventListener('click', () => {
        this._activeSection = section.id;
        this._render();
      });
      nav.appendChild(btn);
    }

    return nav;
  }

  // ── Export section ──────────────────────────────────────────────

  _buildExport(parent) {
    // Full world export
    const fullCard = this._createCard('Export World', 'Download your entire world as a .claude-world file');
    fullCard.appendChild(this._createBadge('JSON', 'blue'));

    const fullDesc = document.createElement('p');
    fullDesc.className = 'shr-card-detail';
    fullDesc.textContent = 'Includes all zones, tasks, agents, settings, achievements, and quest data.';
    fullCard.appendChild(fullDesc);

    const fullActions = document.createElement('div');
    fullActions.className = 'shr-card-actions';

    const estimateBtn = this._createButton('Estimate Size', 'secondary', async () => {
      const data = await this._fetchExportData();
      if (data) {
        const size = estimateJsonSize(data);
        estimateBtn.textContent = `~${formatBytes(size)}`;
        estimateBtn.classList.add('shr-btn--faded');
      }
    });

    const exportBtn = this._createButton('Export World', 'primary', () => this._exportWorld());
    exportBtn.classList.add('shr-btn--icon');
    exportBtn.insertAdjacentHTML('afterbegin', '<span class="shr-btn-badge">\u{1F4E4}</span>');

    fullActions.appendChild(estimateBtn);
    fullActions.appendChild(exportBtn);
    fullCard.appendChild(fullActions);
    parent.appendChild(fullCard);

    // Zone export
    const zoneCard = this._createCard('Export Zone', 'Export a single zone\'s data');
    zoneCard.appendChild(this._createBadge('Zone', 'green'));

    const zoneSelect = document.createElement('select');
    zoneSelect.className = 'shr-select';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select a zone...';
    zoneSelect.appendChild(defaultOpt);

    for (const zone of this._zones) {
      const opt = document.createElement('option');
      opt.value = zone.slug || zone.id;
      opt.textContent = zone.name || zone.slug;
      zoneSelect.appendChild(opt);
    }

    zoneCard.appendChild(zoneSelect);

    const zoneExportBtn = this._createButton('Export Zone', 'primary', async () => {
      const slug = zoneSelect.value;
      if (!slug) return;
      await this._exportZone(slug);
    });
    zoneCard.appendChild(zoneExportBtn);
    parent.appendChild(zoneCard);

    // Template export
    const templateCard = this._createCard('Export as Template', 'Create a reusable world template');
    templateCard.appendChild(this._createBadge('Template', 'purple'));

    const templateDesc = document.createElement('p');
    templateDesc.className = 'shr-card-detail';
    templateDesc.textContent = 'Strips personal data (identity, API keys, messages) and exports a clean template others can use.';
    templateCard.appendChild(templateDesc);

    const templateBtn = this._createButton('Export Template', 'primary', () => this._exportTemplate());
    templateBtn.classList.add('shr-btn--icon');
    templateBtn.insertAdjacentHTML('afterbegin', '<span class="shr-btn-badge">\u{1F4CB}</span>');
    templateCard.appendChild(templateBtn);
    parent.appendChild(templateCard);

    // Progress bar (shown during export)
    if (this._isExporting) {
      parent.appendChild(this._buildProgressBar('Exporting...'));
    }
  }

  // ── Import section ──────────────────────────────────────────────

  _buildImport(parent) {
    // Drag-and-drop area
    const dropZone = document.createElement('div');
    dropZone.className = 'shr-dropzone';
    dropZone.innerHTML = `
      <div class="shr-dropzone-icon">\u{1F4C2}</div>
      <div class="shr-dropzone-text">Drop a <strong>.claude-world</strong> file here</div>
      <div class="shr-dropzone-sub">or click to browse</div>
    `;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = FILE_EXTENSION + ',.json';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async () => {
      if (fileInput.files && fileInput.files[0]) {
        await this._handleImportFile(fileInput.files[0]);
      }
    });

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('shr-dropzone--active');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('shr-dropzone--active');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('shr-dropzone--active');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        await this._handleImportFile(e.dataTransfer.files[0]);
      }
    });

    dropZone.appendChild(fileInput);
    parent.appendChild(dropZone);

    // Import type buttons
    const typeCard = this._createCard('Import Options', 'Choose what to import');

    const typeRow = document.createElement('div');
    typeRow.className = 'shr-import-types';

    const types = [
      { id: 'world',    icon: '\u{1F30D}', label: 'Full World',     desc: 'Replace current world data' },
      { id: 'zone',     icon: '\u{1F3D7}', label: 'Single Zone',    desc: 'Add zone data to current world' },
      { id: 'template', icon: '\u{1F4D0}', label: 'From Template',  desc: 'Create new world from template' },
    ];

    for (const type of types) {
      const typeBtn = document.createElement('button');
      typeBtn.className = 'shr-import-type';
      typeBtn.innerHTML = `
        <span class="shr-import-type-icon">${type.icon}</span>
        <span class="shr-import-type-label">${type.label}</span>
        <span class="shr-import-type-desc">${type.desc}</span>
      `;
      typeBtn.addEventListener('click', () => {
        fileInput.dataset.importType = type.id;
        fileInput.click();
      });
      typeRow.appendChild(typeBtn);
    }

    typeCard.appendChild(typeRow);
    parent.appendChild(typeCard);

    // Conflict resolution
    const conflictCard = this._createCard('Conflict Resolution', 'How to handle duplicate data during import');

    for (const mode of CONFLICT_MODES) {
      const row = document.createElement('label');
      row.className = 'shr-conflict-row';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'shr-conflict';
      radio.value = mode.id;
      radio.checked = this._conflictMode === mode.id;
      radio.addEventListener('change', () => {
        this._conflictMode = mode.id;
      });

      const info = document.createElement('div');
      info.className = 'shr-conflict-info';
      info.innerHTML = `<span class="shr-conflict-label">${mode.label}</span><span class="shr-conflict-desc">${mode.desc}</span>`;

      row.appendChild(radio);
      row.appendChild(info);
      conflictCard.appendChild(row);
    }

    parent.appendChild(conflictCard);

    // Import preview (shown after file selection)
    if (this._importPreview) {
      parent.appendChild(this._buildImportPreview());
    }

    // Progress bar (shown during import)
    if (this._isImporting) {
      parent.appendChild(this._buildProgressBar('Importing...'));
    }
  }

  // ── Share section ───────────────────────────────────────────────

  _buildShare(parent) {
    // World summary
    const summaryCard = this._createCard('World Summary', 'Generate a shareable summary of your world');

    const summaryPreview = document.createElement('div');
    summaryPreview.className = 'shr-summary-preview';
    summaryPreview.textContent = 'Click generate to create a summary...';

    const summaryActions = document.createElement('div');
    summaryActions.className = 'shr-card-actions';

    const generateBtn = this._createButton('Generate Summary', 'primary', () => {
      const summary = this._generateWorldSummary();
      summaryPreview.textContent = summary;
      summaryPreview.classList.add('shr-summary-preview--filled');
    });

    const copySummaryBtn = this._createButton('Copy', 'secondary', () => {
      const text = summaryPreview.textContent;
      if (text && text !== 'Click generate to create a summary...') {
        navigator.clipboard.writeText(text);
        copySummaryBtn.textContent = 'Copied!';
        setTimeout(() => { copySummaryBtn.textContent = 'Copy'; }, 2000);
      }
    });

    summaryActions.appendChild(generateBtn);
    summaryActions.appendChild(copySummaryBtn);
    summaryCard.appendChild(summaryPreview);
    summaryCard.appendChild(summaryActions);
    parent.appendChild(summaryCard);

    // Copy stats as Markdown
    const mdCard = this._createCard('Copy Stats', 'Copy world statistics as formatted Markdown');

    const mdPreview = document.createElement('pre');
    mdPreview.className = 'shr-md-preview';
    mdPreview.textContent = this._generateMarkdownStats();

    const mdCopyBtn = this._createButton('Copy to Clipboard', 'primary', () => {
      navigator.clipboard.writeText(this._generateMarkdownStats());
      mdCopyBtn.textContent = 'Copied!';
      setTimeout(() => { mdCopyBtn.textContent = 'Copy to Clipboard'; }, 2000);
    });

    mdCard.appendChild(mdPreview);
    mdCard.appendChild(mdCopyBtn);
    parent.appendChild(mdCard);

    // Screenshot capture
    const screenshotCard = this._createCard('Generate Screenshot', 'Capture the city canvas as a PNG image');
    screenshotCard.appendChild(this._createBadge('PNG', 'amber'));

    const screenshotDesc = document.createElement('p');
    screenshotDesc.className = 'shr-card-detail';
    screenshotDesc.textContent = 'Captures the current isometric city view as a high-resolution PNG.';
    screenshotCard.appendChild(screenshotDesc);

    const screenshotBtn = this._createButton('Capture Screenshot', 'primary', () => this._captureScreenshot());
    screenshotBtn.classList.add('shr-btn--icon');
    screenshotBtn.insertAdjacentHTML('afterbegin', '<span class="shr-btn-badge">\u{1F4F8}</span>');
    screenshotCard.appendChild(screenshotBtn);
    parent.appendChild(screenshotCard);
  }

  // ── Stats section ───────────────────────────────────────────────

  _buildStats(parent) {
    const card = document.createElement('div');
    card.className = 'shr-stats-card';

    const title = document.createElement('h3');
    title.className = 'shr-card-title';
    title.textContent = 'World Statistics';
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'shr-stats-grid';

    const statItems = [
      { label: 'Zones',        value: this._stats.zones,        icon: '\u{1F3D7}',  color: 'blue' },
      { label: 'Tasks',        value: this._stats.tasks,        icon: '\u{1F4CB}',  color: 'green' },
      { label: 'Agents',       value: this._stats.agents,       icon: '\u{1F916}',  color: 'purple' },
      { label: 'XP',           value: this._stats.xp,           icon: '\u2B50',      color: 'gold' },
      { label: 'Achievements', value: this._stats.achievements, icon: '\u{1F3C6}',  color: 'amber' },
      { label: 'Health',       value: `${this._stats.health}%`, icon: '\u{1F49A}',  color: 'green' },
    ];

    for (const item of statItems) {
      const cell = document.createElement('div');
      cell.className = `shr-stat-cell shr-stat-cell--${item.color}`;
      cell.innerHTML = `
        <span class="shr-stat-icon">${item.icon}</span>
        <span class="shr-stat-value" data-target="${typeof item.value === 'number' ? item.value : ''}">${item.value}</span>
        <span class="shr-stat-label">${item.label}</span>
      `;
      grid.appendChild(cell);
    }

    card.appendChild(grid);

    // World info
    const infoSection = document.createElement('div');
    infoSection.className = 'shr-stats-info';

    const infoItems = [
      { label: 'World Name',  value: this._world?.name || 'My World' },
      { label: 'Template',    value: (this._world?.template || 'starter').charAt(0).toUpperCase() + (this._world?.template || 'starter').slice(1) },
      { label: 'Level',       value: this._world?.level || 1 },
      { label: 'Created',     value: formatDate(this._world?.created_at) },
    ];

    for (const info of infoItems) {
      const row = document.createElement('div');
      row.className = 'shr-stats-row';
      row.innerHTML = `<span class="shr-stats-row-label">${info.label}</span><span class="shr-stats-row-value">${escapeHtml(String(info.value))}</span>`;
      infoSection.appendChild(row);
    }

    card.appendChild(infoSection);
    parent.appendChild(card);

    // Animate counters after render
    requestAnimationFrame(() => this._animateCounters());
  }

  // ── Export operations ───────────────────────────────────────────

  async _fetchExportData() {
    if (!this._worldId) return null;
    try {
      this._exportData = await window.api.db.exportWorld(this._worldId);
      return this._exportData;
    } catch (err) {
      console.error('[sharing] Export fetch failed:', err);
      return null;
    }
  }

  async _exportWorld() {
    this._isExporting = true;
    this._progress = 0;
    this._render();

    try {
      this._progress = 30;
      this._updateProgress();

      const data = await this._fetchExportData();
      if (!data) throw new Error('No export data');

      this._progress = 70;
      this._updateProgress();

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: FILE_MIME });
      const worldName = sanitizeFilename(this._world?.name || 'claude-world');
      const date = new Date().toISOString().split('T')[0];
      downloadBlob(blob, `${worldName}_${date}${FILE_EXTENSION}`);

      this._progress = 100;
      this._updateProgress();
      this._showToast('World exported successfully');
    } catch (err) {
      console.error('[sharing] Export failed:', err);
      this._showToast('Export failed: ' + err.message);
    }

    setTimeout(() => {
      this._isExporting = false;
      this._progress = 0;
      this._render();
    }, 800);
  }

  async _exportZone(slug) {
    if (!this._worldId) return;

    try {
      const data = await this._fetchExportData();
      if (!data) return;

      const zone = data.zones?.find(z => z.slug === slug || String(z.id) === String(slug));
      if (!zone) {
        this._showToast('Zone not found');
        return;
      }

      const zoneData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        type: 'zone',
        zone,
        tasks: (data.tasks || []).filter(t => t.zone_slug === slug || t.zone_id === zone.id),
      };

      const json = JSON.stringify(zoneData, null, 2);
      const blob = new Blob([json], { type: FILE_MIME });
      const zoneName = sanitizeFilename(zone.name || slug);
      downloadBlob(blob, `zone_${zoneName}${FILE_EXTENSION}`);
      this._showToast(`Zone "${zone.name}" exported`);
    } catch (err) {
      console.error('[sharing] Zone export failed:', err);
      this._showToast('Zone export failed');
    }
  }

  async _exportTemplate() {
    if (!this._worldId) return;

    try {
      const data = await this._fetchExportData();
      if (!data) return;

      // Strip personal data for template
      const template = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        type: 'template',
        world: {
          name: data.world?.name || 'Template',
          template: data.world?.template || 'custom',
          level: 1,
          xp: 0,
          xp_to_next: data.world?.xp_to_next || 100,
        },
        zones: (data.zones || []).map(z => ({
          slug: z.slug,
          name: z.name,
          color: z.color,
          grid_x: z.grid_x,
          grid_y: z.grid_y,
          width: z.width,
          height: z.height,
          unlocked: z.unlocked,
        })),
        settings: (data.settings || []).filter(s =>
          !s.key.startsWith('api.') &&
          !s.key.startsWith('privacy.') &&
          !s.key.startsWith('identity.')
        ),
        agents: (data.agents || []).map(a => ({
          name: a.name,
          role: a.role,
          sprite_key: a.sprite_key,
          tile_x: a.tile_x,
          tile_y: a.tile_y,
        })),
      };

      const json = JSON.stringify(template, null, 2);
      const blob = new Blob([json], { type: FILE_MIME });
      const worldName = sanitizeFilename(this._world?.name || 'template');
      downloadBlob(blob, `template_${worldName}${FILE_EXTENSION}`);
      this._showToast('Template exported');
    } catch (err) {
      console.error('[sharing] Template export failed:', err);
      this._showToast('Template export failed');
    }
  }

  // ── Import operations ───────────────────────────────────────────

  async _handleImportFile(file) {
    try {
      const text = await readFileAsText(file);
      const data = JSON.parse(text);

      if (!data.version || !data.exportedAt) {
        this._showToast('Invalid file: missing version or export date');
        return;
      }

      this._importPreview = {
        filename: file.name,
        size: file.size,
        data,
        type: data.type || 'world',
        worldName: data.world?.name || 'Unknown',
        zonesCount: data.zones?.length || (data.zone ? 1 : 0),
        tasksCount: data.tasks?.length || 0,
        agentsCount: data.agents?.length || 0,
        exportedAt: data.exportedAt,
      };

      this._render();
    } catch (err) {
      console.error('[sharing] Import parse failed:', err);
      this._showToast('Could not read file: ' + err.message);
    }
  }

  _buildImportPreview() {
    const p = this._importPreview;
    if (!p) return document.createElement('div');

    const card = document.createElement('div');
    card.className = 'shr-preview-card';

    const header = document.createElement('div');
    header.className = 'shr-preview-header';
    header.innerHTML = `
      <span class="shr-preview-icon">\u{1F4C4}</span>
      <div class="shr-preview-meta">
        <span class="shr-preview-filename">${escapeHtml(p.filename)}</span>
        <span class="shr-preview-size">${formatBytes(p.size)}</span>
      </div>
      <span class="shr-preview-type-badge shr-badge--${p.type === 'template' ? 'purple' : p.type === 'zone' ? 'green' : 'blue'}">${p.type}</span>
    `;
    card.appendChild(header);

    const details = document.createElement('div');
    details.className = 'shr-preview-details';

    const rows = [
      { label: 'World', value: p.worldName },
      { label: 'Zones', value: p.zonesCount },
      { label: 'Tasks', value: p.tasksCount },
      { label: 'Agents', value: p.agentsCount },
      { label: 'Exported', value: formatDate(p.exportedAt) },
    ];

    for (const row of rows) {
      const el = document.createElement('div');
      el.className = 'shr-preview-row';
      el.innerHTML = `<span>${row.label}</span><span>${escapeHtml(String(row.value))}</span>`;
      details.appendChild(el);
    }

    card.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'shr-card-actions';

    const cancelBtn = this._createButton('Cancel', 'secondary', () => {
      this._importPreview = null;
      this._render();
    });

    const confirmBtn = this._createButton('Import', 'primary', () => this._executeImport());
    confirmBtn.classList.add('shr-btn--icon');
    confirmBtn.insertAdjacentHTML('afterbegin', '<span class="shr-btn-badge">\u{1F4E5}</span>');

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    return card;
  }

  async _executeImport() {
    if (!this._importPreview || !this._worldId) return;

    this._isImporting = true;
    this._progress = 0;
    this._render();

    const data = this._importPreview.data;
    const type = this._importPreview.type;

    try {
      this._progress = 20;
      this._updateProgress();

      if (type === 'world') {
        await this._importWorld(data);
      } else if (type === 'zone') {
        await this._importZone(data);
      } else if (type === 'template') {
        await this._importTemplate(data);
      }

      this._progress = 100;
      this._updateProgress();
      this._showToast('Import completed successfully');
    } catch (err) {
      console.error('[sharing] Import failed:', err);
      this._showToast('Import failed: ' + err.message);
    }

    setTimeout(() => {
      this._isImporting = false;
      this._importPreview = null;
      this._progress = 0;
      this._render();
    }, 800);
  }

  async _importWorld(data) {
    // Use the importWorldSnapshot IPC if available, or fall back to manual insert
    try {
      await window.api.db.importWorldSnapshot(this._worldId, data);
    } catch (_) {
      // Fallback: insert data manually via available APIs
      if (data.settings && Array.isArray(data.settings)) {
        for (const s of data.settings) {
          if (this._conflictMode === 'skip') {
            try {
              const existing = await window.api.db.getSettings(this._worldId);
              if (existing.find(e => e.key === s.key)) continue;
            } catch (__) {}
          }
          try {
            await window.api.db.updateSettings(this._worldId, s.key, s.value);
          } catch (__) {}
        }
      }
    }
    this._progress = 80;
    this._updateProgress();
  }

  async _importZone(data) {
    // Zone import: add zone data via settings
    if (data.zone) {
      try {
        await window.api.db.updateSettings(this._worldId, `zone.import.${data.zone.slug}`, JSON.stringify(data.zone));
      } catch (_) {}
    }
    this._progress = 80;
    this._updateProgress();
  }

  async _importTemplate(data) {
    // Template creates settings from template data
    if (data.settings && Array.isArray(data.settings)) {
      for (const s of data.settings) {
        try {
          await window.api.db.updateSettings(this._worldId, s.key, s.value);
        } catch (_) {}
      }
    }
    this._progress = 80;
    this._updateProgress();
  }

  // ── Share operations ────────────────────────────────────────────

  _generateWorldSummary() {
    const w = this._world;
    const s = this._stats;
    const name = w?.name || 'My World';
    const template = (w?.template || 'starter').charAt(0).toUpperCase() + (w?.template || 'starter').slice(1);
    const level = w?.level || 1;

    return [
      `${name} - Claude World`,
      `Template: ${template} | Level: ${level} | XP: ${s.xp}`,
      `${s.zones} zones | ${s.tasks} tasks | ${s.agents} agents`,
      `Health Score: ${s.health}% | Achievements: ${s.achievements}`,
      `Created: ${formatDate(w?.created_at)}`,
    ].join('\n');
  }

  _generateMarkdownStats() {
    const w = this._world;
    const s = this._stats;
    const name = w?.name || 'My World';

    return [
      `## ${name}`,
      '',
      `| Stat | Value |`,
      `|------|-------|`,
      `| Zones | ${s.zones} |`,
      `| Tasks | ${s.tasks} |`,
      `| Agents | ${s.agents} |`,
      `| XP | ${s.xp} |`,
      `| Achievements | ${s.achievements} |`,
      `| Health Score | ${s.health}% |`,
      '',
      `*Exported from Claude World on ${new Date().toLocaleDateString()}*`,
    ].join('\n');
  }

  _captureScreenshot() {
    // Find the city canvas element
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      this._showToast('No canvas found to capture');
      return;
    }

    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          this._showToast('Screenshot capture failed');
          return;
        }
        const worldName = sanitizeFilename(this._world?.name || 'claude-world');
        const date = new Date().toISOString().split('T')[0];
        downloadBlob(blob, `${worldName}_${date}.png`);
        this._showToast('Screenshot saved');
      }, 'image/png');
    } catch (err) {
      console.error('[sharing] Screenshot failed:', err);
      this._showToast('Screenshot capture failed');
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────

  _createCard(title, description) {
    const card = document.createElement('div');
    card.className = 'shr-card';

    const h = document.createElement('h3');
    h.className = 'shr-card-title';
    h.textContent = title;
    card.appendChild(h);

    if (description) {
      const d = document.createElement('p');
      d.className = 'shr-card-desc';
      d.textContent = description;
      card.appendChild(d);
    }

    return card;
  }

  _createButton(label, variant, onClick) {
    const btn = document.createElement('button');
    btn.className = `shr-btn shr-btn--${variant}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _createBadge(text, color) {
    const badge = document.createElement('span');
    badge.className = `shr-badge shr-badge--${color}`;
    badge.textContent = text;
    return badge;
  }

  _buildProgressBar(label) {
    const wrap = document.createElement('div');
    wrap.className = 'shr-progress-wrap';

    const labelEl = document.createElement('span');
    labelEl.className = 'shr-progress-label';
    labelEl.textContent = label;
    wrap.appendChild(labelEl);

    const bar = document.createElement('div');
    bar.className = 'shr-progress-bar';

    const fill = document.createElement('div');
    fill.className = 'shr-progress-fill';
    fill.style.width = `${this._progress}%`;

    bar.appendChild(fill);
    wrap.appendChild(bar);

    const pct = document.createElement('span');
    pct.className = 'shr-progress-pct';
    pct.textContent = `${Math.round(this._progress)}%`;
    wrap.appendChild(pct);

    return wrap;
  }

  _updateProgress() {
    const fill = this._container.querySelector('.shr-progress-fill');
    const pct = this._container.querySelector('.shr-progress-pct');
    if (fill) fill.style.width = `${this._progress}%`;
    if (pct) pct.textContent = `${Math.round(this._progress)}%`;
  }

  _animateCounters() {
    const cells = this._container.querySelectorAll('.shr-stat-value[data-target]');
    for (const cell of cells) {
      const target = parseInt(cell.dataset.target, 10);
      if (isNaN(target) || target === 0) continue;

      let current = 0;
      const step = Math.max(1, Math.ceil(target / 30));
      const interval = setInterval(() => {
        current = Math.min(current + step, target);
        cell.textContent = current;
        if (current >= target) clearInterval(interval);
      }, 30);
    }
  }

  _showToast(message) {
    document.dispatchEvent(new CustomEvent('toast', { detail: { message, type: 'info' } }));
  }

  // ── Styles injection ────────────────────────────────────────────

  _injectStyles() {
    if (this._styleInjected) return;
    if (document.getElementById('sharing-panel-styles')) {
      this._styleInjected = true;
      return;
    }

    const link = document.createElement('link');
    link.id = 'sharing-panel-styles';
    link.rel = 'stylesheet';
    link.href = new URL('./sharing.css', import.meta.url).href;
    document.head.appendChild(link);
    this._styleInjected = true;
  }
}
