/**
 * IncidentPanel — slide-up panel that displays incident reports.
 *
 * Usage:
 *   const panel = new IncidentPanel();
 *   panel.mount(document.body);
 *   panel.loadIncidents(worldId);
 *
 * The panel auto-shows whenever the 'incident:filed' DOM event fires.
 * It can also be toggled programmatically via panel.show() / panel.hide().
 */

/** Map severity value -> display label + dot character */
const SEVERITY_META = {
  critical: { label: 'CRIT', dot: '🔴' },
  high:     { label: 'HIGH', dot: '🟠' },
  warning:  { label: 'WARN', dot: '🟡' },
  info:     { label: 'INFO', dot: '🔵' },
};

/** Human-friendly relative time (e.g. "2m ago", "just now") */
function relativeTime(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 10)  return 'just now';
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export class IncidentPanel {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;

    /** @type {Array<object>} current incident list */
    this._incidents = [];

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {HTMLElement|null} */
    this._toggleBtn = null;

    /** @type {HTMLElement|null} */
    this._badge = null;

    /** @type {HTMLElement|null} */
    this._body = null;

    // Bound listeners — kept so we can remove them on destroy.
    this._onIncidentFiled = this._handleIncidentFiled.bind(this);
  }

  // ── Mount / destroy ──────────────────────────────────────────────────

  /**
   * Create and attach the panel DOM to a parent element.
   *
   * @param {HTMLElement} [parent=document.body]
   */
  mount(parent = document.body) {
    if (this._el) return; // already mounted

    // Build panel element.
    this._el = this._buildPanel();
    parent.appendChild(this._el);

    // Build toggle button (shown in bottom bar when panel is closed).
    this._toggleBtn = this._buildToggleButton();
    parent.appendChild(this._toggleBtn);

    // Listen for newly filed incidents from any source.
    window.addEventListener('incident:filed', this._onIncidentFiled);
  }

  /** Remove all DOM nodes and event listeners. */
  destroy() {
    window.removeEventListener('incident:filed', this._onIncidentFiled);
    this._el?.remove();
    this._toggleBtn?.remove();
    this._el = null;
    this._toggleBtn = null;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Load (or reload) incidents for a world.
   *
   * @param {string} worldId
   * @param {number} [limit=20]
   */
  async loadIncidents(worldId, limit = 20) {
    this._worldId = worldId;
    this._incidents = await window.api.db.getIncidents({ worldId, limit }) || [];
    this._render();
  }

  /** Show the panel. */
  show() {
    this._el?.classList.add('incident-panel--visible');
  }

  /** Hide the panel. */
  hide() {
    this._el?.classList.remove('incident-panel--visible');
  }

  /** Toggle visibility. */
  toggle() {
    if (this._el?.classList.contains('incident-panel--visible')) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Mark an incident as resolved in the DB and re-render.
   *
   * @param {string} incidentId
   */
  async resolve(incidentId) {
    await window.api.db.updateIncident(incidentId, {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    });

    // Update local state.
    const idx = this._incidents.findIndex((i) => i.id === incidentId);
    if (idx !== -1) {
      this._incidents[idx] = {
        ...this._incidents[idx],
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      };
    }

    this._render();
  }

  // ── Event handlers ───────────────────────────────────────────────────

  /**
   * Called when a new incident is filed anywhere in the app.
   *
   * @param {CustomEvent} evt
   */
  _handleIncidentFiled(evt) {
    const incident = evt.detail;

    // Prepend so newest appears first.
    this._incidents = [incident, ...this._incidents];

    this._render();
    this.show(); // auto-reveal on new incident
  }

  // ── Rendering ────────────────────────────────────────────────────────

  /** Full re-render of the list body and badge count. */
  _render() {
    if (!this._el || !this._body) return;

    const openCount = this._incidents.filter((i) => i.status !== 'resolved').length;

    // Update badge.
    if (this._badge) {
      this._badge.textContent = String(openCount);
      this._badge.classList.toggle('incident-panel__badge--zero', openCount === 0);
    }

    // Update toggle button text.
    if (this._toggleBtn) {
      const span = this._toggleBtn.querySelector('.incident-panel-toggle__label');
      if (span) span.textContent = `Incidents (${openCount} open)`;
    }

    // Render rows.
    if (this._incidents.length === 0) {
      this._body.innerHTML =
        '<p class="incident-panel__empty">No incidents recorded.</p>';
      return;
    }

    this._body.innerHTML = '';
    for (const incident of this._incidents) {
      this._body.appendChild(this._buildRow(incident));
    }
  }

  // ── DOM builders ─────────────────────────────────────────────────────

  /** @returns {HTMLElement} */
  _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'incident-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Incident Reports');

    // Header
    const header = document.createElement('div');
    header.className = 'incident-panel__header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-label', 'Toggle incident panel');

    const title = document.createElement('div');
    title.className = 'incident-panel__title';
    title.textContent = '\u26A0\uFE0F Incidents ';

    this._badge = document.createElement('span');
    this._badge.className = 'incident-panel__badge incident-panel__badge--zero';
    this._badge.textContent = '0';
    title.appendChild(this._badge);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'incident-panel__close';
    closeBtn.setAttribute('aria-label', 'Close incident panel');
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    header.addEventListener('click', () => this.toggle());
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.toggle();
    });

    // Body
    this._body = document.createElement('div');
    this._body.className = 'incident-panel__body';
    this._body.setAttribute('role', 'list');

    panel.appendChild(header);
    panel.appendChild(this._body);

    return panel;
  }

  /**
   * Build the bottom-bar toggle button.
   * @returns {HTMLElement}
   */
  _buildToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'incident-panel-toggle';
    btn.setAttribute('aria-label', 'Show incident panel');
    btn.innerHTML =
      '\u26A0\uFE0F <span class="incident-panel-toggle__label">Incidents (0 open)</span>';
    btn.addEventListener('click', () => this.show());
    return btn;
  }

  /**
   * Build a single incident row element.
   *
   * @param {object} incident
   * @returns {HTMLElement}
   */
  _buildRow(incident) {
    const severity = (incident.severity ?? 'info').toLowerCase();
    const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
    const isResolved = incident.status === 'resolved';

    const row = document.createElement('div');
    row.className = [
      'incident-row',
      `incident-row--${severity}`,
      isResolved ? 'incident-row--resolved' : '',
    ]
      .filter(Boolean)
      .join(' ');
    row.setAttribute('role', 'listitem');
    row.dataset.incidentId = incident.id;

    // Severity pill
    const pill = document.createElement('span');
    pill.className = 'incident-row__severity';
    pill.textContent = `${meta.dot} ${meta.label}`;

    // Content
    const content = document.createElement('div');
    content.className = 'incident-row__content';

    const titleEl = document.createElement('div');
    titleEl.className = 'incident-row__title';
    titleEl.textContent = incident.title;

    const metaEl = document.createElement('div');
    metaEl.className = 'incident-row__meta';
    metaEl.textContent = relativeTime(incident.created_at);

    content.appendChild(titleEl);
    content.appendChild(metaEl);

    // Action button
    const actionBtn = document.createElement('button');
    actionBtn.className = 'incident-row__action';

    if (isResolved) {
      actionBtn.textContent = 'Resolved';
      actionBtn.disabled = true;
    } else {
      const actionLabel = severity === 'info' ? 'Dismiss' : 'Resolve';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resolve(incident.id);
      });
    }

    row.appendChild(pill);
    row.appendChild(content);
    row.appendChild(actionBtn);

    return row;
  }
}
