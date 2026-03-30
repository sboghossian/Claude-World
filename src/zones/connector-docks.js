/**
 * connector-docks.js — Connector Docks zone: API key management & provider configuration
 *
 * Renders inside the panel system. Manages API keys via window.api.keys.*
 * and displays provider health, spend tracking, and connection testing.
 *
 * Events emitted:
 *   connector-docks:key-saved      — { provider }
 *   connector-docks:key-deleted    — { provider }
 *   connector-docks:test-connection — { provider }
 */

// ── Provider definitions ─────────────────────────────────────────

const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    logo: "\u{1F52E}",
    color: "#d97706",
    defaultModel: "claude-sonnet-4-20250514",
    placeholder: "sk-ant-...",
    comingSoon: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    logo: "\u{1F916}",
    color: "#10a37f",
    defaultModel: "gpt-4o",
    placeholder: "sk-...",
    comingSoon: false,
  },
  {
    id: "google",
    name: "Google (Gemini)",
    logo: "\u2728",
    color: "#4285f4",
    defaultModel: "gemini-1.5-pro",
    placeholder: "AIza...",
    comingSoon: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    logo: "\u{1F999}",
    color: "#ffffff",
    defaultModel: "llama3",
    placeholder: "http://localhost:11434",
    comingSoon: false,
    isLocal: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    logo: "\u{1F504}",
    color: "#6366f1",
    defaultModel: "auto",
    placeholder: "sk-or-...",
    comingSoon: true,
  },
];

// ── Helpers ──────────────────────────────────────────────────────

/** Format a number as USD. */
function usd(n, decimals = 2) {
  return `$${(n || 0).toFixed(decimals)}`;
}

/** Emit a custom event on document. */
function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

/** Create an element with className and optional attributes. */
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

/** Safely call window.api.keys.list() — returns [] if unavailable. */
async function fetchKeyList() {
  try {
    if (window.api && window.api.keys && window.api.keys.list) {
      return await window.api.keys.list();
    }
  } catch (err) {
    console.warn("[connector-docks] Failed to list keys:", err);
  }
  return [];
}

// ── Build the Connector Docks content ────────────────────────────

/**
 * Build the Connector Docks panel content.
 * @param {object} [options]
 * @returns {HTMLElement}
 */
export function buildConnectorDocksContent(options = {}) {
  const root = el("div", "connector-docks");
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Connector Docks — API key management");

  // Greeting
  const greeting = el("div", "connector-docks__greeting", {
    textContent: "The docks are open. What connections shall we establish?",
  });
  root.appendChild(greeting);

  // Stats bar (populated async)
  const statsBar = el("div", "connector-docks__stats-bar");
  statsBar.setAttribute("aria-live", "polite");
  statsBar.textContent = "Loading providers\u2026";
  root.appendChild(statsBar);

  // Section title: Providers
  const providerTitle = el("div", "connector-docks__section-title", {
    textContent: "Providers",
  });
  root.appendChild(providerTitle);

  // Provider grid
  const grid = el("div", "connector-docks__grid");
  grid.setAttribute("role", "list");
  grid.setAttribute("aria-label", "Provider list");
  root.appendChild(grid);

  // Health section title
  const healthTitle = el("div", "connector-docks__section-title", {
    textContent: "Connection Health",
  });
  healthTitle.style.marginTop = "8px";
  root.appendChild(healthTitle);

  // Health dashboard (populated async)
  const healthDashboard = el("div", "connector-docks__grid");
  healthDashboard.setAttribute("role", "list");
  healthDashboard.setAttribute("aria-label", "Provider health dashboard");
  root.appendChild(healthDashboard);

  // Security notice
  const security = el("div", "connector-docks__security");
  const lockIcon = el("span", "connector-docks__security-icon", {
    textContent: "\u{1F512}",
  });
  lockIcon.setAttribute("aria-hidden", "true");
  const secText = el("span", "connector-docks__security-text", {
    textContent:
      "API keys are encrypted using your system\u2019s secure keychain. They never leave this device.",
  });
  security.appendChild(lockIcon);
  security.appendChild(secText);
  root.appendChild(security);

  // Modal container (lives inside root so it gets cleaned up with the panel)
  const modalOverlay = el("div", "connector-docks__modal-overlay");
  modalOverlay.setAttribute("role", "dialog");
  modalOverlay.setAttribute("aria-modal", "true");
  modalOverlay.setAttribute("aria-label", "Configure provider");
  root.appendChild(modalOverlay);

  // Load data and render cards
  _loadAndRender(root, grid, statsBar, healthDashboard, modalOverlay);

  return root;
}

// ── Data loading & rendering ─────────────────────────────────────

async function _loadAndRender(
  root,
  grid,
  statsBar,
  healthDashboard,
  modalOverlay,
) {
  const storedKeys = await fetchKeyList();
  const keyMap = {};
  for (const k of storedKeys) {
    keyMap[k.provider] = k;
  }

  // Stats
  const connectedCount = storedKeys.filter((k) => k.is_active).length;
  const totalSpent = storedKeys.reduce(
    (sum, k) => sum + (k.total_spent || 0),
    0,
  );
  statsBar.textContent = "";
  const statConn = el("span", null, {
    textContent: `${connectedCount} provider${connectedCount !== 1 ? "s" : ""} connected`,
  });
  const sep = el("span", "connector-docks__stats-sep", { textContent: "|" });
  const statSpend = el("span", null, {
    textContent: `${usd(totalSpent)} total spent`,
  });
  statsBar.appendChild(statConn);
  statsBar.appendChild(sep);
  statsBar.appendChild(statSpend);

  // Render provider cards
  grid.innerHTML = "";
  for (const provider of PROVIDERS) {
    const stored = keyMap[provider.id];
    const isConnected = !!(stored && stored.is_active);
    const card = _buildProviderCard(
      provider,
      stored,
      isConnected,
      modalOverlay,
      () => {
        _loadAndRender(root, grid, statsBar, healthDashboard, modalOverlay);
      },
    );
    grid.appendChild(card);
  }

  // Render health dashboard (only connected providers)
  healthDashboard.innerHTML = "";
  const connectedProviders = PROVIDERS.filter((p) => {
    const stored = keyMap[p.id];
    return stored && stored.is_active;
  });

  if (connectedProviders.length === 0) {
    const emptyHealth = el("div", null, {
      textContent: "No connected providers yet.",
    });
    emptyHealth.style.cssText =
      "font-size:12px;color:var(--text-dim);grid-column:1/-1;padding:8px 0;";
    healthDashboard.appendChild(emptyHealth);
  } else {
    for (const provider of connectedProviders) {
      const stored = keyMap[provider.id];
      healthDashboard.appendChild(_buildHealthCard(provider, stored));
    }
  }
}

// ── Provider card builder ────────────────────────────────────────

function _buildProviderCard(
  provider,
  stored,
  isConnected,
  modalOverlay,
  onRefresh,
) {
  const card = el("div", "connector-docks__card");
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", provider.name);

  if (provider.comingSoon) {
    card.classList.add("connector-docks__card--coming-soon");
    const lock = el("div", "connector-docks__card-lock");
    lock.setAttribute("aria-hidden", "true");
    lock.textContent = "\u{1F512}";
    card.appendChild(lock);
  } else if (isConnected) {
    card.classList.add("connector-docks__card--connected");
  } else {
    card.classList.add("connector-docks__card--unconfigured");
  }

  // Header row
  const header = el("div", "connector-docks__card-header");

  const logo = el("div", "connector-docks__card-logo");
  logo.style.background = provider.color + "20";
  logo.textContent = provider.logo;
  logo.setAttribute("aria-hidden", "true");

  const name = el("span", "connector-docks__card-name", {
    textContent: provider.name,
  });

  header.appendChild(logo);
  header.appendChild(name);
  card.appendChild(header);

  // Status
  const status = el("div", "connector-docks__card-status");
  if (provider.comingSoon) {
    status.classList.add("connector-docks__card-status--coming-soon");
    status.textContent = "Coming soon";
  } else if (isConnected) {
    status.classList.add("connector-docks__card-status--connected");
    status.textContent = "\u2713 Connected";
  } else {
    status.classList.add("connector-docks__card-status--not-configured");
    status.textContent = "Not configured";
  }
  card.appendChild(status);

  // Info rows
  const info = el("div", "connector-docks__card-info");

  // Model
  const modelRow = el("div", "connector-docks__card-info-row");
  modelRow.appendChild(
    el("span", "connector-docks__card-info-label", { textContent: "Model" }),
  );
  modelRow.appendChild(
    el("span", "connector-docks__card-info-value", {
      textContent: `${provider.defaultModel} (default)`,
    }),
  );
  info.appendChild(modelRow);

  // Spend (for connected only)
  if (isConnected && stored) {
    const spendRow = el("div", "connector-docks__card-info-row");
    spendRow.appendChild(
      el("span", "connector-docks__card-info-label", { textContent: "Spend" }),
    );
    spendRow.appendChild(
      el("span", "connector-docks__card-info-value", {
        textContent: `${usd(stored.total_spent)} this month`,
      }),
    );
    info.appendChild(spendRow);

    // Mini spend bar
    const bar = el("div", "connector-docks__spend-bar");
    const fill = el("div", "connector-docks__spend-bar-fill");
    const maxSpend = 10; // rough scale
    const pct = Math.min(100, ((stored.total_spent || 0) / maxSpend) * 100);
    fill.style.width = pct + "%";
    fill.style.background = provider.color;
    bar.appendChild(fill);
    info.appendChild(bar);
  }

  // Local endpoint for Ollama
  if (provider.isLocal && !provider.comingSoon) {
    const endpointRow = el("div", "connector-docks__card-info-row");
    endpointRow.appendChild(
      el("span", "connector-docks__card-info-label", {
        textContent: "Endpoint",
      }),
    );
    endpointRow.appendChild(
      el("span", "connector-docks__card-info-value", {
        textContent: "http://localhost:11434",
      }),
    );
    info.appendChild(endpointRow);
  }

  card.appendChild(info);

  // Action button
  if (!provider.comingSoon) {
    const btn = el("button", "connector-docks__card-btn");
    btn.textContent = isConnected ? "Edit" : "Configure";
    btn.setAttribute(
      "aria-label",
      `${isConnected ? "Edit" : "Configure"} ${provider.name}`,
    );
    btn.addEventListener("click", () => {
      _openConfigModal(modalOverlay, provider, stored, onRefresh);
    });
    card.appendChild(btn);
  }

  return card;
}

// ── Health card builder ──────────────────────────────────────────

function _buildHealthCard(provider, stored) {
  const card = el(
    "div",
    "connector-docks__card connector-docks__card--connected",
  );
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `${provider.name} health`);

  // Header
  const header = el("div", "connector-docks__card-header");
  const logo = el("div", "connector-docks__card-logo");
  logo.style.background = provider.color + "20";
  logo.textContent = provider.logo;
  logo.setAttribute("aria-hidden", "true");
  const name = el("span", "connector-docks__card-name", {
    textContent: provider.name,
  });
  header.appendChild(logo);
  header.appendChild(name);
  card.appendChild(header);

  // Health row: latency
  const health = el("div", "connector-docks__health");
  const dot = el(
    "div",
    "connector-docks__health-dot connector-docks__health-dot--green",
  );
  dot.setAttribute("aria-label", "Latency: good");
  const latLabel = el("span", "connector-docks__health-label", {
    textContent: "Latency",
  });
  const latValue = el("span", "connector-docks__health-value", {
    textContent: "\u2014",
  });
  health.appendChild(dot);
  health.appendChild(latLabel);
  health.appendChild(latValue);
  card.appendChild(health);

  // Info rows
  const info = el("div", "connector-docks__card-info");

  // Last used
  const lastUsedRow = el("div", "connector-docks__card-info-row");
  lastUsedRow.appendChild(
    el("span", "connector-docks__card-info-label", {
      textContent: "Last used",
    }),
  );
  const lastUsedVal =
    stored && stored.last_used
      ? _formatRelativeTime(stored.last_used)
      : "Never";
  lastUsedRow.appendChild(
    el("span", "connector-docks__card-info-value", {
      textContent: lastUsedVal,
    }),
  );
  info.appendChild(lastUsedRow);

  // Total spent
  const spentRow = el("div", "connector-docks__card-info-row");
  spentRow.appendChild(
    el("span", "connector-docks__card-info-label", {
      textContent: "Monthly spend",
    }),
  );
  spentRow.appendChild(
    el("span", "connector-docks__card-info-value", {
      textContent: usd(stored ? stored.total_spent : 0),
    }),
  );
  info.appendChild(spentRow);

  // Mini spend bar
  const bar = el("div", "connector-docks__spend-bar");
  const fill = el("div", "connector-docks__spend-bar-fill");
  const maxSpend = 10;
  const pct = Math.min(100, ((stored?.total_spent || 0) / maxSpend) * 100);
  fill.style.width = pct + "%";
  fill.style.background = provider.color;
  bar.appendChild(fill);
  info.appendChild(bar);

  card.appendChild(info);

  // Ping for latency (async)
  _pingProvider(provider.id, dot, latValue);

  return card;
}

/** Ping a provider and update the health indicator. */
async function _pingProvider(providerId, dotEl, valueEl) {
  try {
    if (!window.api || !window.api.ai || !window.api.ai.ping) {
      valueEl.textContent = "N/A";
      return;
    }
    const start = performance.now();
    await window.api.ai.ping(providerId);
    const ms = Math.round(performance.now() - start);
    valueEl.textContent = `${ms}ms`;

    // Update dot color based on latency
    dotEl.className = "connector-docks__health-dot";
    if (ms < 500) {
      dotEl.classList.add("connector-docks__health-dot--green");
      dotEl.setAttribute("aria-label", "Latency: good");
    } else if (ms < 2000) {
      dotEl.classList.add("connector-docks__health-dot--amber");
      dotEl.setAttribute("aria-label", "Latency: moderate");
    } else {
      dotEl.classList.add("connector-docks__health-dot--red");
      dotEl.setAttribute("aria-label", "Latency: high");
    }
  } catch {
    valueEl.textContent = "Error";
    dotEl.className =
      "connector-docks__health-dot connector-docks__health-dot--red";
    dotEl.setAttribute("aria-label", "Latency: error");
  }
}

/** Format a date string as relative time. */
function _formatRelativeTime(dateStr) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

// ── Configure modal ──────────────────────────────────────────────

function _openConfigModal(overlay, provider, stored, onRefresh) {
  overlay.innerHTML = "";
  overlay.classList.add("connector-docks__modal-overlay--open");

  const modal = el("div", "connector-docks__modal");
  modal.setAttribute("role", "document");

  // Header
  const header = el("div", "connector-docks__modal-header");
  const icon = el("div", "connector-docks__modal-icon");
  icon.style.background = provider.color + "20";
  icon.textContent = provider.logo;
  icon.setAttribute("aria-hidden", "true");
  const title = el("div", "connector-docks__modal-title", {
    textContent: `Configure ${provider.name}`,
  });
  const closeBtn = el("button", "connector-docks__modal-close", {
    "aria-label": "Close configuration modal",
  });
  closeBtn.textContent = "\u00D7";
  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // API Key field
  const keyField = el("div", "connector-docks__field");
  const keyLabel = el("label", "connector-docks__field-label", {
    textContent: "API Key",
  });
  keyLabel.id = `cd-key-label-${provider.id}`;
  const keyWrap = el("div", "connector-docks__field-input-wrap");
  const keyIcon = el("span", "connector-docks__field-icon", {
    textContent: "\u{1F511}",
  });
  keyIcon.setAttribute("aria-hidden", "true");
  const keyInput = el("input", "connector-docks__field-input");
  keyInput.type = "password";
  keyInput.placeholder = provider.placeholder;
  keyInput.setAttribute("aria-labelledby", keyLabel.id);
  keyInput.setAttribute("autocomplete", "off");
  keyInput.setAttribute("spellcheck", "false");

  const toggleBtn = el("button", "connector-docks__field-toggle", {
    "aria-label": "Toggle API key visibility",
  });
  toggleBtn.textContent = "\u{1F441}";
  let keyVisible = false;
  toggleBtn.addEventListener("click", () => {
    keyVisible = !keyVisible;
    keyInput.type = keyVisible ? "text" : "password";
    toggleBtn.textContent = keyVisible ? "\u{1F648}" : "\u{1F441}";
    toggleBtn.setAttribute(
      "aria-label",
      keyVisible ? "Hide API key" : "Show API key",
    );
  });

  keyWrap.appendChild(keyIcon);
  keyWrap.appendChild(keyInput);
  keyWrap.appendChild(toggleBtn);
  keyField.appendChild(keyLabel);
  keyField.appendChild(keyWrap);
  modal.appendChild(keyField);

  // Display name field
  const nameField = el("div", "connector-docks__field");
  const nameLabel = el("label", "connector-docks__field-label", {
    textContent: "Display Name (optional)",
  });
  nameLabel.id = `cd-name-label-${provider.id}`;
  const nameWrap = el("div", "connector-docks__field-input-wrap");
  const nameInput = el(
    "input",
    "connector-docks__field-input connector-docks__field-input--no-icon",
  );
  nameInput.type = "text";
  nameInput.placeholder = provider.name;
  nameInput.value =
    stored && stored.display_name && stored.display_name !== provider.id
      ? stored.display_name
      : "";
  nameInput.setAttribute("aria-labelledby", nameLabel.id);
  nameWrap.appendChild(nameInput);
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameWrap);
  modal.appendChild(nameField);

  // Test connection result area
  const testResult = el(
    "div",
    "connector-docks__test-result connector-docks__test-result--hidden",
  );
  testResult.setAttribute("aria-live", "polite");
  testResult.setAttribute("role", "status");
  modal.appendChild(testResult);

  // Buttons
  const actions = el("div", "connector-docks__modal-actions");

  // Test Connection
  const testBtn = el(
    "button",
    "connector-docks__btn connector-docks__btn--secondary",
  );
  testBtn.textContent = "Test Connection";
  testBtn.setAttribute("aria-label", `Test connection to ${provider.name}`);
  testBtn.addEventListener("click", async () => {
    emit("connector-docks:test-connection", { provider: provider.id });

    testResult.className =
      "connector-docks__test-result connector-docks__test-result--loading";
    testResult.innerHTML = "";
    testResult.appendChild(el("div", "connector-docks__spinner"));
    testResult.appendChild(
      el("span", null, { textContent: "Testing connection\u2026" }),
    );

    try {
      if (!window.api || !window.api.ai || !window.api.ai.ping) {
        throw new Error("AI ping API not available");
      }
      await window.api.ai.ping(provider.id);
      testResult.className =
        "connector-docks__test-result connector-docks__test-result--success";
      testResult.innerHTML = "";
      testResult.appendChild(
        el("span", null, { textContent: "\u2713 Connection successful" }),
      );
    } catch (err) {
      testResult.className =
        "connector-docks__test-result connector-docks__test-result--error";
      testResult.innerHTML = "";
      testResult.appendChild(
        el("span", null, {
          textContent: `\u2717 ${err.message || "Connection failed"}`,
        }),
      );
    }
  });

  // Save
  const saveBtn = el(
    "button",
    "connector-docks__btn connector-docks__btn--primary",
  );
  saveBtn.textContent = "Save";
  saveBtn.setAttribute("aria-label", `Save ${provider.name} configuration`);
  saveBtn.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) {
      keyInput.focus();
      keyInput.style.borderColor = "var(--accent-red)";
      setTimeout(() => {
        keyInput.style.borderColor = "";
      }, 1500);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving\u2026";

    try {
      if (window.api && window.api.keys && window.api.keys.store) {
        await window.api.keys.store(
          provider.id,
          key,
          nameInput.value.trim() || provider.name,
        );
      }
      emit("connector-docks:key-saved", { provider: provider.id });
      _closeModal(overlay);
      onRefresh();
    } catch (err) {
      testResult.className =
        "connector-docks__test-result connector-docks__test-result--error";
      testResult.innerHTML = "";
      testResult.appendChild(
        el("span", null, {
          textContent: `\u2717 Save failed: ${err.message || "Unknown error"}`,
        }),
      );
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  actions.appendChild(testBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(actions);

  // Delete button (only if key already exists)
  if (stored) {
    const deleteSection = el("div", "connector-docks__field");
    deleteSection.style.marginTop = "8px";

    const deleteBtn = el(
      "button",
      "connector-docks__btn connector-docks__btn--danger",
    );
    deleteBtn.textContent = "Delete Key";
    deleteBtn.setAttribute("aria-label", `Delete ${provider.name} API key`);

    const confirmBox = el("div", "connector-docks__confirm");
    confirmBox.style.display = "none";
    const confirmText = el("div", "connector-docks__confirm-text", {
      textContent: `Are you sure you want to delete the ${provider.name} API key? This cannot be undone.`,
    });
    const confirmActions = el("div", "connector-docks__confirm-actions");

    const confirmYes = el(
      "button",
      "connector-docks__btn connector-docks__btn--danger",
    );
    confirmYes.textContent = "Yes, Delete";
    confirmYes.setAttribute(
      "aria-label",
      `Confirm deletion of ${provider.name} API key`,
    );

    const confirmNo = el(
      "button",
      "connector-docks__btn connector-docks__btn--secondary",
    );
    confirmNo.textContent = "Cancel";
    confirmNo.setAttribute("aria-label", "Cancel deletion");

    confirmActions.appendChild(confirmYes);
    confirmActions.appendChild(confirmNo);
    confirmBox.appendChild(confirmText);
    confirmBox.appendChild(confirmActions);

    deleteBtn.addEventListener("click", () => {
      confirmBox.style.display = "flex";
      deleteBtn.style.display = "none";
    });

    confirmNo.addEventListener("click", () => {
      confirmBox.style.display = "none";
      deleteBtn.style.display = "";
    });

    confirmYes.addEventListener("click", async () => {
      confirmYes.disabled = true;
      confirmYes.textContent = "Deleting\u2026";
      try {
        if (window.api && window.api.keys && window.api.keys.delete) {
          await window.api.keys.delete(provider.id);
        }
        emit("connector-docks:key-deleted", { provider: provider.id });
        _closeModal(overlay);
        onRefresh();
      } catch (err) {
        testResult.className =
          "connector-docks__test-result connector-docks__test-result--error";
        testResult.innerHTML = "";
        testResult.appendChild(
          el("span", null, {
            textContent: `\u2717 Delete failed: ${err.message || "Unknown error"}`,
          }),
        );
        confirmYes.disabled = false;
        confirmYes.textContent = "Yes, Delete";
      }
    });

    deleteSection.appendChild(deleteBtn);
    deleteSection.appendChild(confirmBox);
    modal.appendChild(deleteSection);
  }

  overlay.appendChild(modal);

  // Focus trap and close handlers
  keyInput.focus();

  closeBtn.addEventListener("click", () => _closeModal(overlay));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _closeModal(overlay);
  });

  // Escape key
  const escHandler = (e) => {
    if (e.key === "Escape") {
      _closeModal(overlay);
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function _closeModal(overlay) {
  overlay.classList.remove("connector-docks__modal-overlay--open");
  // Clean up after transition
  setTimeout(() => {
    overlay.innerHTML = "";
  }, 200);
}

// ── Style loader ─────────────────────────────────────────────────

let _stylesLoaded = false;

/**
 * Dynamically load connector-docks.css if not already loaded.
 * @param {string} [basePath=''] — path prefix to the zones/ directory
 */
export function loadConnectorDocksStyles(basePath = "") {
  if (_stylesLoaded) return;
  _stylesLoaded = true;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${basePath}connector-docks.css`;
  document.head.appendChild(link);
}

// ── Event wiring ─────────────────────────────────────────────────

/**
 * Initialize event listeners for Connector Docks integration.
 * @param {object} [deps] — optional dependency injection for testing
 */
export function initConnectorDocksEvents(deps = {}) {
  document.addEventListener("connector-docks:key-saved", (e) => {
    const { provider } = e.detail || {};
    console.log(`[connector-docks] Key saved for provider: ${provider}`);
  });

  document.addEventListener("connector-docks:key-deleted", (e) => {
    const { provider } = e.detail || {};
    console.log(`[connector-docks] Key deleted for provider: ${provider}`);
  });

  document.addEventListener("connector-docks:test-connection", (e) => {
    const { provider } = e.detail || {};
    console.log(
      `[connector-docks] Testing connection for provider: ${provider}`,
    );
  });
}
