/**
 * index.js — UI layer entry point for Claude World
 *
 * Initializes all DOM-based UI overlays: command palette, HUD, toasts,
 * panels, and keyboard shortcuts. These render on top of the PixiJS canvas.
 *
 * Usage:
 *   import { initUI } from './ui/index.js';
 *   const ui = initUI();
 *
 *   // Later:
 *   ui.toasts.show({ type: 'success', title: 'Zone unlocked!' });
 *   ui.hud.setXP(50, 100, 2);
 *   ui.panels.openZone('dispatch', 'Dispatch Tower');
 */

import { CommandPalette } from './command-palette.js';
import { HUD } from './hud.js';
import { ToastManager } from './toasts.js';
import { PanelManager } from './panels.js';
import { AgentDialogue } from './agent-dialogue.js';
import { ShortcutManager } from './shortcuts.js';
import { QuestPanel } from './quest-panel.js';
import { ZoneTooltips } from './zone-tooltips.js';
import { SearchResults } from './search-results.js';
import { initTreasuryEvents } from '../zones/treasury.js';

/**
 * Load all UI CSS files by injecting <link> elements.
 * @param {string} basePath - Path prefix to the ui directory (e.g., '../src/ui/')
 */
function loadStyles(basePath = '') {
  const cssFiles = [
    'variables.css',
    'command-palette.css',
    'hud.css',
    'toasts.css',
    'panels.css',
    'agent-dialogue.css',
    'shortcuts.css',
    'shortcuts-overlay.css',
    'quest-panel.css',
    'zone-tooltips.css',
    'minimap.css',
    'search-results.css',
  ];

  for (const file of cssFiles) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${basePath}${file}`;
    document.head.appendChild(link);
  }
}

/**
 * Initialize the full UI layer.
 * @param {Object} [options]
 * @param {string} [options.cssBasePath] - Base path to CSS files
 * @returns {{ palette: CommandPalette, hud: HUD, toasts: ToastManager, panels: PanelManager, shortcuts: ShortcutManager, destroy: () => void }}
 */
export function initUI({ cssBasePath = '' } = {}) {
  // Load stylesheets
  loadStyles(cssBasePath);

  // Create UI components
  const palette = new CommandPalette();
  const hud = new HUD();
  const toasts = new ToastManager();
  const panels = new PanelManager();
  const agentDialogue = new AgentDialogue(panels);
  const shortcuts = new ShortcutManager({ palette, panels });
  const questPanel = new QuestPanel();
  const searchResults = new SearchResults(palette._modal);

  // ── Wire up cross-component events ────────────────────────────

  // Toast forwarding — quest engine emits toast:show, we route to the manager
  document.addEventListener('toast:show', (e) => {
    toasts.show(e.detail);
  });

  // Quest chain updates → refresh HUD quest card
  document.addEventListener('quest:chain-updated', () => {
    // The quest engine exposes toHUDData() via its singleton
    // This is picked up by whatever initializes the quest engine
  });

  // Command palette navigation → camera pan + panel open
  document.addEventListener('command-palette:navigate', (e) => {
    const { zoneId, zoneName } = e.detail;
    panels.openZone(zoneId, zoneName);
    hud.setCurrentZone(zoneId);
  });

  // Command palette agent → open rich agent dialogue panel
  // Maps agent ids to dialogue-compatible data using known agent metadata.
  const AGENT_DIALOGUE_DATA = {
    commander:  { id: 'commander',  name: 'Commander',  role: 'Dispatcher',  personality: 'Strategic',  level: 3, xp: 75, colorKey: 'dispatcher' },
    librarian:  { id: 'librarian',  name: 'Librarian',  role: 'Researcher',  personality: 'Curious',    level: 2, xp: 40, colorKey: 'researcher' },
    archivist:  { id: 'archivist',  name: 'Archivist',  role: 'Memory',      personality: 'Meticulous', level: 2, xp: 55, colorKey: 'memory' },
    instructor: { id: 'instructor', name: 'Instructor', role: 'Trainer',     personality: 'Patient',    level: 1, xp: 20, colorKey: 'trainer' },
    dockmaster: { id: 'dockmaster', name: 'Dockmaster', role: 'Integrator',  personality: 'Practical',  level: 1, xp: 10, colorKey: 'integrator' },
  };

  document.addEventListener('command-palette:agent', (e) => {
    const { agentId } = e.detail;
    const data = AGENT_DIALOGUE_DATA[agentId] || { id: agentId, name: agentId, role: 'Agent', personality: 'Adaptive', level: 1, xp: 0, colorKey: 'dispatcher' };
    agentDialogue.open(data);
  });

  // Command palette action → route actions
  document.addEventListener('command-palette:action', (e) => {
    const { action } = e.detail;
    if (action === 'settings') {
      panels.openSettings();
    }
    // Other actions emit their own events for game systems to handle
  });

  // Minimap navigation → update HUD + emit event
  document.addEventListener('hud:navigate', (e) => {
    const { zoneId } = e.detail;
    hud.setCurrentZone(zoneId);
  });

  // Treasury zone events → HUD budget indicator + toasts
  initTreasuryEvents({ hud, toasts });

  /** @type {ZoneTooltips | null} */
  let zoneTooltips = null;

  return {
    palette,
    hud,
    toasts,
    panels,
    agentDialogue,
    questPanel,
    searchResults,
    shortcuts,

    /**
     * Mount the zone tooltip system.  Call after camera and buildingManager
     * are initialised (e.g., after initWorld()).
     * @param {HTMLCanvasElement} canvas
     * @param {import('../renderer/camera.js').Camera} camera
     * @param {import('../renderer/buildings.js').BuildingManager} buildingManager
     * @returns {ZoneTooltips}
     */
    mountTooltips(canvas, camera, buildingManager) {
      if (zoneTooltips) zoneTooltips.destroy();
      zoneTooltips = new ZoneTooltips(canvas, camera, buildingManager);
      zoneTooltips.enable();
      return zoneTooltips;
    },

    destroy() {
      if (zoneTooltips) zoneTooltips.destroy();
      palette.destroy();
      hud.destroy();
      toasts.destroy();
      panels.destroy();
      questPanel.destroy();
      searchResults.destroy();
      shortcuts.destroy();
    },
  };
}

// ── Auto-init if loaded as a script tag ─────────────────────────
// (For quick testing in Electron without a bundler)
if (typeof window !== 'undefined' && window.__CLAUDE_WORLD_AUTO_INIT_UI) {
  window.__claudeWorldUI = initUI({ cssBasePath: window.__CLAUDE_WORLD_CSS_PATH || '' });
}
