/**
 * airport.js — The Airport zone: Import/Export terminal
 *
 * Export world data (tasks, skills, agents, snapshots) to files.
 * Import .cwworld and .cwskill files. Deploy agents externally via
 * API tokens. Tracks all operations in a flight log.
 *
 * Visual identity: sky blue (#38bdf8) accent, terminal/manifest aesthetic.
 *
 * Events emitted:
 *   dispatch:task-complete — { worldId, zoneType: 'airport', success: true }
 *     Fired after a successful export.
 */

// ── Constants ─────────────────────────────────────────────────────

const ACCENT = "#38bdf8";

/** Cargo card definitions for the export manifest. */
const CARGO_CARDS = [
  {
    id: "world-snapshot",
    icon: "🌍",
    title: "World Snapshot",
    description:
      "Full world state: agents, tasks, skills, config, and history as a portable .cwworld file.",
    fileType: "cwworld",
    ext: ".cwworld",
    mimeType: "application/json",
  },
  {
    id: "skills-library",
    icon: "🧠",
    title: "Skills Library",
    description:
      "All skill templates and prompt chains exported as a portable .cwskill bundle.",
    fileType: "cwskill",
    ext: ".cwskill",
    mimeType: "application/json",
  },
  {
    id: "task-history",
    icon: "📋",
    title: "Task History",
    description:
      "Complete task history with prompts, responses, costs, and timestamps as CSV.",
    fileType: "csv",
    ext: ".csv",
    mimeType: "text/csv",
  },
  {
    id: "agent-configs",
    icon: "🤖",
    title: "Agent Configs",
    description:
      "Agent definitions, model settings, system prompts, and capability flags as JSON.",
    fileType: "json",
    ext: ".json",
    mimeType: "application/json",
  },
];

/** Accepted import MIME types / extensions. */
const ACCEPTED_TYPES = [".json", ".cwworld", ".cwskill"];

// ── Helpers ───────────────────────────────────────────────────────

/** Dispatch a custom event on document. */
function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

/** Create an element with optional class and attribute map. */
function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "textContent") {
      e.textContent = v;
      continue;
    }
    if (k === "innerHTML") {
      e.innerHTML = v;
      continue;
    }
    e.setAttribute(k, v);
  }
  return e;
}

/** Format ISO date as relative time label. */
function relativeTime(iso) {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return "—";
  }
}

/** Format ISO date as short datetime string. */
function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Format a file size (KB) for display. */
function formatSize(kb) {
  if (!kb || kb <= 0) return "—";
  if (kb < 1) return `${Math.round(kb * 1024)} B`;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/** Generate a cryptographically random hex token. */
function generateToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Trigger a file download from a string payload. */
function downloadFile(data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Estimate payload size in KB. */
function estimateSizeKb(str) {
  return new Blob([str]).size / 1024;
}

/** Show a transient toast notification. */
function showToast(message, type = "info") {
  const toast = el("div", `airport-zone__toast airport-zone__toast--${type}`, {
    textContent: message,
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity 0.3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}

// ── Safe API wrappers ─────────────────────────────────────────────

async function apiGetLog(worldId) {
  try {
    if (window.api?.db?.getAirportLog) {
      const rows = await window.api.db.getAirportLog(worldId);
      if (Array.isArray(rows)) return rows;
    }
  } catch (err) {
    console.warn("[airport] getAirportLog failed:", err);
  }
  return [];
}

async function apiCreateLog(worldId, data) {
  try {
    if (window.api?.db?.createAirportLog) {
      return await window.api.db.createAirportLog(worldId, data);
    }
  } catch (err) {
    console.warn("[airport] createAirportLog failed:", err);
  }
  return null;
}

async function apiGetToken(worldId) {
  try {
    if (window.api?.db?.getDeployToken) {
      return await window.api.db.getDeployToken(worldId);
    }
  } catch (err) {
    console.warn("[airport] getDeployToken failed:", err);
  }
  return null;
}

async function apiUpsertToken(worldId, token) {
  try {
    if (window.api?.db?.upsertDeployToken) {
      return await window.api.db.upsertDeployToken(worldId, token);
    }
  } catch (err) {
    console.warn("[airport] upsertDeployToken failed:", err);
  }
  return null;
}

async function apiGetSnapshots(worldId) {
  try {
    if (window.api?.db?.getSnapshots) {
      const rows = await window.api.db.getSnapshots(worldId);
      if (Array.isArray(rows)) return rows;
    }
  } catch (err) {
    console.warn("[airport] getSnapshots failed:", err);
  }
  return [];
}

async function apiGetTaskStats(worldId) {
  try {
    if (window.api?.db?.getTaskStats) {
      return await window.api.db.getTaskStats(worldId);
    }
  } catch (err) {
    console.warn("[airport] getTaskStats failed:", err);
  }
  return null;
}

// ── Airport class ─────────────────────────────────────────────────

export class Airport {
  constructor() {
    this._worldId = null;
    this._log = [];
    this._token = null;
    this._el = null;
    this._stylesLoaded = false;

    // DOM refs
    this._cargoGridEl = null;
    this._dropZoneEl = null;
    this._importPreview = null;
    this._tokenDisplayEl = null;
    this._tokenRevealedEl = null;
    this._curlExampleEl = null;
    this._logBodyEl = null;

    // Import state
    this._importFile = null;
    this._importParsed = null;
  }

  // ── CSS loader ─────────────────────────────────────────────────

  _loadStyles() {
    if (this._stylesLoaded) return;
    if (document.getElementById("airport-styles")) {
      this._stylesLoaded = true;
      return;
    }
    const link = document.createElement("link");
    link.id = "airport-styles";
    link.rel = "stylesheet";
    link.href = "../zones/airport.css";
    document.head.appendChild(link);
    this._stylesLoaded = true;
  }

  // ── Public: render ─────────────────────────────────────────────

  render() {
    this._loadStyles();

    const root = el("div", "airport-zone");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "The Airport — Import/Export terminal");
    this._el = root;

    // Description
    root.appendChild(
      el("div", "airport-zone__description", {
        textContent:
          "Import & export world data, deploy agents via API, and track all file operations.",
      }),
    );

    // ── Section: Export Manifest ──
    root.appendChild(this._buildSectionTitle("Export Manifest", "✈️"));
    this._cargoGridEl = el("div", "airport-zone__cargo-grid");
    this._cargoGridEl.setAttribute("role", "list");
    for (const card of CARGO_CARDS) {
      this._cargoGridEl.appendChild(this._buildCargoCard(card));
    }
    root.appendChild(this._cargoGridEl);

    // ── Section: Import Terminal ──
    root.appendChild(this._buildSectionTitle("Import Terminal", "📥"));
    root.appendChild(this._buildImportTerminal());

    // ── Section: External Access / Deploy ──
    root.appendChild(this._buildSectionTitle("External Access", "🔑"));
    root.appendChild(this._buildDeployPanel());

    // ── Section: Flight Log ──
    root.appendChild(this._buildSectionTitle("Flight Log", "🗒️"));
    root.appendChild(this._buildFlightLog());

    return root;
  }

  // ── Public: init ───────────────────────────────────────────────

  async init(worldId) {
    this._worldId = worldId;
    const [log, tokenRow] = await Promise.all([
      apiGetLog(worldId),
      apiGetToken(worldId),
    ]);
    this._log = log;
    this._token = tokenRow?.token || null;

    this._renderLog();
    this._renderToken();
  }

  // ── Section title ──────────────────────────────────────────────

  _buildSectionTitle(text, icon = "") {
    const wrap = el("div", "airport-zone__section-title");
    if (icon) {
      const iconEl = el("span", "airport-zone__section-icon", {
        textContent: icon,
      });
      wrap.appendChild(iconEl);
    }
    const label = el("span", "", { textContent: text });
    wrap.appendChild(label);
    return wrap;
  }

  // ── Export Manifest ────────────────────────────────────────────

  _buildCargoCard(card) {
    const wrap = el("div", "airport-zone__cargo-card");
    wrap.setAttribute("role", "listitem");
    wrap.dataset.cardId = card.id;

    // Top accent bar is handled via ::before in CSS

    // Header
    const header = el("div", "airport-zone__cargo-header");
    const iconEl = el("div", "airport-zone__cargo-icon", {
      textContent: card.icon,
    });
    iconEl.setAttribute("aria-hidden", "true");
    const titleEl = el("div", "airport-zone__cargo-title", {
      textContent: card.title,
    });
    header.appendChild(iconEl);
    header.appendChild(titleEl);
    wrap.appendChild(header);

    // Description
    wrap.appendChild(
      el("div", "airport-zone__cargo-desc", { textContent: card.description }),
    );

    // Meta
    const meta = el("div", "airport-zone__cargo-meta");
    const extBadge = el("span", "airport-zone__cargo-ext", {
      textContent: card.ext,
    });
    meta.appendChild(extBadge);
    wrap.appendChild(meta);

    // Export button
    const btn = el("button", "airport-zone__cargo-btn", {
      textContent: "Export",
      "aria-label": `Export ${card.title}`,
    });
    btn.addEventListener("click", () => this._handleExport(card, btn));
    wrap.appendChild(btn);

    return wrap;
  }

  async _handleExport(card, btn) {
    btn.disabled = true;
    btn.textContent = "Exporting…";
    btn.classList.add("airport-zone__cargo-btn--loading");

    try {
      const dateSlug = new Date().toISOString().slice(0, 10);
      let payload = "";
      let filename = `claude-world-${card.id}-${dateSlug}${card.ext}`;

      if (card.id === "world-snapshot") {
        payload = await this._buildWorldSnapshotPayload();
      } else if (card.id === "skills-library") {
        payload = await this._buildSkillsPayload();
      } else if (card.id === "task-history") {
        payload = await this._buildTaskCsvPayload();
      } else if (card.id === "agent-configs") {
        payload = await this._buildAgentConfigsPayload();
      }

      downloadFile(payload, filename, card.mimeType);

      const sizeKb = estimateSizeKb(payload);

      // Log the operation
      const logEntry = {
        operation: "export",
        file_type: card.fileType,
        file_name: filename,
        file_size_kb: parseFloat(sizeKb.toFixed(2)),
        status: "completed",
      };
      await apiCreateLog(this._worldId, logEntry);
      this._log.unshift({
        ...logEntry,
        id: "local-" + Date.now(),
        created_at: new Date().toISOString(),
      });
      this._renderLog();

      emit("dispatch:task-complete", {
        worldId: this._worldId,
        zoneType: "airport",
        success: true,
      });

      showToast(`${card.title} exported (${formatSize(sizeKb)})`, "success");
      btn.textContent = "✓ Done";
      setTimeout(() => {
        btn.textContent = "Export";
      }, 2500);
    } catch (err) {
      console.error("[airport] export failed:", err);
      showToast(`Export failed: ${err.message || "Unknown error"}`, "error");
      btn.textContent = "Export";
    } finally {
      btn.disabled = false;
      btn.classList.remove("airport-zone__cargo-btn--loading");
    }
  }

  async _buildWorldSnapshotPayload() {
    let snapshotData = {};
    try {
      if (window.api?.db?.saveWorldSnapshot) {
        snapshotData = await window.api.db.saveWorldSnapshot(this._worldId, {
          label: `export-${new Date().toISOString()}`,
        });
      }
    } catch {}
    const snapshots = await apiGetSnapshots(this._worldId);
    return JSON.stringify(
      {
        format: "cwworld",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        worldId: this._worldId,
        snapshots,
        snapshot: snapshotData,
      },
      null,
      2,
    );
  }

  async _buildSkillsPayload() {
    let skills = [];
    try {
      if (window.api?.db?.getSkills) {
        skills = (await window.api.db.getSkills(this._worldId)) || [];
      }
    } catch {}
    return JSON.stringify(
      {
        format: "cwskill",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        worldId: this._worldId,
        skills,
      },
      null,
      2,
    );
  }

  async _buildTaskCsvPayload() {
    let tasks = [];
    try {
      if (window.api?.db?.getRecentTasks) {
        tasks = (await window.api.db.getRecentTasks(this._worldId, 9999)) || [];
      }
    } catch {}
    const headers = [
      "id",
      "prompt",
      "response",
      "status",
      "model",
      "provider",
      "cost_usd",
      "input_tokens",
      "output_tokens",
      "created_at",
      "completed_at",
    ];
    const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = tasks.map((t) =>
      headers.map((h) => csvEscape(t[h])).join(","),
    );
    return [headers.join(","), ...rows].join("\n");
  }

  async _buildAgentConfigsPayload() {
    let agents = [];
    try {
      if (window.api?.db?.getAgents) {
        agents = (await window.api.db.getAgents(this._worldId)) || [];
      }
    } catch {}
    return JSON.stringify(
      {
        format: "agent-configs",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        worldId: this._worldId,
        agents,
      },
      null,
      2,
    );
  }

  // ── Import Terminal ────────────────────────────────────────────

  _buildImportTerminal() {
    const wrap = el("div", "airport-zone__import-wrap");

    // Drop zone
    this._dropZoneEl = el("div", "airport-zone__drop-zone");
    this._dropZoneEl.setAttribute("role", "button");
    this._dropZoneEl.setAttribute("tabindex", "0");
    this._dropZoneEl.setAttribute(
      "aria-label",
      "Drop files here or click to browse",
    );

    const dropIcon = el("div", "airport-zone__drop-icon", {
      textContent: "📂",
    });
    const dropLabel = el("div", "airport-zone__drop-label", {
      textContent: "Drop .cwworld, .cwskill, or .json file here",
    });
    const dropSub = el("div", "airport-zone__drop-sub", {
      textContent: "or click to browse",
    });

    this._dropZoneEl.appendChild(dropIcon);
    this._dropZoneEl.appendChild(dropLabel);
    this._dropZoneEl.appendChild(dropSub);
    wrap.appendChild(this._dropZoneEl);

    // Hidden file input
    const fileInput = el("input", "airport-zone__file-input");
    fileInput.type = "file";
    fileInput.accept = ACCEPTED_TYPES.join(",");
    fileInput.setAttribute("aria-hidden", "true");
    fileInput.tabIndex = -1;
    wrap.appendChild(fileInput);

    // Import preview area
    this._importPreview = el(
      "div",
      "airport-zone__import-preview airport-zone__import-preview--hidden",
    );
    wrap.appendChild(this._importPreview);

    // Wire events
    this._dropZoneEl.addEventListener("click", () => fileInput.click());
    this._dropZoneEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) this._handleFileSelected(fileInput.files[0]);
    });

    // Drag-and-drop
    this._dropZoneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      this._dropZoneEl.classList.add("airport-zone__drop-zone--drag-over");
    });
    this._dropZoneEl.addEventListener("dragleave", () => {
      this._dropZoneEl.classList.remove("airport-zone__drop-zone--drag-over");
    });
    this._dropZoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      this._dropZoneEl.classList.remove("airport-zone__drop-zone--drag-over");
      const file = e.dataTransfer.files[0];
      if (file) this._handleFileSelected(file);
    });

    return wrap;
  }

  _handleFileSelected(file) {
    const name = file.name.toLowerCase();
    const validExt = ACCEPTED_TYPES.some((ext) => name.endsWith(ext));
    if (!validExt) {
      showToast(
        `Unsupported file type. Accepted: ${ACCEPTED_TYPES.join(", ")}`,
        "error",
      );
      return;
    }

    this._importFile = file;
    this._dropZoneEl.classList.add("airport-zone__drop-zone--has-file");

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        this._importParsed = JSON.parse(evt.target.result);
        this._showImportPreview(file, this._importParsed);
      } catch {
        this._importParsed = null;
        this._showImportPreview(file, null);
      }
    };
    reader.onerror = () => {
      showToast("Failed to read file.", "error");
    };
    reader.readAsText(file);
  }

  _showImportPreview(file, parsed) {
    const preview = this._importPreview;
    preview.classList.remove("airport-zone__import-preview--hidden");
    preview.innerHTML = "";

    // File info bar
    const infoBar = el("div", "airport-zone__import-info");
    const fileNameEl = el("span", "airport-zone__import-filename", {
      textContent: file.name,
    });
    const fileSizeEl = el("span", "airport-zone__import-filesize", {
      textContent: formatSize(file.size / 1024),
    });
    const closeBtn = el("button", "airport-zone__import-close", {
      textContent: "×",
      "aria-label": "Clear selected file",
    });
    closeBtn.addEventListener("click", () => this._clearImport());
    infoBar.appendChild(fileNameEl);
    infoBar.appendChild(fileSizeEl);
    infoBar.appendChild(closeBtn);
    preview.appendChild(infoBar);

    if (!parsed) {
      preview.appendChild(
        el("div", "airport-zone__import-error", {
          textContent: "Failed to parse file. Ensure it is valid JSON.",
        }),
      );
      return;
    }

    // Parse summary
    const summaryWrap = el("div", "airport-zone__import-summary");

    const addRow = (label, value) => {
      const row = el("div", "airport-zone__import-row");
      row.appendChild(
        el("span", "airport-zone__import-label", { textContent: label }),
      );
      row.appendChild(
        el("span", "airport-zone__import-value", {
          textContent: String(value ?? "—"),
        }),
      );
      summaryWrap.appendChild(row);
    };

    addRow("Format", parsed.format || file.name.split(".").pop().toUpperCase());
    addRow("Version", parsed.version || "—");
    addRow(
      "Exported",
      parsed.exportedAt ? formatDateTime(parsed.exportedAt) : "—",
    );

    if (parsed.snapshots?.length) addRow("Snapshots", parsed.snapshots.length);
    if (parsed.skills?.length) addRow("Skills", parsed.skills.length);
    if (parsed.agents?.length) addRow("Agents", parsed.agents.length);

    preview.appendChild(summaryWrap);

    // Payload preview
    const payloadPreview = el("pre", "airport-zone__import-payload");
    const previewStr = JSON.stringify(parsed, null, 2).slice(0, 800);
    payloadPreview.textContent =
      previewStr + (JSON.stringify(parsed).length > 800 ? "\n…" : "");
    preview.appendChild(payloadPreview);

    // Import button
    const importBtn = el("button", "airport-zone__import-btn", {
      textContent: "Import",
      "aria-label": `Import ${file.name}`,
    });
    importBtn.addEventListener("click", () =>
      this._applyImport(file, parsed, importBtn),
    );
    preview.appendChild(importBtn);
  }

  async _applyImport(file, parsed, btn) {
    btn.disabled = true;
    btn.textContent = "Importing…";

    try {
      // Best-effort: call IPC handler if available
      if (parsed.format === "cwworld" && window.api?.db?.importWorldSnapshot) {
        await window.api.db.importWorldSnapshot(this._worldId, parsed);
      } else if (parsed.format === "cwskill" && window.api?.db?.importSkills) {
        await window.api.db.importSkills(this._worldId, parsed.skills || []);
      }

      const sizeKb = file.size / 1024;
      const logEntry = {
        operation: "import",
        file_type: parsed.format || file.name.split(".").pop(),
        file_name: file.name,
        file_size_kb: parseFloat(sizeKb.toFixed(2)),
        status: "completed",
      };
      await apiCreateLog(this._worldId, logEntry);
      this._log.unshift({
        ...logEntry,
        id: "local-" + Date.now(),
        created_at: new Date().toISOString(),
      });
      this._renderLog();

      showToast(`${file.name} imported successfully`, "success");
      this._clearImport();
    } catch (err) {
      console.error("[airport] import failed:", err);
      showToast(`Import failed: ${err.message || "Unknown error"}`, "error");
      btn.disabled = false;
      btn.textContent = "Import";
    }
  }

  _clearImport() {
    this._importFile = null;
    this._importParsed = null;
    if (this._importPreview) {
      this._importPreview.classList.add("airport-zone__import-preview--hidden");
      this._importPreview.innerHTML = "";
    }
    if (this._dropZoneEl) {
      this._dropZoneEl.classList.remove("airport-zone__drop-zone--has-file");
    }
  }

  // ── Deploy Panel ───────────────────────────────────────────────

  _buildDeployPanel() {
    const panel = el("div", "airport-zone__deploy-panel");

    // Token section
    const tokenSection = el("div", "airport-zone__token-section");

    const tokenLabel = el("div", "airport-zone__token-label", {
      textContent: "API Access Token",
    });
    tokenSection.appendChild(tokenLabel);

    const tokenRow = el("div", "airport-zone__token-row");
    this._tokenDisplayEl = el("div", "airport-zone__token-display");
    this._tokenDisplayEl.setAttribute("title", "Click to reveal token");

    this._tokenRevealedEl = el(
      "span",
      "airport-zone__token-value airport-zone__token-value--blurred",
      {
        textContent: this._token || "—",
      },
    );
    this._tokenDisplayEl.appendChild(this._tokenRevealedEl);
    this._tokenDisplayEl.addEventListener("click", () => {
      this._tokenRevealedEl.classList.toggle(
        "airport-zone__token-value--blurred",
      );
    });
    tokenRow.appendChild(this._tokenDisplayEl);

    // Copy button
    const copyBtn = el("button", "airport-zone__token-copy", {
      textContent: "Copy",
      "aria-label": "Copy API token to clipboard",
    });
    copyBtn.addEventListener("click", () => this._copyToken(copyBtn));
    tokenRow.appendChild(copyBtn);

    // Regenerate button
    const regenBtn = el("button", "airport-zone__token-regen", {
      textContent: "Regenerate",
      "aria-label": "Regenerate API token",
    });
    regenBtn.addEventListener("click", () => this._regenerateToken(regenBtn));
    tokenRow.appendChild(regenBtn);

    tokenSection.appendChild(tokenRow);
    panel.appendChild(tokenSection);

    // Curl example
    const curlSection = el("div", "airport-zone__curl-section");
    curlSection.appendChild(
      el("div", "airport-zone__curl-label", {
        textContent: "Example curl invocation",
      }),
    );
    this._curlExampleEl = el("pre", "airport-zone__curl-example");
    this._curlExampleEl.textContent = this._buildCurlExample(this._token);
    curlSection.appendChild(this._curlExampleEl);

    // Copy curl button
    const copyCurlBtn = el("button", "airport-zone__curl-copy", {
      textContent: "Copy curl",
      "aria-label": "Copy curl command to clipboard",
    });
    copyCurlBtn.addEventListener("click", () => this._copyCurl(copyCurlBtn));
    curlSection.appendChild(copyCurlBtn);

    panel.appendChild(curlSection);

    return panel;
  }

  _buildCurlExample(token) {
    const tok = token || "<YOUR_TOKEN>";
    return `curl -X POST https://api.claude-world.local/v1/agents/invoke \\
  -H "Authorization: Bearer ${tok}" \\
  -H "Content-Type: application/json" \\
  -d '{"worldId": "${this._worldId || "<WORLD_ID>"}", "prompt": "Hello!"}'`;
  }

  _renderToken() {
    if (!this._tokenRevealedEl) return;
    this._tokenRevealedEl.textContent = this._token || "—";
    if (this._curlExampleEl) {
      this._curlExampleEl.textContent = this._buildCurlExample(this._token);
    }
  }

  async _copyToken(btn) {
    const tok = this._token;
    if (!tok || tok === "—") {
      showToast("No token to copy. Generate one first.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(tok);
      btn.textContent = "✓ Copied";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 2000);
    } catch {
      showToast("Clipboard unavailable.", "error");
    }
  }

  async _copyCurl(btn) {
    try {
      await navigator.clipboard.writeText(
        this._curlExampleEl?.textContent || "",
      );
      btn.textContent = "✓ Copied";
      setTimeout(() => {
        btn.textContent = "Copy curl";
      }, 2000);
    } catch {
      showToast("Clipboard unavailable.", "error");
    }
  }

  async _regenerateToken(btn) {
    const confirmed = window.confirm(
      "Regenerate API token? Any services using the old token will break.",
    );
    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = "Regenerating…";

    try {
      const newToken = generateToken(32);
      await apiUpsertToken(this._worldId, newToken);
      this._token = newToken;
      this._renderToken();
      // Auto-reveal after regen
      this._tokenRevealedEl?.classList.remove(
        "airport-zone__token-value--blurred",
      );
      showToast("Token regenerated. Copy it now.", "success");
    } catch (err) {
      showToast(`Failed to regenerate: ${err.message || "Unknown"}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Regenerate";
    }
  }

  // ── Flight Log ─────────────────────────────────────────────────

  _buildFlightLog() {
    const wrap = el("div", "airport-zone__log-wrap");

    // Log header with clear button
    const header = el("div", "airport-zone__log-header");
    header.appendChild(
      el("span", "airport-zone__log-title", {
        textContent: "Recent Operations",
      }),
    );
    const clearBtn = el("button", "airport-zone__log-clear", {
      textContent: "Clear",
    });
    clearBtn.addEventListener("click", () => {
      this._log = [];
      this._renderLog();
    });
    header.appendChild(clearBtn);
    wrap.appendChild(header);

    // Table container
    const tableWrap = el("div", "airport-zone__log-table-wrap");
    const table = el("table", "airport-zone__log-table");
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", "Flight log of import/export operations");

    // Table head
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const col of ["Time", "Operation", "Type", "File", "Size", "Status"]) {
      const th = document.createElement("th");
      th.textContent = col;
      th.className = "airport-zone__log-th";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    this._logBodyEl = document.createElement("tbody");
    this._logBodyEl.className = "airport-zone__log-body";
    table.appendChild(this._logBodyEl);

    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    return wrap;
  }

  _renderLog() {
    if (!this._logBodyEl) return;
    this._logBodyEl.innerHTML = "";

    if (this._log.length === 0) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 6;
      emptyCell.className = "airport-zone__log-empty";
      emptyCell.textContent = "No operations logged yet.";
      emptyRow.appendChild(emptyCell);
      this._logBodyEl.appendChild(emptyRow);
      return;
    }

    for (const entry of this._log.slice(0, 50)) {
      const row = document.createElement("tr");
      row.className = "airport-zone__log-row";

      const addCell = (content, className = "") => {
        const td = document.createElement("td");
        td.className = `airport-zone__log-td ${className}`.trim();
        if (typeof content === "string") {
          td.textContent = content;
        } else {
          td.appendChild(content);
        }
        row.appendChild(td);
      };

      addCell(relativeTime(entry.created_at), "airport-zone__log-td--time");

      const opBadge = el(
        "span",
        `airport-zone__log-op airport-zone__log-op--${entry.operation || "export"}`,
        { textContent: (entry.operation || "export").toUpperCase() },
      );
      addCell(opBadge);
      addCell(entry.file_type || "—", "airport-zone__log-td--type");
      addCell(entry.file_name || "—", "airport-zone__log-td--file");
      addCell(formatSize(entry.file_size_kb), "airport-zone__log-td--size");

      const statusBadge = el(
        "span",
        `airport-zone__log-status airport-zone__log-status--${entry.status || "completed"}`,
        { textContent: entry.status || "completed" },
      );
      addCell(statusBadge);

      this._logBodyEl.appendChild(row);
    }
  }
}
