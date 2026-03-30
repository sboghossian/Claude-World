/**
 * mcp-hub.js — MCP Hub zone: Model Context Protocol server management
 *
 * Manages MCP server configurations, displays available tools/resources/prompts,
 * provides tool testing, server logs, and preset quick-add for popular servers.
 *
 * Events emitted:
 *   mcp-hub:server-added      — { server }
 *   mcp-hub:server-removed    — { serverId }
 *   mcp-hub:server-connected  — { serverId }
 *   mcp-hub:tool-invoked      — { serverId, tool, result }
 *
 * @module McpHub
 */

// Load styles
const _styleLink = document.createElement("link");
_styleLink.rel = "stylesheet";
_styleLink.href = "../zones/mcp-hub.css";
if (!document.querySelector('link[href*="mcp-hub.css"]')) {
  document.head.appendChild(_styleLink);
}

// ── Constants ────────────────────────────────────────────────────

const TABS = [
  { id: "servers", label: "Servers" },
  { id: "tools", label: "Tools" },
  { id: "logs", label: "Logs" },
  { id: "presets", label: "Presets" },
];

const MCP_PRESETS = [
  {
    id: "filesystem",
    name: "Filesystem",
    icon: "\uD83D\uDCC1",
    desc: "Read/write local files",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    env: {},
  },
  {
    id: "github",
    name: "GitHub",
    icon: "\uD83D\uDC19",
    desc: "Repos, issues, PRs",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
  },
  {
    id: "postgres",
    name: "Postgres",
    icon: "\uD83D\uDDC4",
    desc: "Database queries",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://localhost/mydb",
    ],
    env: {},
  },
  {
    id: "brave-search",
    name: "Brave Search",
    icon: "\uD83D\uDD0D",
    desc: "Web search",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
  },
  {
    id: "memory",
    name: "Memory",
    icon: "\uD83E\uDDE0",
    desc: "Persistent memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    env: {},
  },
];

// Simulated tool/resource data for demo purposes when servers are "connected"
const DEMO_TOOLS = {
  filesystem: [
    {
      name: "read_file",
      description: "Read the contents of a file at the specified path",
      params: "{ path: string }",
    },
    {
      name: "write_file",
      description: "Write content to a file at the specified path",
      params: "{ path: string, content: string }",
    },
    {
      name: "list_directory",
      description: "List files and directories at the specified path",
      params: "{ path: string }",
    },
    {
      name: "search_files",
      description: "Search for files matching a pattern",
      params: "{ pattern: string, path?: string }",
    },
  ],
  github: [
    {
      name: "list_repos",
      description: "List repositories for the authenticated user",
      params: "{ page?: number }",
    },
    {
      name: "get_issue",
      description: "Get details of a specific issue",
      params: "{ owner: string, repo: string, issue_number: number }",
    },
    {
      name: "create_issue",
      description: "Create a new issue in a repository",
      params: "{ owner: string, repo: string, title: string, body?: string }",
    },
    {
      name: "list_prs",
      description: "List pull requests for a repository",
      params: "{ owner: string, repo: string, state?: string }",
    },
  ],
  postgres: [
    {
      name: "query",
      description: "Execute a SQL query against the database",
      params: "{ sql: string, params?: any[] }",
    },
    {
      name: "list_tables",
      description: "List all tables in the database",
      params: "{}",
    },
    {
      name: "describe_table",
      description: "Get the schema of a table",
      params: "{ table: string }",
    },
  ],
  "brave-search": [
    {
      name: "web_search",
      description: "Search the web using Brave Search",
      params: "{ query: string, count?: number }",
    },
    {
      name: "local_search",
      description: "Search for local businesses and places",
      params: "{ query: string, location?: string }",
    },
  ],
  memory: [
    {
      name: "store",
      description: "Store a key-value pair in persistent memory",
      params: "{ key: string, value: any }",
    },
    {
      name: "retrieve",
      description: "Retrieve a value by key from memory",
      params: "{ key: string }",
    },
    { name: "list_keys", description: "List all stored keys", params: "{}" },
    {
      name: "delete",
      description: "Delete a key from memory",
      params: "{ key: string }",
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "textContent") e.textContent = v;
      else if (k === "innerHTML") e.innerHTML = v;
      else if (k.startsWith("on"))
        e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
  }
  return e;
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── McpHub class ─────────────────────────────────────────────────

export class McpHub {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;
    /** @type {Array<object>} */
    this._servers = [];
    /** @type {string} */
    this._activeTab = "servers";
    /** @type {string|null} */
    this._selectedServerId = null;
    /** @type {Array<object>} */
    this._logs = [];
    /** @type {HTMLElement} */
    this._root = null;
    /** @type {Map<string, object[]>} */
    this._serverTools = new Map();
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Build the DOM tree. Does not fetch data yet.
   * @returns {HTMLElement}
   */
  render() {
    this._root = el("div", "mcp-hub");

    // Header
    const header = el("div", "mcp-hub__header");
    header.appendChild(
      el("span", "mcp-hub__header-icon", { textContent: "\uD83D\uDD0C" }),
    );
    header.appendChild(
      el("span", "mcp-hub__header-title", { textContent: "MCP Hub" }),
    );
    const badge = el("span", "mcp-hub__header-badge", {
      textContent: "PROTOCOL v1",
    });
    header.appendChild(badge);
    this._root.appendChild(header);

    // Tabs
    this._tabsEl = el("div", "mcp-hub__tabs");
    for (const tab of TABS) {
      const btn = el(
        "button",
        `mcp-hub__tab${tab.id === this._activeTab ? " mcp-hub__tab--active" : ""}`,
        {
          textContent: tab.label,
          "data-tab": tab.id,
          onClick: () => this._switchTab(tab.id),
        },
      );
      this._tabsEl.appendChild(btn);
    }
    this._root.appendChild(this._tabsEl);

    // View containers
    this._views = {};
    for (const tab of TABS) {
      const view = el(
        "div",
        `mcp-hub__view${tab.id === this._activeTab ? " mcp-hub__view--active" : ""}`,
        {
          "data-view": tab.id,
        },
      );
      this._views[tab.id] = view;
      this._root.appendChild(view);
    }

    return this._root;
  }

  /**
   * Initialize with data from the database.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadServers();
    this._renderServersView();
    this._renderToolsView();
    this._renderLogsView();
    this._renderPresetsView();
  }

  // ── Data loading ──────────────────────────────────────────────

  async _loadServers() {
    try {
      const servers = await window.api.db.getMcpServers(this._worldId);
      this._servers = servers || [];
    } catch (e) {
      console.warn("McpHub: failed to load servers, using empty list", e);
      this._servers = [];
    }
    // Populate demo tools for known presets
    for (const srv of this._servers) {
      this._populateToolsForServer(srv);
    }
  }

  _populateToolsForServer(server) {
    // Check if this matches a known preset by command/args
    const cmd =
      `${server.command} ${JSON.parse(server.args_json || "[]").join(" ")}`.toLowerCase();
    for (const [presetId, tools] of Object.entries(DEMO_TOOLS)) {
      const preset = MCP_PRESETS.find((p) => p.id === presetId);
      if (preset && cmd.includes(preset.args[1]?.toLowerCase() || "___")) {
        this._serverTools.set(server.id, tools);
        return;
      }
    }
    // Generic fallback tools
    this._serverTools.set(server.id, [
      {
        name: "ping",
        description: "Check if the server is responding",
        params: "{}",
      },
    ]);
  }

  async _saveServer(serverData) {
    const id = generateId();
    const server = {
      id,
      world_id: this._worldId,
      name: serverData.name,
      command: serverData.command,
      args_json: JSON.stringify(serverData.args || []),
      env_json: JSON.stringify(serverData.env || {}),
      status: "disconnected",
      auto_connect: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await window.api.db.createMcpServer(this._worldId, server);
    } catch (e) {
      console.warn("McpHub: DB save failed, adding locally", e);
    }

    this._servers.push(server);
    this._populateToolsForServer(server);
    this._addLog("system", `Server "${server.name}" added`);

    document.dispatchEvent(
      new CustomEvent("mcp-hub:server-added", {
        detail: { server },
        bubbles: true,
      }),
    );

    this._renderServersView();
    this._renderToolsView();
  }

  async _deleteServer(serverId) {
    try {
      await window.api.db.deleteMcpServer(serverId);
    } catch (e) {
      console.warn("McpHub: DB delete failed", e);
    }

    const srv = this._servers.find((s) => s.id === serverId);
    this._servers = this._servers.filter((s) => s.id !== serverId);
    this._serverTools.delete(serverId);
    if (this._selectedServerId === serverId) this._selectedServerId = null;

    this._addLog("system", `Server "${srv?.name || serverId}" removed`);

    document.dispatchEvent(
      new CustomEvent("mcp-hub:server-removed", {
        detail: { serverId },
        bubbles: true,
      }),
    );

    this._renderServersView();
    this._renderToolsView();
  }

  async _toggleConnection(serverId) {
    const srv = this._servers.find((s) => s.id === serverId);
    if (!srv) return;

    if (srv.status === "connected") {
      srv.status = "disconnected";
      this._addLog("sent", `Disconnecting from "${srv.name}"...`);
      this._addLog("received", `Disconnected from "${srv.name}"`);
    } else {
      srv.status = "connecting";
      this._renderServersView();
      this._addLog("sent", `Connecting to "${srv.name}"...`);

      // Simulate connection delay
      await new Promise((r) => setTimeout(r, 800));

      // Check for missing env vars
      const env = JSON.parse(srv.env_json || "{}");
      const missingKeys = Object.entries(env).filter(([, v]) => !v);
      if (missingKeys.length > 0) {
        srv.status = "error";
        this._addLog(
          "error",
          `Connection failed: missing env vars: ${missingKeys.map(([k]) => k).join(", ")}`,
        );
      } else {
        srv.status = "connected";
        this._addLog(
          "received",
          `Connected to "${srv.name}" - ${(this._serverTools.get(srv.id) || []).length} tools available`,
        );

        document.dispatchEvent(
          new CustomEvent("mcp-hub:server-connected", {
            detail: { serverId },
            bubbles: true,
          }),
        );
      }
    }

    try {
      await window.api.db.updateMcpServer(serverId, { status: srv.status });
    } catch (e) {
      // OK - status is in memory anyway
    }

    this._renderServersView();
    this._renderLogsView();
  }

  // ── Logging ───────────────────────────────────────────────────

  _addLog(type, message) {
    this._logs.unshift({
      type,
      message,
      time: new Date(),
    });
    // Keep last 200 entries
    if (this._logs.length > 200) this._logs.length = 200;
  }

  // ── Tab switching ─────────────────────────────────────────────

  _switchTab(tabId) {
    this._activeTab = tabId;

    // Update tab buttons
    for (const btn of this._tabsEl.children) {
      btn.classList.toggle("mcp-hub__tab--active", btn.dataset.tab === tabId);
    }

    // Update views
    for (const [id, view] of Object.entries(this._views)) {
      view.classList.toggle("mcp-hub__view--active", id === tabId);
    }

    // Re-render active view content
    if (tabId === "logs") this._renderLogsView();
  }

  // ── Servers view ──────────────────────────────────────────────

  _renderServersView() {
    const container = this._views.servers;
    container.innerHTML = "";

    if (this._selectedServerId) {
      this._renderServerDetail(container);
      return;
    }

    if (this._servers.length === 0) {
      const empty = el("div", "mcp-hub__empty");
      empty.appendChild(
        el("div", "mcp-hub__empty-icon", { textContent: "\uD83D\uDD0C" }),
      );
      empty.appendChild(
        el("div", "mcp-hub__empty-title", { textContent: "No MCP Servers" }),
      );
      empty.appendChild(
        el("div", "mcp-hub__empty-desc", {
          textContent:
            "Add MCP servers to connect AI agents to external tools and data sources. Check the Presets tab for quick setup.",
        }),
      );
      container.appendChild(empty);
    } else {
      const list = el("div", "mcp-hub__server-list");
      for (const srv of this._servers) {
        list.appendChild(this._buildServerCard(srv));
      }
      container.appendChild(list);
    }

    // Add server button
    const addBtn = el("button", "mcp-hub__add-btn", {
      textContent: "+ Add MCP Server",
      onClick: () => this._showAddForm(),
    });
    container.appendChild(addBtn);
  }

  _buildServerCard(server) {
    const card = el("div", "mcp-hub__server-card");
    card.dataset.serverId = server.id;

    // Status dot
    const status = el(
      "div",
      `mcp-hub__server-status mcp-hub__server-status--${server.status}`,
    );
    card.appendChild(status);

    // Info
    const info = el("div", "mcp-hub__server-info");
    info.appendChild(
      el("div", "mcp-hub__server-name", { textContent: server.name }),
    );
    const args = JSON.parse(server.args_json || "[]");
    const cmdText = `${server.command} ${args.join(" ")}`;
    info.appendChild(
      el("div", "mcp-hub__server-command", { textContent: cmdText }),
    );
    card.appendChild(info);

    // Click to select
    info.addEventListener("click", () => {
      this._selectedServerId = server.id;
      this._renderServersView();
    });

    // Action buttons
    const actions = el("div", "mcp-hub__server-actions");

    if (server.status === "connected") {
      const disconnectBtn = el(
        "button",
        "mcp-hub__server-btn mcp-hub__server-btn--disconnect",
        {
          textContent: "Stop",
          onClick: (e) => {
            e.stopPropagation();
            this._toggleConnection(server.id);
          },
        },
      );
      actions.appendChild(disconnectBtn);
    } else {
      const connectBtn = el(
        "button",
        "mcp-hub__server-btn mcp-hub__server-btn--connect",
        {
          textContent: "Start",
          onClick: (e) => {
            e.stopPropagation();
            this._toggleConnection(server.id);
          },
        },
      );
      actions.appendChild(connectBtn);
    }

    const deleteBtn = el(
      "button",
      "mcp-hub__server-btn mcp-hub__server-btn--delete",
      {
        textContent: "\u00D7",
        onClick: (e) => {
          e.stopPropagation();
          this._deleteServer(server.id);
        },
      },
    );
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  // ── Server detail view ────────────────────────────────────────

  _renderServerDetail(container) {
    const server = this._servers.find((s) => s.id === this._selectedServerId);
    if (!server) {
      this._selectedServerId = null;
      this._renderServersView();
      return;
    }

    const detail = el("div", "mcp-hub__detail");

    // Header with back button
    const header = el("div", "mcp-hub__detail-header");
    const backBtn = el("button", "mcp-hub__detail-back", {
      textContent: "\u2190 Back",
      onClick: () => {
        this._selectedServerId = null;
        this._renderServersView();
      },
    });
    header.appendChild(backBtn);
    header.appendChild(
      el("div", "mcp-hub__detail-name", { textContent: server.name }),
    );

    const statusDot = el(
      "div",
      `mcp-hub__server-status mcp-hub__server-status--${server.status}`,
    );
    header.appendChild(statusDot);
    detail.appendChild(header);

    // Command info
    const args = JSON.parse(server.args_json || "[]");
    const cmdCard = el("div", "mcp-hub__tool-card");
    cmdCard.appendChild(
      el("div", "mcp-hub__tool-name", { textContent: "Command" }),
    );
    cmdCard.appendChild(
      el("div", "mcp-hub__tool-desc", {
        textContent: `${server.command} ${args.join(" ")}`,
      }),
    );
    detail.appendChild(cmdCard);

    // Environment variables
    const env = JSON.parse(server.env_json || "{}");
    const envKeys = Object.keys(env);
    if (envKeys.length > 0) {
      detail.appendChild(
        el("div", "mcp-hub__detail-section", {
          textContent: "Environment Variables",
        }),
      );
      for (const key of envKeys) {
        const envCard = el("div", "mcp-hub__tool-card");
        envCard.appendChild(
          el("div", "mcp-hub__tool-name", { textContent: key }),
        );
        envCard.appendChild(
          el("div", "mcp-hub__tool-desc", {
            textContent: env[key]
              ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (set)"
              : "(not set)",
          }),
        );
        detail.appendChild(envCard);
      }
    }

    // Tools section
    const tools = this._serverTools.get(server.id) || [];
    detail.appendChild(
      el("div", "mcp-hub__detail-section", {
        textContent: `Tools (${tools.length})`,
      }),
    );

    if (tools.length === 0) {
      detail.appendChild(
        el("div", "mcp-hub__tool-desc", {
          textContent:
            server.status === "connected"
              ? "No tools discovered."
              : "Connect to discover available tools.",
        }),
      );
    } else {
      for (const tool of tools) {
        const toolCard = el("div", "mcp-hub__tool-card");

        const toolHeader = el("div", "mcp-hub__tool-header");
        toolHeader.appendChild(
          el("span", "mcp-hub__tool-name", { textContent: tool.name }),
        );
        toolCard.appendChild(toolHeader);

        toolCard.appendChild(
          el("div", "mcp-hub__tool-desc", { textContent: tool.description }),
        );
        if (tool.params) {
          toolCard.appendChild(
            el("div", "mcp-hub__tool-params", { textContent: tool.params }),
          );
        }

        // Click to test
        toolCard.addEventListener("click", () => {
          this._showTestPanel(server, tool);
        });

        detail.appendChild(toolCard);
      }
    }

    // Test panel placeholder
    this._testContainer = el("div", "");
    detail.appendChild(this._testContainer);

    container.appendChild(detail);
  }

  // ── Tool testing ──────────────────────────────────────────────

  _showTestPanel(server, tool) {
    if (!this._testContainer) return;
    this._testContainer.innerHTML = "";

    const panel = el("div", "mcp-hub__test-panel");

    const title = el("div", "mcp-hub__test-title", {
      textContent: `\uD83E\uDDEA Test: ${tool.name}`,
    });
    panel.appendChild(title);

    // Input area
    const group = el("div", "mcp-hub__form-group");
    group.appendChild(
      el("label", "mcp-hub__form-label", { textContent: "Input (JSON)" }),
    );
    const textarea = el("textarea", "mcp-hub__form-textarea", {
      placeholder: tool.params || "{}",
    });
    textarea.value = this._generateSampleInput(tool);
    group.appendChild(textarea);
    panel.appendChild(group);

    // Run button
    const runBtn = el(
      "button",
      "mcp-hub__form-btn mcp-hub__form-btn--primary",
      {
        textContent: "Run Tool",
        onClick: async () => {
          runBtn.textContent = "Running...";
          runBtn.disabled = true;

          this._addLog(
            "sent",
            `[${server.name}] ${tool.name}(${textarea.value.trim()})`,
          );

          // Simulate tool execution
          await new Promise((r) => setTimeout(r, 600));

          const result = this._generateMockResult(tool);
          this._addLog(
            "received",
            `[${server.name}] ${tool.name} => ${JSON.stringify(result).slice(0, 120)}`,
          );

          // Show result
          let resultEl = panel.querySelector(".mcp-hub__test-result");
          if (resultEl) resultEl.remove();

          resultEl = el(
            "div",
            "mcp-hub__test-result mcp-hub__test-result--success",
            {
              textContent: JSON.stringify(result, null, 2),
            },
          );
          panel.appendChild(resultEl);

          document.dispatchEvent(
            new CustomEvent("mcp-hub:tool-invoked", {
              detail: { serverId: server.id, tool: tool.name, result },
              bubbles: true,
            }),
          );

          runBtn.textContent = "Run Tool";
          runBtn.disabled = false;
        },
      },
    );
    panel.appendChild(runBtn);

    this._testContainer.appendChild(panel);
  }

  _generateSampleInput(tool) {
    const name = tool.name.toLowerCase();
    if (name.includes("read_file") || name.includes("list_dir"))
      return '{\n  "path": "/tmp"\n}';
    if (name.includes("write_file"))
      return '{\n  "path": "/tmp/test.txt",\n  "content": "Hello MCP"\n}';
    if (name.includes("search")) return '{\n  "query": "example search"\n}';
    if (name.includes("query")) return '{\n  "sql": "SELECT 1"\n}';
    if (name.includes("store"))
      return '{\n  "key": "test",\n  "value": "hello"\n}';
    if (
      name.includes("retrieve") ||
      name.includes("get") ||
      name.includes("delete")
    )
      return '{\n  "key": "test"\n}';
    if (name.includes("issue"))
      return '{\n  "owner": "user",\n  "repo": "project",\n  "title": "Test issue"\n}';
    return "{}";
  }

  _generateMockResult(tool) {
    const name = tool.name.toLowerCase();
    if (name.includes("list") || name.includes("search"))
      return { results: ["item_1", "item_2", "item_3"], count: 3 };
    if (name.includes("read"))
      return {
        content: "# Example File\nThis is sample content from the MCP server.",
        size: 58,
      };
    if (name.includes("write")) return { success: true, bytes_written: 9 };
    if (name.includes("query"))
      return { rows: [{ id: 1, name: "test" }], rowCount: 1 };
    if (name.includes("store")) return { success: true };
    if (name.includes("retrieve")) return { key: "test", value: "hello" };
    if (name.includes("describe"))
      return {
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "name", type: "TEXT" },
        ],
      };
    if (name.includes("ping")) return { status: "ok", latency_ms: 12 };
    return { status: "ok" };
  }

  // ── Tools view ────────────────────────────────────────────────

  _renderToolsView() {
    const container = this._views.tools;
    container.innerHTML = "";

    // Collect all tools across servers
    const allTools = [];
    for (const srv of this._servers) {
      const tools = this._serverTools.get(srv.id) || [];
      for (const tool of tools) {
        allTools.push({
          ...tool,
          serverName: srv.name,
          serverId: srv.id,
          serverStatus: srv.status,
        });
      }
    }

    if (allTools.length === 0) {
      const empty = el("div", "mcp-hub__empty");
      empty.appendChild(
        el("div", "mcp-hub__empty-icon", { textContent: "\uD83E\uDDF0" }),
      );
      empty.appendChild(
        el("div", "mcp-hub__empty-title", {
          textContent: "No Tools Available",
        }),
      );
      empty.appendChild(
        el("div", "mcp-hub__empty-desc", {
          textContent:
            "Add and connect MCP servers to discover available tools.",
        }),
      );
      container.appendChild(empty);
      return;
    }

    // Search bar
    const searchInput = el("input", "mcp-hub__form-input", {
      placeholder: "Search tools...",
      type: "text",
    });
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase();
      for (const card of toolList.children) {
        const name = card.dataset.toolName || "";
        const desc = card.dataset.toolDesc || "";
        card.style.display = name.includes(q) || desc.includes(q) ? "" : "none";
      }
    });
    container.appendChild(searchInput);

    // Tool list
    const toolList = el("div", "mcp-hub__tool-list");

    for (const tool of allTools) {
      const card = el("div", "mcp-hub__tool-card");
      card.dataset.toolName = tool.name.toLowerCase();
      card.dataset.toolDesc = (tool.description || "").toLowerCase();

      const header = el("div", "mcp-hub__tool-header");
      header.appendChild(
        el("span", "mcp-hub__tool-name", { textContent: tool.name }),
      );
      header.appendChild(
        el("span", "mcp-hub__tool-server-tag", {
          textContent: tool.serverName,
        }),
      );
      card.appendChild(header);

      if (tool.description) {
        card.appendChild(
          el("div", "mcp-hub__tool-desc", { textContent: tool.description }),
        );
      }
      if (tool.params) {
        card.appendChild(
          el("div", "mcp-hub__tool-params", { textContent: tool.params }),
        );
      }

      // Click to go to server detail and test
      card.addEventListener("click", () => {
        this._selectedServerId = tool.serverId;
        this._switchTab("servers");
        this._renderServersView();
        // Auto-open test panel after render
        setTimeout(() => {
          const srv = this._servers.find((s) => s.id === tool.serverId);
          if (srv) this._showTestPanel(srv, tool);
        }, 50);
      });

      toolList.appendChild(card);
    }

    container.appendChild(toolList);
  }

  // ── Logs view ─────────────────────────────────────────────────

  _renderLogsView() {
    const container = this._views.logs;
    container.innerHTML = "";

    if (this._logs.length === 0) {
      const empty = el("div", "mcp-hub__empty");
      empty.appendChild(
        el("div", "mcp-hub__empty-icon", { textContent: "\uD83D\uDCDC" }),
      );
      empty.appendChild(
        el("div", "mcp-hub__empty-title", { textContent: "No Logs Yet" }),
      );
      empty.appendChild(
        el("div", "mcp-hub__empty-desc", {
          textContent:
            "Connect to an MCP server to see protocol messages here.",
        }),
      );
      container.appendChild(empty);
      return;
    }

    // Clear button
    const clearBtn = el("button", "mcp-hub__server-btn", {
      textContent: "Clear Logs",
      onClick: () => {
        this._logs = [];
        this._renderLogsView();
      },
    });
    clearBtn.style.alignSelf = "flex-end";
    container.appendChild(clearBtn);

    const logs = el("div", "mcp-hub__logs");
    for (const entry of this._logs) {
      const logType =
        entry.type === "sent"
          ? "sent"
          : entry.type === "error"
            ? "error"
            : "received";

      const row = el(
        "div",
        `mcp-hub__log-entry mcp-hub__log-entry--${logType}`,
      );
      row.appendChild(
        el("span", "mcp-hub__log-time", {
          textContent: formatTime(entry.time),
        }),
      );
      row.appendChild(document.createTextNode(entry.message));
      logs.appendChild(row);
    }
    container.appendChild(logs);
  }

  // ── Presets view ──────────────────────────────────────────────

  _renderPresetsView() {
    const container = this._views.presets;
    container.innerHTML = "";

    container.appendChild(
      el("div", "mcp-hub__detail-section", {
        textContent: "Quick-Add Popular MCP Servers",
      }),
    );

    const grid = el("div", "mcp-hub__presets");

    for (const preset of MCP_PRESETS) {
      // Check if already added
      const alreadyAdded = this._servers.some((s) => {
        const args = JSON.parse(s.args_json || "[]");
        return args.some((a) => preset.args.includes(a));
      });

      const card = el("div", "mcp-hub__preset");
      if (alreadyAdded) card.style.opacity = "0.5";

      card.appendChild(
        el("div", "mcp-hub__preset-icon", { textContent: preset.icon }),
      );

      const info = el("div", "mcp-hub__preset-info");
      info.appendChild(
        el("div", "mcp-hub__preset-name", {
          textContent: alreadyAdded ? `${preset.name} (added)` : preset.name,
        }),
      );
      info.appendChild(
        el("div", "mcp-hub__preset-desc", { textContent: preset.desc }),
      );
      card.appendChild(info);

      if (!alreadyAdded) {
        card.addEventListener("click", () => {
          // If preset has env vars, show form pre-filled
          const hasEnv = Object.keys(preset.env).length > 0;
          if (hasEnv) {
            this._showAddForm(preset);
          } else {
            this._saveServer({
              name: preset.name,
              command: preset.command,
              args: preset.args,
              env: preset.env,
            });
            this._renderPresetsView();
          }
        });
      }

      grid.appendChild(card);
    }

    container.appendChild(grid);

    // Custom server button
    container.appendChild(
      el("button", "mcp-hub__add-btn", {
        textContent: "+ Add Custom Server",
        onClick: () => this._showAddForm(),
      }),
    );
  }

  // ── Add server form (modal) ───────────────────────────────────

  _showAddForm(preset) {
    // Remove existing modal
    const existing = document.querySelector(".mcp-hub__form-overlay");
    if (existing) existing.remove();

    const overlay = el("div", "mcp-hub__form-overlay");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const form = el("div", "mcp-hub__form");
    form.appendChild(
      el("div", "mcp-hub__form-title", {
        textContent: preset ? `Add ${preset.name} Server` : "Add MCP Server",
      }),
    );

    // Name
    const nameGroup = el("div", "mcp-hub__form-group");
    nameGroup.appendChild(
      el("label", "mcp-hub__form-label", { textContent: "Name" }),
    );
    const nameInput = el("input", "mcp-hub__form-input", {
      type: "text",
      placeholder: "My MCP Server",
    });
    if (preset) nameInput.value = preset.name;
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // Command
    const cmdGroup = el("div", "mcp-hub__form-group");
    cmdGroup.appendChild(
      el("label", "mcp-hub__form-label", { textContent: "Command" }),
    );
    const cmdInput = el(
      "input",
      "mcp-hub__form-input mcp-hub__form-input--mono",
      {
        type: "text",
        placeholder: "npx @modelcontextprotocol/server-xxx",
      },
    );
    if (preset) cmdInput.value = preset.command;
    cmdGroup.appendChild(cmdInput);
    cmdGroup.appendChild(
      el("div", "mcp-hub__form-hint", {
        textContent: "The executable to launch the MCP server",
      }),
    );
    form.appendChild(cmdGroup);

    // Args
    const argsGroup = el("div", "mcp-hub__form-group");
    argsGroup.appendChild(
      el("label", "mcp-hub__form-label", {
        textContent: "Arguments (one per line)",
      }),
    );
    const argsInput = el("textarea", "mcp-hub__form-textarea", {
      placeholder: "-y\n@modelcontextprotocol/server-xxx\n/path/to/dir",
    });
    if (preset) argsInput.value = preset.args.join("\n");
    argsGroup.appendChild(argsInput);
    form.appendChild(argsGroup);

    // Env vars
    const envGroup = el("div", "mcp-hub__form-group");
    envGroup.appendChild(
      el("label", "mcp-hub__form-label", {
        textContent: "Environment Variables (KEY=VALUE, one per line)",
      }),
    );
    const envInput = el("textarea", "mcp-hub__form-textarea", {
      placeholder: "API_KEY=your-key-here",
    });
    if (preset && Object.keys(preset.env).length > 0) {
      envInput.value = Object.entries(preset.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
    }
    envGroup.appendChild(envInput);
    form.appendChild(envGroup);

    // Actions
    const actions = el("div", "mcp-hub__form-actions");

    const cancelBtn = el("button", "mcp-hub__form-btn", {
      textContent: "Cancel",
      onClick: () => overlay.remove(),
    });
    actions.appendChild(cancelBtn);

    const saveBtn = el(
      "button",
      "mcp-hub__form-btn mcp-hub__form-btn--primary",
      {
        textContent: "Add Server",
        onClick: () => {
          const name = nameInput.value.trim();
          const command = cmdInput.value.trim();
          if (!name || !command) return;

          const args = argsInput.value.trim()
            ? argsInput.value
                .trim()
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
            : [];

          const env = {};
          if (envInput.value.trim()) {
            for (const line of envInput.value.trim().split("\n")) {
              const eqIdx = line.indexOf("=");
              if (eqIdx > 0) {
                env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
              }
            }
          }

          this._saveServer({ name, command, args, env });
          this._renderPresetsView();
          overlay.remove();
        },
      },
    );
    actions.appendChild(saveBtn);

    form.appendChild(actions);
    overlay.appendChild(form);
    document.body.appendChild(overlay);

    // Focus name input
    setTimeout(() => nameInput.focus(), 50);
  }
}
