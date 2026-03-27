/**
 * themes.js — Claude World Theme Engine
 * Manages visual themes across the entire UI and PixiJS renderer.
 */

export const THEMES = {
  'cyber-noir': {
    name: 'Cyber Noir',
    emoji: '🌆',
    description: 'Purple neon on deep black. The original.',
    colors: {
      '--cw-bg':          '#0a0a14',
      '--cw-panel':       '#0d1117',
      '--cw-card':        '#161b22',
      '--cw-border':      '#1e2432',
      '--cw-accent':      '#7c3aed',
      '--cw-accent-2':    '#2563eb',
      '--cw-text':        '#e2e8f0',
      '--cw-text-dim':    '#64748b',
      '--cw-success':     '#10b981',
      '--cw-warning':     '#f59e0b',
      '--cw-danger':      '#ef4444',
    },
    tileColor:    0x1a1a2e,
    buildingTint: 0x7c3aed,
    skyColor:     '#0a0a14',
  },

  'solar-flare': {
    name: 'Solar Flare',
    emoji: '☀️',
    description: 'Warm amber and gold. For the optimists.',
    colors: {
      '--cw-bg':          '#0d0800',
      '--cw-panel':       '#1a1000',
      '--cw-card':        '#221600',
      '--cw-border':      '#3d2a00',
      '--cw-accent':      '#f59e0b',
      '--cw-accent-2':    '#ef4444',
      '--cw-text':        '#fef3c7',
      '--cw-text-dim':    '#92400e',
      '--cw-success':     '#84cc16',
      '--cw-warning':     '#fbbf24',
      '--cw-danger':      '#dc2626',
    },
    tileColor:    0x1a1000,
    buildingTint: 0xf59e0b,
    skyColor:     '#0d0800',
  },

  'arctic-void': {
    name: 'Arctic Void',
    emoji: '❄️',
    description: 'Ice blue on white-grey. Clean and cold.',
    colors: {
      '--cw-bg':          '#f0f4f8',
      '--cw-panel':       '#ffffff',
      '--cw-card':        '#f8fafc',
      '--cw-border':      '#e2e8f0',
      '--cw-accent':      '#0ea5e9',
      '--cw-accent-2':    '#6366f1',
      '--cw-text':        '#0f172a',
      '--cw-text-dim':    '#64748b',
      '--cw-success':     '#22c55e',
      '--cw-warning':     '#f59e0b',
      '--cw-danger':      '#ef4444',
    },
    tileColor:    0xe2e8f0,
    buildingTint: 0x0ea5e9,
    skyColor:     '#f0f4f8',
  },

  'forest-deep': {
    name: 'Deep Forest',
    emoji: '🌲',
    description: 'Rich greens and earth tones. Natural power.',
    colors: {
      '--cw-bg':          '#020b05',
      '--cw-panel':       '#041a09',
      '--cw-card':        '#072912',
      '--cw-border':      '#0d4a1e',
      '--cw-accent':      '#22c55e',
      '--cw-accent-2':    '#84cc16',
      '--cw-text':        '#dcfce7',
      '--cw-text-dim':    '#4ade80',
      '--cw-success':     '#86efac',
      '--cw-warning':     '#fbbf24',
      '--cw-danger':      '#f87171',
    },
    tileColor:    0x041a09,
    buildingTint: 0x22c55e,
    skyColor:     '#020b05',
  },

  'blood-moon': {
    name: 'Blood Moon',
    emoji: '🌑',
    description: 'Deep crimson. For the night shift.',
    colors: {
      '--cw-bg':          '#0d0005',
      '--cw-panel':       '#1a0008',
      '--cw-card':        '#260010',
      '--cw-border':      '#4a001a',
      '--cw-accent':      '#f43f5e',
      '--cw-accent-2':    '#ec4899',
      '--cw-text':        '#ffe4e6',
      '--cw-text-dim':    '#9f1239',
      '--cw-success':     '#fb7185',
      '--cw-warning':     '#fbbf24',
      '--cw-danger':      '#ff1744',
    },
    tileColor:    0x1a0008,
    buildingTint: 0xf43f5e,
    skyColor:     '#0d0005',
  },
};

export class ThemeEngine {
  constructor() {
    this._current = localStorage.getItem('cw:theme') || 'cyber-noir';
    this._listeners = [];
  }

  /**
   * Apply a theme by ID, updating CSS custom properties on :root
   * and dispatching a 'theme:changed' event for the PixiJS renderer.
   * @param {string} themeId
   */
  apply(themeId) {
    const theme = THEMES[themeId];
    if (!theme) {
      console.warn(`[ThemeEngine] Unknown theme: "${themeId}". Falling back to cyber-noir.`);
      return this.apply('cyber-noir');
    }

    const root = document.documentElement;
    for (const [key, val] of Object.entries(theme.colors)) {
      root.style.setProperty(key, val);
    }

    this._current = themeId;
    localStorage.setItem('cw:theme', themeId);

    // Notify PixiJS renderer and any other listeners
    document.dispatchEvent(
      new CustomEvent('theme:changed', {
        detail: { themeId, theme },
        bubbles: true,
      })
    );

    // Call registered listeners
    for (const fn of this._listeners) {
      try { fn(themeId, theme); } catch (e) { console.error('[ThemeEngine] listener error', e); }
    }
  }

  /**
   * Register a callback for when the theme changes.
   * @param {(themeId: string, theme: object) => void} fn
   * @returns {() => void} unsubscribe function
   */
  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  /** @returns {string} Current theme ID */
  getCurrent() {
    return this._current;
  }

  /** @returns {object|undefined} Theme definition by ID */
  getTheme(id) {
    return THEMES[id];
  }

  /** @returns {Array<{id: string, name: string, emoji: string, description: string, colors: object}>} */
  list() {
    return Object.entries(THEMES).map(([id, t]) => ({ id, ...t }));
  }
}

/**
 * Create and initialise the theme engine, applying the persisted theme immediately.
 * @returns {ThemeEngine}
 */
export function initThemes() {
  const engine = new ThemeEngine();
  engine.apply(engine.getCurrent());
  return engine;
}
