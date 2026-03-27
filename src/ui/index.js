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
import { ShortcutManager } from './shortcuts.js';

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
    'shortcuts.css',
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
  const shortcuts = new ShortcutManager({ palette, panels });

  // ── Wire up cross-component events ────────────────────────────

  // Command palette navigation → camera pan + panel open
  document.addEventListener('command-palette:navigate', (e) => {
    const { zoneId, zoneName } = e.detail;
    panels.openZone(zoneId, zoneName);
    hud.setCurrentZone(zoneId);
  });

  // Command palette agent → open agent panel
  document.addEventListener('command-palette:agent', (e) => {
    const { agentId } = e.detail;
    panels.openAgent(agentId);
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

  return {
    palette,
    hud,
    toasts,
    panels,
    shortcuts,
    destroy() {
      palette.destroy();
      hud.destroy();
      toasts.destroy();
      panels.destroy();
      shortcuts.destroy();
    },
  };
}

// ── Auto-init if loaded as a script tag ─────────────────────────
// (For quick testing in Electron without a bundler)
if (typeof window !== 'undefined' && window.__CLAUDE_WORLD_AUTO_INIT_UI) {
  window.__claudeWorldUI = initUI({ cssBasePath: window.__CLAUDE_WORLD_CSS_PATH || '' });
}
