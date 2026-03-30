/**
 * calendar.js — Calendar / Scheduler zone
 *
 * Month, week, and day views with colored event types, drag-to-reschedule,
 * a mini month selector, and an add-event modal with recurrence support.
 *
 * Vanilla JS + CSS. Pairs with calendar.css.
 */

// ── Helpers ───────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayName(d, short = false) {
  return d.toLocaleDateString("en-US", { weekday: short ? "short" : "long" });
}

function monthName(d) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ── Event type config ────────────────────────────────────────────────

const EVENT_TYPES = [
  { key: "task", label: "Task", color: "var(--accent-blue)", hex: "#4a9eff" },
  {
    key: "quest",
    label: "Quest Deadline",
    color: "var(--accent-amber)",
    hex: "#ffb84a",
  },
  {
    key: "snapshot",
    label: "Snapshot",
    color: "var(--accent-purple)",
    hex: "#a855f7",
  },
  {
    key: "automation",
    label: "Automation",
    color: "var(--accent-green)",
    hex: "#4aff8a",
  },
  {
    key: "milestone",
    label: "Milestone",
    color: "var(--accent-gold)",
    hex: "#ffd700",
  },
];

const EVENT_TYPE_MAP = Object.fromEntries(EVENT_TYPES.map((t) => [t.key, t]));

const RECURRENCE_OPTIONS = [
  { key: "none", label: "None" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_MINI = ["S", "M", "T", "W", "T", "F", "S"];

const HOUR_START = 8;
const HOUR_END = 22;

// ── Calendar class ───────────────────────────────────────────────────

export class Calendar {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;
    /** @type {Array<object>} */
    this._events = [];
    /** @type {HTMLElement|null} */
    this._el = null;

    // View state
    this._view = "month"; // month | week | day
    this._viewDate = new Date(); // "cursor" date for navigation
    this._selectedDate = new Date(); // currently selected day
    this._today = new Date();

    // Mini calendar offset (independent navigation)
    this._miniDate = new Date();

    // Drag state
    this._dragEventId = null;

    // DOM refs
    this._mainEl = null;
    this._detailEl = null;
    this._modalOverlay = null;
    this._navLabel = null;
    this._miniGrid = null;
    this._miniLabel = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    if (document.getElementById("calendar-styles")) return;
    const link = document.createElement("link");
    link.id = "calendar-styles";
    link.rel = "stylesheet";
    link.href = "../zones/calendar.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build and return the root DOM element.
   * @returns {HTMLElement}
   */
  render() {
    this._injectCSS();

    this._el = this._mk("div", "calendar");
    this._el.setAttribute("role", "region");
    this._el.setAttribute("aria-label", "Calendar");

    this._el.appendChild(this._buildHeader());
    this._el.appendChild(this._buildNav());

    // Body: sidebar + main grid + detail panel
    const body = this._mk("div", "cal-body");

    body.appendChild(this._buildSidebar());

    this._mainEl = this._mk("div", "cal-main");
    body.appendChild(this._mainEl);

    this._detailEl = this._mk("div", "cal-detail");
    this._detailEl.hidden = true;
    body.appendChild(this._detailEl);

    this._el.appendChild(body);

    // Modal overlay (hidden)
    this._modalOverlay = this._buildModal();
    this._el.appendChild(this._modalOverlay);

    return this._el;
  }

  /**
   * Load events from DB for the given world and refresh the UI.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    this._events = await this._dbGetEvents(worldId);
    this._refresh();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Database helpers
  // ═══════════════════════════════════════════════════════════════════

  async _dbGetEvents(worldId) {
    try {
      if (window.api?.db?.getCalendarEvents) {
        return (await window.api.db.getCalendarEvents(worldId)) || [];
      }
      if (window.api?.db?.all) {
        return (
          (await window.api.db.all(
            "SELECT * FROM calendar_events WHERE world_id = ? ORDER BY event_date ASC, start_time ASC",
            [worldId],
          )) || []
        );
      }
    } catch (err) {
      console.warn("[Calendar] Failed to load events:", err);
    }
    return [];
  }

  async _dbCreateEvent(data) {
    try {
      if (window.api?.db?.createCalendarEvent) {
        return await window.api.db.createCalendarEvent(this._worldId, data);
      }
      if (window.api?.db?.run) {
        const id = generateId();
        await window.api.db.run(
          `INSERT INTO calendar_events (id, world_id, title, description, event_type, event_date, start_time, end_time, all_day, recurrence, recurrence_end)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            this._worldId,
            data.title,
            data.description || "",
            data.event_type || "task",
            data.event_date,
            data.start_time || null,
            data.end_time || null,
            data.all_day ? 1 : 0,
            data.recurrence || "none",
            data.recurrence_end || null,
          ],
        );
        return {
          id,
          ...data,
          world_id: this._worldId,
          created_at: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.error("[Calendar] Failed to create event:", err);
    }
    return {
      id: generateId(),
      ...data,
      world_id: this._worldId,
      created_at: new Date().toISOString(),
    };
  }

  async _dbUpdateEvent(eventId, updates) {
    try {
      if (window.api?.db?.updateCalendarEvent) {
        return await window.api.db.updateCalendarEvent(eventId, updates);
      }
      if (window.api?.db?.run) {
        const allowed = [
          "title",
          "description",
          "event_type",
          "event_date",
          "start_time",
          "end_time",
          "all_day",
          "recurrence",
          "recurrence_end",
        ];
        const fields = Object.keys(updates).filter((k) => allowed.includes(k));
        if (fields.length === 0) return;
        const sets = fields.map((f) => `${f} = ?`).join(", ");
        const vals = fields.map((f) => updates[f]);
        await window.api.db.run(
          `UPDATE calendar_events SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
          [...vals, eventId],
        );
      }
    } catch (err) {
      console.error("[Calendar] Failed to update event:", err);
    }
  }

  async _dbDeleteEvent(eventId) {
    try {
      if (window.api?.db?.deleteCalendarEvent) {
        return await window.api.db.deleteCalendarEvent(eventId);
      }
      if (window.api?.db?.run) {
        await window.api.db.run("DELETE FROM calendar_events WHERE id = ?", [
          eventId,
        ]);
      }
    } catch (err) {
      console.error("[Calendar] Failed to delete event:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event query helpers
  // ═══════════════════════════════════════════════════════════════════

  /** Get events for a single date string YYYY-MM-DD, including recurring. */
  _eventsForDate(dateStr) {
    const target = parseDate(dateStr);
    return this._events.filter((ev) => {
      if (ev.event_date === dateStr) return true;
      if (ev.recurrence === "none") return false;
      const start = parseDate(ev.event_date);
      if (target < start) return false;
      if (ev.recurrence_end && target > parseDate(ev.recurrence_end))
        return false;

      if (ev.recurrence === "daily") return true;
      if (ev.recurrence === "weekly") {
        return target.getDay() === start.getDay();
      }
      if (ev.recurrence === "monthly") {
        return target.getDate() === start.getDate();
      }
      return false;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _buildHeader() {
    const header = this._mk("header", "cal-header");

    const left = this._mk("div", "cal-header__left");
    const title = this._mk("h2", "cal-header__title");
    title.textContent = "Calendar";
    const sub = this._mk("span", "cal-header__subtitle");
    sub.textContent = "Schedule events, track deadlines, plan ahead.";
    left.appendChild(title);
    left.appendChild(sub);

    const right = this._mk("div", "cal-header__right");

    // View tabs
    const tabs = this._mk("div", "cal-view-tabs");
    for (const v of ["month", "week", "day"]) {
      const btn = this._mk(
        "button",
        `cal-view-tab${this._view === v ? " cal-view-tab--active" : ""}`,
      );
      btn.textContent = v.charAt(0).toUpperCase() + v.slice(1);
      btn.dataset.view = v;
      btn.addEventListener("click", () => this._switchView(v));
      tabs.appendChild(btn);
    }
    right.appendChild(tabs);

    // Add Event button
    const addBtn = this._mk("button", "cal-add-btn");
    addBtn.textContent = "+ Add Event";
    addBtn.addEventListener("click", () => this._openModal());
    right.appendChild(addBtn);

    header.appendChild(left);
    header.appendChild(right);
    return header;
  }

  _buildNav() {
    const nav = this._mk("div", "cal-nav");

    const prev = this._mk("button", "cal-nav__arrow");
    prev.innerHTML = "&#8249;";
    prev.addEventListener("click", () => this._navigate(-1));

    const next = this._mk("button", "cal-nav__arrow");
    next.innerHTML = "&#8250;";
    next.addEventListener("click", () => this._navigate(1));

    this._navLabel = this._mk("span", "cal-nav__label");

    const todayBtn = this._mk("button", "cal-nav__today");
    todayBtn.textContent = "Today";
    todayBtn.addEventListener("click", () => {
      this._viewDate = new Date();
      this._selectedDate = new Date();
      this._refresh();
    });

    nav.appendChild(prev);
    nav.appendChild(this._navLabel);
    nav.appendChild(next);
    nav.appendChild(todayBtn);
    return nav;
  }

  _buildSidebar() {
    const sidebar = this._mk("div", "cal-sidebar");
    sidebar.appendChild(this._buildMiniCalendar());
    sidebar.appendChild(this._buildLegend());
    return sidebar;
  }

  _buildMiniCalendar() {
    const mini = this._mk("div", "cal-mini");

    const header = this._mk("div", "cal-mini__header");
    const prev = this._mk("button", "cal-mini__arrow");
    prev.innerHTML = "&#8249;";
    prev.addEventListener("click", () => {
      this._miniDate.setMonth(this._miniDate.getMonth() - 1);
      this._renderMiniCalendar();
    });
    const next = this._mk("button", "cal-mini__arrow");
    next.innerHTML = "&#8250;";
    next.addEventListener("click", () => {
      this._miniDate.setMonth(this._miniDate.getMonth() + 1);
      this._renderMiniCalendar();
    });
    this._miniLabel = this._mk("span", "cal-mini__label");
    header.appendChild(prev);
    header.appendChild(this._miniLabel);
    header.appendChild(next);
    mini.appendChild(header);

    this._miniGrid = this._mk("div", "cal-mini__grid");
    mini.appendChild(this._miniGrid);

    return mini;
  }

  _renderMiniCalendar() {
    this._miniLabel.textContent = this._miniDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });

    this._miniGrid.innerHTML = "";

    // Day of week headers
    for (const d of DOW_MINI) {
      const el = this._mk("span", "cal-mini__dow");
      el.textContent = d;
      this._miniGrid.appendChild(el);
    }

    const year = this._miniDate.getFullYear();
    const month = this._miniDate.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    // Previous month fill
    for (let i = startDay - 1; i >= 0; i--) {
      const el = this._mk("span", "cal-mini__day cal-mini__day--other");
      el.textContent = daysInPrev - i;
      this._miniGrid.appendChild(el);
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = formatDate(date);
      const isToday = sameDay(date, this._today);
      const isSelected = sameDay(date, this._selectedDate);
      const hasEvents = this._eventsForDate(dateStr).length > 0;

      let cls = "cal-mini__day";
      if (isToday) cls += " cal-mini__day--today";
      if (isSelected) cls += " cal-mini__day--selected";
      if (hasEvents) cls += " cal-mini__day--has-events";

      const el = this._mk("span", cls);
      el.textContent = d;
      el.addEventListener("click", () => {
        this._selectedDate = new Date(year, month, d);
        this._viewDate = new Date(year, month, d);
        this._refresh();
      });
      this._miniGrid.appendChild(el);
    }

    // Next month fill
    const totalCells = startDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const el = this._mk("span", "cal-mini__day cal-mini__day--other");
      el.textContent = d;
      this._miniGrid.appendChild(el);
    }
  }

  _buildLegend() {
    const legend = this._mk("div", "cal-legend");
    const title = this._mk("div", "cal-legend__title");
    title.textContent = "Event Types";
    legend.appendChild(title);

    for (const t of EVENT_TYPES) {
      const item = this._mk("div", "cal-legend__item");
      const dot = this._mk("span", "cal-legend__dot");
      dot.style.background = t.color;
      const label = this._mk("span", "");
      label.textContent = t.label;
      item.appendChild(dot);
      item.appendChild(label);
      legend.appendChild(item);
    }
    return legend;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Modal — Add / Edit Event
  // ═══════════════════════════════════════════════════════════════════

  _buildModal() {
    const overlay = this._mk("div", "cal-modal-overlay");
    overlay.hidden = true;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closeModal();
    });

    const modal = this._mk("div", "cal-modal");

    // Header
    const header = this._mk("div", "cal-modal__header");
    const title = this._mk("span", "cal-modal__title");
    title.textContent = "Add Event";
    const closeBtn = this._mk("button", "cal-modal__close");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => this._closeModal());
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = this._mk("div", "cal-modal__body");

    // Title
    body.appendChild(
      this._modalField("Title", () => {
        const inp = this._mk("input", "cal-modal__input");
        inp.type = "text";
        inp.placeholder = "Event title...";
        inp.id = "cal-modal-title";
        return inp;
      }),
    );

    // Description
    body.appendChild(
      this._modalField("Description", () => {
        const ta = document.createElement("textarea");
        ta.className = "cal-modal__textarea";
        ta.placeholder = "Optional description...";
        ta.id = "cal-modal-desc";
        return ta;
      }),
    );

    // Date + Type row
    const row1 = this._mk("div", "cal-modal__row");
    row1.appendChild(
      this._modalField("Date", () => {
        const inp = this._mk("input", "cal-modal__input");
        inp.type = "date";
        inp.id = "cal-modal-date";
        return inp;
      }),
    );
    row1.appendChild(
      this._modalField("Type", () => {
        const sel = document.createElement("select");
        sel.className = "cal-modal__select";
        sel.id = "cal-modal-type";
        for (const t of EVENT_TYPES) {
          const opt = document.createElement("option");
          opt.value = t.key;
          opt.textContent = t.label;
          sel.appendChild(opt);
        }
        return sel;
      }),
    );
    body.appendChild(row1);

    // Time row
    const row2 = this._mk("div", "cal-modal__row");
    row2.appendChild(
      this._modalField("Start Time", () => {
        const inp = this._mk("input", "cal-modal__input");
        inp.type = "time";
        inp.id = "cal-modal-start";
        return inp;
      }),
    );
    row2.appendChild(
      this._modalField("End Time", () => {
        const inp = this._mk("input", "cal-modal__input");
        inp.type = "time";
        inp.id = "cal-modal-end";
        return inp;
      }),
    );
    body.appendChild(row2);

    // Recurrence
    body.appendChild(
      this._modalField("Recurrence", () => {
        const sel = document.createElement("select");
        sel.className = "cal-modal__select";
        sel.id = "cal-modal-recurrence";
        for (const r of RECURRENCE_OPTIONS) {
          const opt = document.createElement("option");
          opt.value = r.key;
          opt.textContent = r.label;
          sel.appendChild(opt);
        }
        return sel;
      }),
    );

    modal.appendChild(body);

    // Footer
    const footer = this._mk("div", "cal-modal__footer");
    const cancelBtn = this._mk(
      "button",
      "cal-modal__btn cal-modal__btn--secondary",
    );
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this._closeModal());
    const saveBtn = this._mk(
      "button",
      "cal-modal__btn cal-modal__btn--primary",
    );
    saveBtn.textContent = "Save Event";
    saveBtn.addEventListener("click", () => this._saveModalEvent());
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    return overlay;
  }

  _modalField(label, buildInput) {
    const field = this._mk("div", "cal-modal__field");
    const lbl = this._mk("label", "cal-modal__label");
    lbl.textContent = label;
    field.appendChild(lbl);
    field.appendChild(buildInput());
    return field;
  }

  _openModal(prefillDate) {
    this._modalOverlay.hidden = false;
    const dateInput = this._modalOverlay.querySelector("#cal-modal-date");
    if (dateInput) {
      dateInput.value = prefillDate || formatDate(this._selectedDate);
    }
    const titleInput = this._modalOverlay.querySelector("#cal-modal-title");
    if (titleInput) {
      titleInput.value = "";
      titleInput.focus();
    }
    const descInput = this._modalOverlay.querySelector("#cal-modal-desc");
    if (descInput) descInput.value = "";
    const startInput = this._modalOverlay.querySelector("#cal-modal-start");
    if (startInput) startInput.value = "";
    const endInput = this._modalOverlay.querySelector("#cal-modal-end");
    if (endInput) endInput.value = "";
    const typeSelect = this._modalOverlay.querySelector("#cal-modal-type");
    if (typeSelect) typeSelect.value = "task";
    const recSelect = this._modalOverlay.querySelector("#cal-modal-recurrence");
    if (recSelect) recSelect.value = "none";
  }

  _closeModal() {
    this._modalOverlay.hidden = true;
  }

  async _saveModalEvent() {
    const title = this._modalOverlay
      .querySelector("#cal-modal-title")
      ?.value?.trim();
    if (!title) return;
    const data = {
      title,
      description:
        this._modalOverlay.querySelector("#cal-modal-desc")?.value?.trim() ||
        "",
      event_date:
        this._modalOverlay.querySelector("#cal-modal-date")?.value ||
        formatDate(this._selectedDate),
      event_type:
        this._modalOverlay.querySelector("#cal-modal-type")?.value || "task",
      start_time:
        this._modalOverlay.querySelector("#cal-modal-start")?.value || null,
      end_time:
        this._modalOverlay.querySelector("#cal-modal-end")?.value || null,
      all_day: !this._modalOverlay.querySelector("#cal-modal-start")?.value,
      recurrence:
        this._modalOverlay.querySelector("#cal-modal-recurrence")?.value ||
        "none",
    };

    const created = await this._dbCreateEvent(data);
    this._events.push(created);
    this._closeModal();
    this._refresh();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Detail panel (day events list)
  // ═══════════════════════════════════════════════════════════════════

  _showDetail(dateStr) {
    this._detailEl.hidden = false;
    this._detailEl.innerHTML = "";

    const header = this._mk("div", "cal-detail__header");
    const dateLabel = this._mk("span", "cal-detail__date");
    const d = parseDate(dateStr);
    dateLabel.textContent = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const closeBtn = this._mk("button", "cal-detail__close");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => {
      this._detailEl.hidden = true;
    });
    header.appendChild(dateLabel);
    header.appendChild(closeBtn);
    this._detailEl.appendChild(header);

    const list = this._mk("div", "cal-detail__list");
    const events = this._eventsForDate(dateStr);

    if (events.length === 0) {
      const empty = this._mk("div", "cal-detail__empty");
      empty.textContent = "No events this day.";
      list.appendChild(empty);
    } else {
      for (const ev of events) {
        list.appendChild(this._buildDetailEvent(ev, dateStr));
      }
    }

    this._detailEl.appendChild(list);
  }

  _buildDetailEvent(ev, dateStr) {
    const item = this._mk("div", "cal-detail__event");
    const typeInfo = EVENT_TYPE_MAP[ev.event_type] || EVENT_TYPES[0];

    const dot = this._mk("span", "cal-detail__event-dot");
    dot.style.background = typeInfo.color;

    const info = this._mk("div", "cal-detail__event-info");
    const title = this._mk("div", "cal-detail__event-title");
    title.textContent = ev.title;
    info.appendChild(title);

    if (ev.start_time) {
      const time = this._mk("div", "cal-detail__event-time");
      time.textContent =
        ev.start_time + (ev.end_time ? ` - ${ev.end_time}` : "");
      info.appendChild(time);
    }

    const typeBadge = this._mk("div", "cal-detail__event-type");
    typeBadge.textContent = typeInfo.label;
    if (ev.recurrence !== "none")
      typeBadge.textContent += ` (${ev.recurrence})`;
    info.appendChild(typeBadge);

    const delBtn = this._mk("button", "cal-detail__event-delete");
    delBtn.innerHTML = "&times;";
    delBtn.title = "Delete event";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this._dbDeleteEvent(ev.id);
      this._events = this._events.filter((e2) => e2.id !== ev.id);
      this._showDetail(dateStr);
      this._renderView();
      this._renderMiniCalendar();
    });

    item.appendChild(dot);
    item.appendChild(info);
    item.appendChild(delBtn);
    return item;
  }

  // ═══════════════════════════════════════════════════════════════════
  // View switching & navigation
  // ═══════════════════════════════════════════════════════════════════

  _switchView(view) {
    this._view = view;
    // Update tab active state
    this._el.querySelectorAll(".cal-view-tab").forEach((btn) => {
      btn.classList.toggle("cal-view-tab--active", btn.dataset.view === view);
    });
    this._refresh();
  }

  _navigate(dir) {
    if (this._view === "month") {
      this._viewDate.setMonth(this._viewDate.getMonth() + dir);
    } else if (this._view === "week") {
      this._viewDate.setDate(this._viewDate.getDate() + dir * 7);
    } else {
      this._viewDate.setDate(this._viewDate.getDate() + dir);
    }
    this._refresh();
  }

  _updateNavLabel() {
    if (this._view === "month") {
      this._navLabel.textContent = monthName(this._viewDate);
    } else if (this._view === "week") {
      const start = this._weekStart(this._viewDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      this._navLabel.textContent = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else {
      this._navLabel.textContent = this._viewDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  _weekStart(d) {
    const ws = new Date(d);
    ws.setDate(ws.getDate() - ws.getDay());
    return ws;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Full refresh
  // ═══════════════════════════════════════════════════════════════════

  _refresh() {
    this._today = new Date();
    this._updateNavLabel();
    this._renderMiniCalendar();
    this._renderView();
  }

  _renderView() {
    this._mainEl.innerHTML = "";
    if (this._view === "month") {
      this._mainEl.appendChild(this._renderMonthView());
    } else if (this._view === "week") {
      this._mainEl.appendChild(this._renderWeekView());
    } else {
      this._mainEl.appendChild(this._renderDayView());
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Month View
  // ═══════════════════════════════════════════════════════════════════

  _renderMonthView() {
    const container = this._mk("div", "cal-month");

    // Day of week row
    const dowRow = this._mk("div", "cal-month__dow-row");
    for (const d of DOW_SHORT) {
      const el = this._mk("span", "cal-month__dow");
      el.textContent = d;
      dowRow.appendChild(el);
    }
    container.appendChild(dowRow);

    // Grid
    const grid = this._mk("div", "cal-month__grid");

    const year = this._viewDate.getFullYear();
    const month = this._viewDate.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    // Calculate total rows needed
    const totalDays = startDay + daysInMonth;
    const rows = Math.ceil(totalDays / 7);

    // Previous month
    for (let i = startDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const date = new Date(year, month - 1, d);
      grid.appendChild(this._buildMonthCell(date, true));
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      grid.appendChild(this._buildMonthCell(date, false));
    }

    // Next month fill
    const remaining = rows * 7 - totalDays;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      grid.appendChild(this._buildMonthCell(date, true));
    }

    container.appendChild(grid);
    return container;
  }

  _buildMonthCell(date, isOther) {
    const dateStr = formatDate(date);
    const isToday = sameDay(date, this._today);
    const isSelected = sameDay(date, this._selectedDate);
    const events = this._eventsForDate(dateStr);

    let cls = "cal-month__cell";
    if (isOther) cls += " cal-month__cell--other";
    if (isToday) cls += " cal-month__cell--today";
    if (isSelected) cls += " cal-month__cell--selected";

    const cell = this._mk("div", cls);
    cell.dataset.date = dateStr;

    // Date number
    const dateNum = this._mk("span", "cal-month__date");
    dateNum.textContent = date.getDate();
    cell.appendChild(dateNum);

    // Event chips (show up to 3)
    const eventsContainer = this._mk("div", "cal-month__events");
    const maxChips = 3;
    for (let i = 0; i < Math.min(events.length, maxChips); i++) {
      const ev = events[i];
      const chip = this._mk(
        "div",
        `cal-month__event-chip cal-month__event-chip--${ev.event_type}`,
      );
      chip.textContent = ev.title;
      chip.dataset.eventId = ev.id;
      chip.draggable = true;

      // Drag start
      chip.addEventListener("dragstart", (e) => {
        this._dragEventId = ev.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ev.id);
        chip.style.opacity = "0.4";
      });
      chip.addEventListener("dragend", () => {
        this._dragEventId = null;
        chip.style.opacity = "";
      });

      eventsContainer.appendChild(chip);
    }
    if (events.length > maxChips) {
      const more = this._mk("span", "cal-month__more");
      more.textContent = `+${events.length - maxChips} more`;
      eventsContainer.appendChild(more);
    }
    cell.appendChild(eventsContainer);

    // Colored dots
    if (events.length > 0) {
      const dots = this._mk("div", "cal-month__dots");
      const seenTypes = new Set();
      for (const ev of events) {
        if (!seenTypes.has(ev.event_type)) {
          seenTypes.add(ev.event_type);
          const dot = this._mk(
            "span",
            `cal-month__dot cal-month__dot--${ev.event_type}`,
          );
          dots.appendChild(dot);
        }
      }
      cell.appendChild(dots);
    }

    // Click to select and show detail
    cell.addEventListener("click", () => {
      this._selectedDate = new Date(date);
      this._showDetail(dateStr);
      // Update selected styling
      this._el
        .querySelectorAll(".cal-month__cell--selected")
        .forEach((c) => c.classList.remove("cal-month__cell--selected"));
      cell.classList.add("cal-month__cell--selected");
      this._renderMiniCalendar();
    });

    // Drop target for drag
    cell.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      cell.classList.add("cal-month__cell--drag-over");
    });
    cell.addEventListener("dragleave", () => {
      cell.classList.remove("cal-month__cell--drag-over");
    });
    cell.addEventListener("drop", async (e) => {
      e.preventDefault();
      cell.classList.remove("cal-month__cell--drag-over");
      const evId = e.dataTransfer.getData("text/plain");
      if (evId) {
        await this._dbUpdateEvent(evId, { event_date: dateStr });
        const ev = this._events.find((ev2) => ev2.id === evId);
        if (ev) ev.event_date = dateStr;
        this._refresh();
      }
    });

    return cell;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Week View
  // ═══════════════════════════════════════════════════════════════════

  _renderWeekView() {
    const container = this._mk("div", "cal-week");
    const weekStart = this._weekStart(this._viewDate);

    // Header row
    const header = this._mk("div", "cal-week__header");
    header.appendChild(this._mk("div", "cal-week__header-corner"));
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const isToday = sameDay(d, this._today);
      const col = this._mk(
        "div",
        `cal-week__header-day${isToday ? " cal-week__header-day--today" : ""}`,
      );
      const num = this._mk("span", "cal-week__header-day-num");
      num.textContent = d.getDate();
      const name = this._mk("span", "cal-week__header-day-name");
      name.textContent = DOW_SHORT[d.getDay()];
      col.appendChild(num);
      col.appendChild(name);
      col.addEventListener("click", () => {
        this._selectedDate = new Date(d);
        this._viewDate = new Date(d);
        this._switchView("day");
      });
      header.appendChild(col);
    }
    container.appendChild(header);

    // Body with time slots
    const body = this._mk("div", "cal-week__body");

    // Time column
    const timeCol = this._mk("div", "cal-week__time-col");
    for (let h = HOUR_START; h <= HOUR_END; h++) {
      const label = this._mk("div", "cal-week__time-label");
      label.textContent = h <= 12 ? `${h} AM` : `${h - 12} PM`;
      if (h === 12) label.textContent = "12 PM";
      timeCol.appendChild(label);
    }
    body.appendChild(timeCol);

    // Day columns
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      const dayCol = this._mk("div", "cal-week__day-col");

      // Time slots
      for (let h = HOUR_START; h <= HOUR_END; h++) {
        const slot = this._mk("div", "cal-week__slot");
        slot.addEventListener("click", () => {
          this._selectedDate = new Date(d);
          this._openModal(dateStr);
          const startInput =
            this._modalOverlay.querySelector("#cal-modal-start");
          if (startInput) startInput.value = `${pad2(h)}:00`;
        });
        dayCol.appendChild(slot);
      }

      // Overlay events
      const events = this._eventsForDate(dateStr);
      for (const ev of events) {
        if (!ev.start_time) continue;
        const [sh, sm] = ev.start_time.split(":").map(Number);
        const [eh, em] = ev.end_time
          ? ev.end_time.split(":").map(Number)
          : [sh + 1, sm];
        if (sh < HOUR_START || sh > HOUR_END) continue;

        const topPx = (sh - HOUR_START) * 48 + (sm / 60) * 48;
        const heightPx = Math.max((((eh - sh) * 60 + (em - sm)) / 60) * 48, 20);

        const block = this._mk(
          "div",
          `cal-week__event-block cal-week__event-block--${ev.event_type}`,
        );
        block.textContent = ev.title;
        block.style.top = `${topPx}px`;
        block.style.height = `${heightPx}px`;
        block.addEventListener("click", (e) => {
          e.stopPropagation();
          this._selectedDate = new Date(d);
          this._showDetail(dateStr);
        });
        dayCol.appendChild(block);
      }

      body.appendChild(dayCol);
    }

    container.appendChild(body);
    return container;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Day View
  // ═══════════════════════════════════════════════════════════════════

  _renderDayView() {
    const container = this._mk("div", "cal-day");
    const dateStr = formatDate(this._viewDate);

    const header = this._mk("div", "cal-day__header");
    header.textContent = this._viewDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    container.appendChild(header);

    const body = this._mk("div", "cal-day__body");

    // Time column
    const timeCol = this._mk("div", "cal-day__time-col");
    for (let h = HOUR_START; h <= HOUR_END; h++) {
      const label = this._mk("div", "cal-day__time-label");
      label.textContent = h <= 12 ? `${h} AM` : `${h - 12} PM`;
      if (h === 12) label.textContent = "12 PM";
      timeCol.appendChild(label);
    }
    body.appendChild(timeCol);

    // Slot column
    const slotCol = this._mk("div", "cal-day__slot-col");
    for (let h = HOUR_START; h <= HOUR_END; h++) {
      const slot = this._mk("div", "cal-day__slot");
      slot.addEventListener("click", () => {
        this._openModal(dateStr);
        const startInput = this._modalOverlay.querySelector("#cal-modal-start");
        if (startInput) startInput.value = `${pad2(h)}:00`;
      });
      slotCol.appendChild(slot);
    }

    // Overlay events
    const events = this._eventsForDate(dateStr);
    for (const ev of events) {
      if (!ev.start_time) continue;
      const [sh, sm] = ev.start_time.split(":").map(Number);
      const [eh, em] = ev.end_time
        ? ev.end_time.split(":").map(Number)
        : [sh + 1, sm];
      if (sh < HOUR_START || sh > HOUR_END) continue;

      const topPx = (sh - HOUR_START) * 48 + (sm / 60) * 48;
      const heightPx = Math.max((((eh - sh) * 60 + (em - sm)) / 60) * 48, 24);

      const block = this._mk(
        "div",
        `cal-day__event-block cal-day__event-block--${ev.event_type}`,
      );
      block.style.top = `${topPx}px`;
      block.style.height = `${heightPx}px`;

      const titleEl = this._mk("div", "");
      titleEl.style.fontWeight = "600";
      titleEl.textContent = ev.title;
      block.appendChild(titleEl);

      if (ev.description) {
        const descEl = this._mk("div", "");
        descEl.style.fontSize = "10px";
        descEl.style.opacity = "0.7";
        descEl.textContent = ev.description;
        block.appendChild(descEl);
      }

      block.addEventListener("click", (e) => {
        e.stopPropagation();
        this._showDetail(dateStr);
      });
      slotCol.appendChild(block);
    }

    body.appendChild(slotCol);
    container.appendChild(body);
    return container;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM utility
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with a CSS class.
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _mk(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
