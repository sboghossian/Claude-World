/**
 * settings.js — Settings panel for Claude World
 *
 * Tab-based settings with sections for General, AI Providers, Appearance,
 * Audio, Privacy, and About. Settings persist via window.api.db key-value store.
 */

// ── Constants ─────────────────────────────────────────────────────

const TABS = [
  { id: 'general',    label: 'General',      icon: '⚙️' },
  { id: 'providers',  label: 'AI Providers', icon: '🤖' },
  { id: 'appearance', label: 'Appearance',   icon: '🎨' },
  { id: 'audio',      label: 'Audio',        icon: '🔊' },
  { id: 'privacy',    label: 'Privacy',      icon: '🔒' },
  { id: 'about',      label: 'About',        icon: 'ℹ️' },
];

const DEFAULT_SETTINGS = {
  'ai.provider':         'anthropic',
  'ai.model':            'claude-sonnet-4-20250514',
  'ai.temperature':      '0.7',
  'ai.maxTokens':        '4096',
  'appearance.theme':    'midnight',
  'appearance.fontSize': '14',
  'appearance.animations': 'true',
  'appearance.reducedMotion': 'false',
  'audio.masterVolume':  '0.7',
  'audio.ambient':       'true',
  'audio.notifications': 'true',
};

const AI_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'o3-mini', label: 'o3-mini' },
  ],
};

const SYNTH_SOUNDS = [
  { id: 'ping',   icon: '🔔', label: 'Ping',    freq: 880,  dur: 0.15 },
  { id: 'blip',   icon: '💫', label: 'Blip',    freq: 660,  dur: 0.1  },
  { id: 'chime',  icon: '🎵', label: 'Chime',   freq: 523,  dur: 0.3  },
  { id: 'alert',  icon: '🚨', label: 'Alert',   freq: 440,  dur: 0.25 },
  { id: 'whoosh', icon: '💨', label: 'Whoosh',  freq: 200,  dur: 0.4  },
  { id: 'click',  icon: '🖱️', label: 'Click',   freq: 1200, dur: 0.05 },
];

// ── Helpers ───────────────────────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Play a simple synth tone using Web Audio API. */
function playSynthTone(freq, duration, volume = 0.5) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch (_) { /* AudioContext not available */ }
}

// ── Settings class ────────────────────────────────────────────────

export class Settings {
  /**
   * @param {HTMLElement} container — the panel body to render into
   * @param {object} [options]
   * @param {object} [options.themeEngine] — ThemeEngine instance for appearance tab
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;
    this._container.classList.add('stg-root');

    /** @type {object|null} */
    this._themeEngine = options.themeEngine || null;

    /** @type {string|null} */
    this._worldId = null;

    /** @type {object|null} */
    this._world = null;

    /** @type {string} */
    this._activeTab = 'general';

    /** @type {Record<string, string>} */
    this._settings = { ...DEFAULT_SETTINGS };

    /** @type {Array<object>} */
    this._providers = [];

    /** @type {object|null} */
    this._appInfo = null;

    /** @type {boolean} */
    this._styleInjected = false;

    this._injectStyles();
    this._render();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Load settings for a given world.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    // Load world info
    try {
      this._world = await window.api.db.getWorld(worldId);
    } catch (_) {
      this._world = null;
    }

    // Load settings from DB
    try {
      const rows = await window.api.db.getSettings(worldId);
      if (Array.isArray(rows)) {
        for (const row of rows) {
          this._settings[row.key] = row.value;
        }
      }
    } catch (_) { /* table may not exist yet */ }

    // Load providers
    try {
      this._providers = await window.api.ai.listProviders();
    } catch (_) {
      this._providers = [];
    }

    // Load app info
    try {
      this._appInfo = await window.api.db.getAppInfo();
    } catch (_) {
      try {
        const version = await window.api.app.getVersion();
        this._appInfo = { version, electron: '—', node: '—', chrome: '—' };
      } catch (__) {
        this._appInfo = { version: '0.1.0', electron: '—', node: '—', chrome: '—' };
      }
    }

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

  // ── Settings persistence ────────────────────────────────────────

  async _saveSetting(key, value) {
    this._settings[key] = String(value);
    if (!this._worldId) return;
    try {
      await window.api.db.updateSettings(this._worldId, key, String(value));
    } catch (err) {
      console.warn('[settings] Failed to save setting:', key, err.message);
    }
  }

  _getSetting(key) {
    return this._settings[key] ?? DEFAULT_SETTINGS[key] ?? '';
  }

  _getSettingBool(key) {
    return this._getSetting(key) === 'true';
  }

  _getSettingNum(key) {
    return parseFloat(this._getSetting(key)) || 0;
  }

  // ── Rendering ───────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';

    // Tab bar
    this._container.appendChild(this._buildTabs());

    // Content
    const content = document.createElement('div');
    content.className = 'stg-content';

    switch (this._activeTab) {
      case 'general':    this._buildGeneral(content); break;
      case 'providers':  this._buildProviders(content); break;
      case 'appearance': this._buildAppearance(content); break;
      case 'audio':      this._buildAudio(content); break;
      case 'privacy':    this._buildPrivacy(content); break;
      case 'about':      this._buildAbout(content); break;
    }

    this._container.appendChild(content);

    // Update tab indicator position after DOM paint
    requestAnimationFrame(() => this._updateTabIndicator());
  }

  // ── Tab bar ─────────────────────────────────────────────────────

  _buildTabs() {
    const nav = document.createElement('div');
    nav.className = 'stg-tabs';

    for (const tab of TABS) {
      const btn = document.createElement('button');
      btn.className = 'stg-tab' + (tab.id === this._activeTab ? ' stg-tab--active' : '');
      btn.dataset.tabId = tab.id;
      btn.textContent = `${tab.icon} ${tab.label}`;
      btn.setAttribute('aria-selected', tab.id === this._activeTab ? 'true' : 'false');
      btn.addEventListener('click', () => {
        this._activeTab = tab.id;
        this._render();
      });
      nav.appendChild(btn);
    }

    // Animated underline indicator
    const indicator = document.createElement('div');
    indicator.className = 'stg-tab-indicator';
    nav.appendChild(indicator);

    return nav;
  }

  _updateTabIndicator() {
    const tabsEl = this._container.querySelector('.stg-tabs');
    if (!tabsEl) return;
    const activeBtn = tabsEl.querySelector('.stg-tab--active');
    const indicator = tabsEl.querySelector('.stg-tab-indicator');
    if (!activeBtn || !indicator) return;

    const tabsRect = tabsEl.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicator.style.left = `${btnRect.left - tabsRect.left}px`;
    indicator.style.width = `${btnRect.width}px`;
  }

  // ── General tab ─────────────────────────────────────────────────

  _buildGeneral(parent) {
    // World info card
    const card = this._createCard('World Information', 'Manage your world details');
    const worldName = this._world?.name || 'My World';
    const worldDesc = this._world?.description || '';
    const worldTemplate = this._world?.template || 'starter';
    const worldCreated = this._world?.created_at || '';

    // Name input
    const nameRow = this._createRow('World Name');
    const nameInput = document.createElement('input');
    nameInput.className = 'stg-input';
    nameInput.type = 'text';
    nameInput.value = worldName;
    nameInput.placeholder = 'Enter world name...';
    nameInput.maxLength = 60;
    nameInput.addEventListener('change', async () => {
      const val = nameInput.value.trim();
      if (!val || !this._worldId) return;
      try {
        const rawDb = window.api.db;
        // Update via a setting key; the world name can also be patched directly
        await this._saveSetting('general.worldName', val);
        document.dispatchEvent(new CustomEvent('settings:worldNameChanged', { detail: { name: val } }));
      } catch (_) { /* ignore */ }
    });

    const nameWrap = document.createElement('div');
    nameWrap.className = 'stg-row-vertical';
    nameWrap.appendChild(nameRow);
    nameWrap.appendChild(nameInput);
    card.appendChild(nameWrap);

    // Description
    const descRow = this._createRow('Description');
    const descInput = document.createElement('textarea');
    descInput.className = 'stg-input stg-textarea';
    descInput.value = worldDesc;
    descInput.placeholder = 'Describe your world...';
    descInput.maxLength = 300;
    descInput.addEventListener('change', () => {
      this._saveSetting('general.description', descInput.value.trim());
    });

    const descWrap = document.createElement('div');
    descWrap.className = 'stg-row-vertical';
    descWrap.appendChild(descRow);
    descWrap.appendChild(descInput);
    card.appendChild(descWrap);

    // Template display (read-only)
    const templateRow = document.createElement('div');
    templateRow.className = 'stg-row';
    const templateLabel = document.createElement('span');
    templateLabel.className = 'stg-label';
    templateLabel.textContent = 'Template';
    const templateValue = document.createElement('span');
    templateValue.className = 'stg-value';
    templateValue.textContent = worldTemplate.charAt(0).toUpperCase() + worldTemplate.slice(1);
    templateRow.appendChild(templateLabel);
    templateRow.appendChild(templateValue);
    card.appendChild(templateRow);

    // Created date (read-only)
    const createdRow = document.createElement('div');
    createdRow.className = 'stg-row';
    const createdLabel = document.createElement('span');
    createdLabel.className = 'stg-label';
    createdLabel.textContent = 'Created';
    const createdValue = document.createElement('span');
    createdValue.className = 'stg-value';
    createdValue.textContent = formatDate(worldCreated);
    createdRow.appendChild(createdLabel);
    createdRow.appendChild(createdValue);
    card.appendChild(createdRow);

    parent.appendChild(card);
  }

  // ── AI Providers tab ────────────────────────────────────────────

  _buildProviders(parent) {
    // Connected providers
    const statusCard = this._createCard('Connected Providers', 'Manage your AI provider connections');

    const providers = Array.isArray(this._providers) ? this._providers : [];

    if (providers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'stg-sublabel';
      empty.textContent = 'No providers connected. Add API keys in the API Keys panel.';
      statusCard.appendChild(empty);
    } else {
      for (const p of providers) {
        const provEl = document.createElement('div');
        provEl.className = 'stg-provider';

        const icon = document.createElement('span');
        icon.className = 'stg-provider-icon';
        icon.textContent = p.name === 'anthropic' ? '🟣' : p.name === 'openai' ? '🟢' : '🔵';

        const info = document.createElement('div');
        info.className = 'stg-provider-info';

        const name = document.createElement('div');
        name.className = 'stg-provider-name';
        name.textContent = p.displayName || p.name;

        const status = document.createElement('div');
        status.className = 'stg-provider-status ' +
          (p.connected ? 'stg-provider-status--connected' : 'stg-provider-status--disconnected');
        status.textContent = p.connected ? 'Connected' : 'Not configured';

        info.appendChild(name);
        info.appendChild(status);
        provEl.appendChild(icon);
        provEl.appendChild(info);
        statusCard.appendChild(provEl);
      }
    }

    parent.appendChild(statusCard);

    // Model selection
    const modelCard = this._createCard('Model Configuration', 'Select your preferred AI model and parameters');

    // Provider selector
    const providerRow = document.createElement('div');
    providerRow.className = 'stg-row';
    const providerLabel = document.createElement('span');
    providerLabel.className = 'stg-label';
    providerLabel.textContent = 'Provider';
    const providerSelect = this._createSelect(
      ['anthropic', 'openai'],
      this._getSetting('ai.provider'),
      (val) => {
        this._saveSetting('ai.provider', val);
        // Reset model to first of new provider
        const models = AI_MODELS[val] || [];
        if (models.length > 0) {
          this._saveSetting('ai.model', models[0].id);
        }
        this._render();
      }
    );
    providerRow.appendChild(providerLabel);
    providerRow.appendChild(providerSelect);
    modelCard.appendChild(providerRow);

    // Model selector
    const currentProvider = this._getSetting('ai.provider');
    const models = AI_MODELS[currentProvider] || [];
    const modelRow = document.createElement('div');
    modelRow.className = 'stg-row';
    const modelLabel = document.createElement('span');
    modelLabel.className = 'stg-label';
    modelLabel.textContent = 'Model';
    const modelSelect = this._createSelect(
      models.map(m => m.id),
      this._getSetting('ai.model'),
      (val) => this._saveSetting('ai.model', val),
      models.map(m => m.label)
    );
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(modelSelect);
    modelCard.appendChild(modelRow);

    // Temperature slider
    const tempVal = this._getSettingNum('ai.temperature');
    const tempRow = this._createSliderRow('Temperature', tempVal, 0, 1, 0.1, (val) => {
      this._saveSetting('ai.temperature', val.toFixed(1));
    });
    modelCard.appendChild(tempRow);

    // Max tokens input
    const tokensRow = document.createElement('div');
    tokensRow.className = 'stg-row';
    const tokensLabel = document.createElement('span');
    tokensLabel.className = 'stg-label';
    tokensLabel.textContent = 'Max Tokens';
    const tokensInput = document.createElement('input');
    tokensInput.className = 'stg-number-input';
    tokensInput.type = 'number';
    tokensInput.min = '256';
    tokensInput.max = '128000';
    tokensInput.step = '256';
    tokensInput.value = this._getSetting('ai.maxTokens');
    tokensInput.addEventListener('change', () => {
      const v = Math.max(256, Math.min(128000, parseInt(tokensInput.value, 10) || 4096));
      tokensInput.value = v;
      this._saveSetting('ai.maxTokens', String(v));
    });
    tokensRow.appendChild(tokensLabel);
    tokensRow.appendChild(tokensInput);
    modelCard.appendChild(tokensRow);

    parent.appendChild(modelCard);
  }

  // ── Appearance tab ──────────────────────────────────────────────

  _buildAppearance(parent) {
    // Theme selector
    const themeCard = this._createCard('Theme', 'Choose your world theme');

    if (this._themeEngine) {
      const themes = this._themeEngine.list();
      const currentTheme = this._themeEngine.getCurrent();

      const grid = document.createElement('div');
      grid.className = 'stg-theme-grid';

      for (const theme of themes) {
        const card = document.createElement('button');
        card.className = 'stg-theme-card' + (theme.id === currentTheme ? ' stg-theme-card--active' : '');
        card.setAttribute('aria-label', `Apply ${theme.name} theme`);

        const emoji = document.createElement('span');
        emoji.className = 'stg-theme-emoji';
        emoji.textContent = theme.emoji;

        const name = document.createElement('span');
        name.className = 'stg-theme-name';
        name.textContent = theme.name;

        // Color swatches
        const swatches = document.createElement('div');
        swatches.className = 'stg-theme-swatches';
        const colors = theme.colors || {};
        const swatchKeys = ['--cw-bg', '--cw-accent', '--cw-accent-2', '--cw-text'];
        for (const key of swatchKeys) {
          if (colors[key]) {
            const sw = document.createElement('span');
            sw.className = 'stg-theme-swatch';
            sw.style.background = colors[key];
            swatches.appendChild(sw);
          }
        }

        card.appendChild(emoji);
        card.appendChild(name);
        card.appendChild(swatches);

        card.addEventListener('click', () => {
          this._themeEngine.apply(theme.id);
          this._saveSetting('appearance.theme', theme.id);
          this._render();
        });

        grid.appendChild(card);
      }

      themeCard.appendChild(grid);
    } else {
      const note = document.createElement('div');
      note.className = 'stg-sublabel';
      note.textContent = 'Theme engine not available. Use Cmd+Shift+T to open the theme picker.';
      themeCard.appendChild(note);
    }

    parent.appendChild(themeCard);

    // Display options
    const displayCard = this._createCard('Display', 'Customize text and motion');

    // Font size slider
    const fontSize = this._getSettingNum('appearance.fontSize') || 14;
    const fontRow = this._createSliderRow('Font Size', fontSize, 10, 20, 1, (val) => {
      this._saveSetting('appearance.fontSize', String(Math.round(val)));
      document.documentElement.style.fontSize = `${Math.round(val)}px`;
    }, 'px');
    displayCard.appendChild(fontRow);

    // Animations toggle
    const animRow = this._createToggleRow('Animations', this._getSettingBool('appearance.animations'), (val) => {
      this._saveSetting('appearance.animations', String(val));
      document.documentElement.classList.toggle('cw-no-animations', !val);
    });
    displayCard.appendChild(animRow);

    // Reduced motion toggle
    const motionRow = this._createToggleRow('Reduced Motion', this._getSettingBool('appearance.reducedMotion'), (val) => {
      this._saveSetting('appearance.reducedMotion', String(val));
      document.documentElement.classList.toggle('cw-reduced-motion', val);
    });
    displayCard.appendChild(motionRow);

    parent.appendChild(displayCard);
  }

  // ── Audio tab ───────────────────────────────────────────────────

  _buildAudio(parent) {
    const volCard = this._createCard('Volume', 'Control audio levels');

    // Master volume slider
    const masterVol = this._getSettingNum('audio.masterVolume');
    const volRow = this._createSliderRow('Master Volume', masterVol, 0, 1, 0.05, (val) => {
      this._saveSetting('audio.masterVolume', val.toFixed(2));
      document.dispatchEvent(new CustomEvent('settings:volumeChanged', { detail: { volume: val } }));
    }, '%', (v) => `${Math.round(v * 100)}%`);
    volCard.appendChild(volRow);

    // Ambient sounds toggle
    const ambientRow = this._createToggleRow('Ambient Sounds', this._getSettingBool('audio.ambient'), (val) => {
      this._saveSetting('audio.ambient', String(val));
      document.dispatchEvent(new CustomEvent('settings:ambientChanged', { detail: { enabled: val } }));
    });
    volCard.appendChild(ambientRow);

    // Notification sounds toggle
    const notifRow = this._createToggleRow('Notification Sounds', this._getSettingBool('audio.notifications'), (val) => {
      this._saveSetting('audio.notifications', String(val));
    });
    volCard.appendChild(notifRow);

    parent.appendChild(volCard);

    // Sound preview
    const previewCard = this._createCard('Sound Preview', 'Test synthesized notification sounds');

    const soundGrid = document.createElement('div');
    soundGrid.className = 'stg-sound-grid';

    for (const sound of SYNTH_SOUNDS) {
      const btn = document.createElement('button');
      btn.className = 'stg-sound-btn';
      btn.setAttribute('aria-label', `Play ${sound.label} sound`);

      const icon = document.createElement('span');
      icon.className = 'stg-sound-btn-icon';
      icon.textContent = sound.icon;

      const label = document.createElement('span');
      label.textContent = sound.label;

      btn.appendChild(icon);
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        const vol = this._getSettingNum('audio.masterVolume');
        playSynthTone(sound.freq, sound.dur, vol);
      });

      soundGrid.appendChild(btn);
    }

    previewCard.appendChild(soundGrid);
    parent.appendChild(previewCard);
  }

  // ── Privacy tab ─────────────────────────────────────────────────

  _buildPrivacy(parent) {
    // Data storage info
    const storageCard = this._createCard('Data Storage', 'Your data is stored locally on this machine');

    const pathRow = document.createElement('div');
    pathRow.className = 'stg-row';
    const pathLabel = document.createElement('span');
    pathLabel.className = 'stg-label';
    pathLabel.textContent = 'Storage Location';
    const pathValue = document.createElement('span');
    pathValue.className = 'stg-value';
    pathValue.textContent = 'Local SQLite database';
    pathValue.title = 'All world data is stored in a local SQLite file';
    pathRow.appendChild(pathLabel);
    pathRow.appendChild(pathValue);
    storageCard.appendChild(pathRow);

    parent.appendChild(storageCard);

    // Export/Import
    const exportCard = this._createCard('Data Management', 'Export or import your world data');

    const exportBtn = document.createElement('button');
    exportBtn.className = 'stg-btn stg-btn--primary';
    exportBtn.textContent = '📦 Export World as JSON';
    exportBtn.addEventListener('click', () => this._exportWorld());

    const importBtn = document.createElement('button');
    importBtn.className = 'stg-btn';
    importBtn.textContent = '📥 Import World from JSON';
    importBtn.addEventListener('click', () => this._importWorld());

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.flexWrap = 'wrap';
    btnRow.appendChild(exportBtn);
    btnRow.appendChild(importBtn);
    exportCard.appendChild(btnRow);

    parent.appendChild(exportCard);

    // Danger zone
    const dangerZone = document.createElement('div');
    dangerZone.className = 'stg-danger-zone';

    const dangerTitle = document.createElement('h3');
    dangerTitle.className = 'stg-card-title';
    dangerTitle.textContent = 'Danger Zone';

    const dangerDesc = document.createElement('p');
    dangerDesc.className = 'stg-card-desc';
    dangerDesc.textContent = 'These actions are irreversible. Proceed with caution.';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'stg-btn stg-btn--danger';
    deleteBtn.textContent = '🗑️ Delete This World';
    deleteBtn.addEventListener('click', () => this._confirmDeleteWorld());

    dangerZone.appendChild(dangerTitle);
    dangerZone.appendChild(dangerDesc);
    dangerZone.appendChild(deleteBtn);

    parent.appendChild(dangerZone);
  }

  // ── About tab ───────────────────────────────────────────────────

  _buildAbout(parent) {
    const infoCard = this._createCard('Application', 'Claude World — AI-native operating system');

    const info = this._appInfo || { version: '—', electron: '—', node: '—', chrome: '—' };

    const rows = [
      ['App Version',     info.version],
      ['Electron',        info.electron],
      ['Node.js',         info.node],
      ['Chrome',          info.chrome],
    ];

    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'stg-about-row';
      const l = document.createElement('span');
      l.className = 'stg-about-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'stg-about-value';
      v.textContent = value || '—';
      row.appendChild(l);
      row.appendChild(v);
      infoCard.appendChild(row);
    }

    parent.appendChild(infoCard);

    // Credits
    const creditsCard = this._createCard('Credits', 'Built with care');

    const credits = [
      'Claude World is an AI-native OS experience.',
      'Built with Electron, Canvas, and SQLite.',
      'Powered by Claude from Anthropic.',
    ];

    for (const line of credits) {
      const p = document.createElement('p');
      p.className = 'stg-sublabel';
      p.textContent = line;
      p.style.margin = '0';
      creditsCard.appendChild(p);
    }

    // Links
    const linksRow = document.createElement('div');
    linksRow.style.display = 'flex';
    linksRow.style.gap = '16px';
    linksRow.style.marginTop = '4px';

    const ghLink = document.createElement('a');
    ghLink.className = 'stg-link';
    ghLink.textContent = 'GitHub Repository';
    ghLink.href = '#';
    ghLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('settings:openExternal', {
        detail: { url: 'https://github.com/anthropics/claude-world' },
      }));
    });

    const docsLink = document.createElement('a');
    docsLink.className = 'stg-link';
    docsLink.textContent = 'Documentation';
    docsLink.href = '#';
    docsLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('settings:openExternal', {
        detail: { url: 'https://docs.claude.world' },
      }));
    });

    linksRow.appendChild(ghLink);
    linksRow.appendChild(docsLink);
    creditsCard.appendChild(linksRow);

    parent.appendChild(creditsCard);
  }

  // ── Actions ─────────────────────────────────────────────────────

  async _exportWorld() {
    if (!this._worldId) return;
    try {
      const data = await window.api.db.exportWorld(this._worldId);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claude-world-${this._worldId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { message: 'World exported successfully', type: 'success' },
      }));
    } catch (err) {
      console.error('[settings] Export failed:', err);
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { message: 'Export failed: ' + err.message, type: 'error' },
      }));
    }
  }

  async _importWorld() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          document.dispatchEvent(new CustomEvent('settings:importWorld', { detail: { data } }));
          document.dispatchEvent(new CustomEvent('toast:show', {
            detail: { message: 'World data imported. Restart may be required.', type: 'success' },
          }));
        } catch (parseErr) {
          document.dispatchEvent(new CustomEvent('toast:show', {
            detail: { message: 'Invalid JSON file', type: 'error' },
          }));
        }
      });
      input.click();
    } catch (err) {
      console.error('[settings] Import failed:', err);
    }
  }

  _confirmDeleteWorld() {
    const overlay = document.createElement('div');
    overlay.className = 'stg-confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'stg-confirm-dialog';

    const title = document.createElement('div');
    title.className = 'stg-confirm-title';
    title.textContent = 'Delete World';

    const body = document.createElement('div');
    body.className = 'stg-confirm-body';
    body.textContent = 'This will permanently delete this world and all its data. This action cannot be undone. Are you sure?';

    const actions = document.createElement('div');
    actions.className = 'stg-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'stg-btn stg-btn--ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'stg-btn stg-btn--danger';
    confirmBtn.textContent = 'Delete Permanently';
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      document.dispatchEvent(new CustomEvent('settings:deleteWorld', {
        detail: { worldId: this._worldId },
      }));
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ── UI component builders ───────────────────────────────────────

  _createCard(title, description) {
    const card = document.createElement('div');
    card.className = 'stg-card';

    const h = document.createElement('h3');
    h.className = 'stg-card-title';
    h.textContent = title;
    card.appendChild(h);

    if (description) {
      const d = document.createElement('p');
      d.className = 'stg-card-desc';
      d.textContent = description;
      card.appendChild(d);
    }

    return card;
  }

  _createRow(labelText) {
    const row = document.createElement('div');
    row.className = 'stg-row';
    const label = document.createElement('span');
    label.className = 'stg-label';
    label.textContent = labelText;
    row.appendChild(label);
    return row;
  }

  _createSelect(options, currentValue, onChange, labels) {
    const select = document.createElement('select');
    select.className = 'stg-select';

    for (let i = 0; i < options.length; i++) {
      const opt = document.createElement('option');
      opt.value = options[i];
      opt.textContent = labels ? labels[i] : options[i];
      if (options[i] === currentValue) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  _createToggleRow(labelText, checked, onChange) {
    const row = document.createElement('div');
    row.className = 'stg-row';

    const label = document.createElement('span');
    label.className = 'stg-label';
    label.textContent = labelText;

    const toggle = document.createElement('label');
    toggle.className = 'stg-toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));

    const track = document.createElement('span');
    track.className = 'stg-toggle-track';

    toggle.appendChild(input);
    toggle.appendChild(track);

    row.appendChild(label);
    row.appendChild(toggle);
    return row;
  }

  _createSliderRow(labelText, value, min, max, step, onChange, unit, formatFn) {
    const row = document.createElement('div');
    row.className = 'stg-row-vertical';

    const header = document.createElement('div');
    header.className = 'stg-row';
    const label = document.createElement('span');
    label.className = 'stg-label';
    label.textContent = labelText;
    header.appendChild(label);
    row.appendChild(header);

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'stg-slider-wrap';

    const slider = document.createElement('input');
    slider.className = 'stg-slider';
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);

    const valDisplay = document.createElement('span');
    valDisplay.className = 'stg-slider-value';
    valDisplay.textContent = formatFn ? formatFn(value) : `${value}${unit || ''}`;

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valDisplay.textContent = formatFn ? formatFn(v) : `${v}${unit || ''}`;
      onChange(v);
    });

    sliderWrap.appendChild(slider);
    sliderWrap.appendChild(valDisplay);
    row.appendChild(sliderWrap);
    return row;
  }

  // ── Styles injection ────────────────────────────────────────────

  _injectStyles() {
    if (this._styleInjected) return;
    if (document.getElementById('settings-panel-styles')) {
      this._styleInjected = true;
      return;
    }

    // Load the CSS file via a link element
    const link = document.createElement('link');
    link.id = 'settings-panel-styles';
    link.rel = 'stylesheet';
    link.href = new URL('./settings.css', import.meta.url).href;
    document.head.appendChild(link);
    this._styleInjected = true;
  }
}

// ── Builder function (matches panel pattern) ────────────────────

/**
 * Build the Settings panel zone content.
 * Returns a container element with a Settings instance attached.
 *
 * @param {object} [options]
 * @param {object}       [options.themeEngine] — ThemeEngine instance
 * @param {string|number} [options.worldId]    — world ID to load on init
 * @returns {HTMLElement}
 */
export function buildSettingsContent(options = {}) {
  const container = document.createElement('div');
  container.className = 'stg-container';

  const panel = new Settings(container, { themeEngine: options.themeEngine });

  if (options.worldId) {
    panel.init(options.worldId);
  }

  container._panel = panel;
  return container;
}
