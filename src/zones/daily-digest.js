/**
 * daily-digest.js — Daily Digest zone for Claude World
 *
 * Auto-generates end-of-day summaries of world activity including
 * task stats, achievements, agent productivity, zone usage, and
 * AI-powered natural language summaries.
 *
 * Public API:
 *   render()              -> HTMLElement
 *   async init(worldId)   — fetch data, populate digest
 *   destroy()             — cleanup timers / listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

const AGENT_DEFS = [
  { id: "commander", name: "Commander Rex", emoji: "\u{1F451}" },
  { id: "librarian", name: "Dr. Memoria", emoji: "\u{1F4DA}" },
  { id: "archivist", name: "Chronicle", emoji: "\u{1F4DC}" },
  { id: "instructor", name: "Coach Algo", emoji: "\u{1F3AF}" },
  { id: "dockmaster", name: "Captain Port", emoji: "\u{2693}" },
];

const ZONE_DEFS = [
  { id: "dispatch_tower", name: "Dispatch Tower" },
  { id: "brain_library", name: "Brain Library" },
  { id: "skills_academy", name: "Skills Academy" },
  { id: "memory_vault", name: "Memory Vault" },
  { id: "connector_docks", name: "Connector Docks" },
  { id: "chat_rooms", name: "Chat Rooms" },
  { id: "treasury", name: "Treasury" },
  { id: "minion_tunnels", name: "Minion Tunnels" },
  { id: "legal_tower", name: "Legal Tower" },
  { id: "sales_district", name: "Sales District" },
  { id: "marketing_plaza", name: "Marketing Plaza" },
  { id: "the_exchange", name: "The Exchange" },
  { id: "the_market", name: "The Market" },
  { id: "the_council", name: "The Council" },
  { id: "rd_lab", name: "R&D Lab" },
  { id: "the_archive", name: "The Archive" },
  { id: "airport", name: "Airport" },
  { id: "globe_room", name: "Globe Room" },
  { id: "broadcast_tower", name: "Broadcast Tower" },
  { id: "mission_control", name: "Mission Control" },
];

const TABS = [
  { id: "today", label: "Today" },
  { id: "weekly", label: "Weekly" },
  { id: "goals", label: "Goals" },
  { id: "history", label: "History" },
];

// ── Helpers ────────────────────────────────────────────────────────────

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function shortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtCost(n) {
  return "$" + (n || 0).toFixed(2);
}

function fmtNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n || 0));
}

function trendArrow(direction) {
  if (direction === "up")
    return { symbol: "\u2191", cls: "digest__trend--up", label: "Up" };
  if (direction === "down")
    return { symbol: "\u2193", cls: "digest__trend--down", label: "Down" };
  return { symbol: "\u2192", cls: "digest__trend--stable", label: "Stable" };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ── Stylesheet injection ──────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById("daily-digest-styles")) return;
  const link = document.createElement("link");
  link.id = "daily-digest-styles";
  link.rel = "stylesheet";
  link.href = "../zones/daily-digest.css";
  document.head.appendChild(link);
}

// ── DailyDigest class ─────────────────────────────────────────────────

export class DailyDigest {
  constructor() {
    /** @type {HTMLElement|null} */
    this._root = null;
    /** @type {number|null} */
    this._worldId = null;
    /** @type {string} */
    this._activeTab = "today";
    /** @type {object|null} */
    this._todayDigest = null;
    /** @type {object[]} */
    this._history = [];
    /** @type {object[]} */
    this._goals = [];
    /** @type {object|null} */
    this._weeklyData = null;
    /** @type {boolean} */
    this._aiLoading = false;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Create and return the root DOM element.
   * @returns {HTMLElement}
   */
  render() {
    injectStyles();

    this._root = document.createElement("div");
    this._root.className = "digest";
    this._root.innerHTML = '<div class="digest__empty">Loading digest...</div>';
    return this._root;
  }

  /**
   * Initialize the digest with world data.
   * @param {number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadData();
    this._renderContent();
  }

  /**
   * Clean up timers and listeners.
   */
  destroy() {
    this._root = null;
  }

  // ── Data loading ────────────────────────────────────────────────────

  /**
   * Load all digest data from the database.
   * @private
   */
  async _loadData() {
    const wid = this._worldId;
    const today = dateKey();

    try {
      // Load existing digests
      const digests = (await window.api.db.getDigests(wid)) || [];
      this._history = digests;
      this._todayDigest = digests.find((d) => d.digest_date === today) || null;

      // If no digest for today, auto-generate one
      if (!this._todayDigest) {
        this._todayDigest = await this._generateTodayDigest();
      }

      // Load goals for today
      this._goals = (await window.api.db.getGoals(wid, today)) || [];

      // Build weekly summary
      this._weeklyData = this._buildWeeklySummary(digests);
    } catch (err) {
      console.warn("[DailyDigest] Error loading data:", err);
      // Use fallback empty digest
      this._todayDigest = this._emptyDigest(today);
      this._history = [];
      this._goals = [];
      this._weeklyData = this._emptyWeekly();
    }
  }

  /**
   * Generate today's digest from task and activity data.
   * @returns {Promise<object>}
   * @private
   */
  async _generateTodayDigest() {
    const wid = this._worldId;
    const today = dateKey();

    let tasksCompleted = 0;
    let tasksFailed = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let topAchievement = "";
    let mostActiveZone = "";
    let agentOfDay = "";
    let healthChange = "stable";

    try {
      // Gather stats from the task system
      const stats = await window.api.db.getTaskStats(wid);
      if (stats) {
        tasksCompleted = stats.completed || 0;
        tasksFailed = stats.failed || 0;
        totalTokens = stats.total_tokens || 0;
        totalCost = stats.total_cost || 0;
      }

      // Determine top achievement
      const recentTasks = (await window.api.db.getRecentTasks(wid, 20)) || [];
      const completed = recentTasks.filter((t) => t.status === "completed");
      if (completed.length > 0) {
        // Pick the task with the highest token cost as the "top" one
        const top = completed.reduce(
          (a, b) => ((b.tokens_used || 0) > (a.tokens_used || 0) ? b : a),
          completed[0],
        );
        topAchievement =
          top.title || top.prompt?.slice(0, 60) || "Task completed";
      }

      // Determine most active zone by counting tasks per zone
      const zoneCounts = {};
      for (const t of recentTasks) {
        const z = t.zone || "dispatch";
        zoneCounts[z] = (zoneCounts[z] || 0) + 1;
      }
      const topZoneId = Object.entries(zoneCounts).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];
      const zoneDef = ZONE_DEFS.find((z) => z.id === topZoneId);
      mostActiveZone = zoneDef?.name || topZoneId || "None";

      // Determine agent of the day
      const agentCounts = {};
      for (const t of completed) {
        const a = t.agent || "commander";
        agentCounts[a] = (agentCounts[a] || 0) + 1;
      }
      const topAgentId = Object.entries(agentCounts).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];
      const agentDef = AGENT_DEFS.find((a) => a.id === topAgentId);
      agentOfDay = agentDef?.name || topAgentId || "None";

      // Calculate health change based on completed vs failed ratio
      if (tasksCompleted > 0 && tasksFailed === 0) healthChange = "up";
      else if (tasksFailed > tasksCompleted) healthChange = "down";
      else healthChange = "stable";
    } catch (err) {
      console.warn("[DailyDigest] Error gathering stats:", err);
    }

    const digest = {
      id: generateId(),
      world_id: wid,
      digest_date: today,
      tasks_completed: tasksCompleted,
      tasks_failed: tasksFailed,
      total_tokens: totalTokens,
      total_cost: totalCost,
      top_achievement: topAchievement,
      most_active_zone: mostActiveZone,
      agent_of_day: agentOfDay,
      health_change: healthChange,
      ai_summary: "",
      weekly_summary: "",
      insights: JSON.stringify(
        this._detectInsights(
          tasksCompleted,
          tasksFailed,
          mostActiveZone,
          agentOfDay,
        ),
      ),
      raw_data: "{}",
      created_at: new Date().toISOString(),
    };

    // Save to DB
    try {
      await window.api.db.saveDigest(wid, digest);
    } catch (err) {
      console.warn("[DailyDigest] Could not save digest:", err);
    }

    return digest;
  }

  /**
   * Detect patterns and insights from digest data.
   * @returns {string[]}
   * @private
   */
  _detectInsights(completed, failed, activeZone, topAgent) {
    const insights = [];

    // Day-of-week productivity insight
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
    if (completed > 5) {
      insights.push(
        `You are highly productive on ${dayName}s with ${completed} tasks completed.`,
      );
    }

    // Agent dominance
    if (topAgent && topAgent !== "None") {
      const agentDef = AGENT_DEFS.find((a) => a.name === topAgent);
      if (agentDef) {
        insights.push(
          `${agentDef.emoji} ${topAgent} has been the most active agent today.`,
        );
      }
    }

    // Zone usage
    if (activeZone && activeZone !== "None") {
      insights.push(`Most activity is concentrated in ${activeZone}.`);
    }

    // Identify underused zones
    const underused = ZONE_DEFS.filter((z) => z.name !== activeZone).slice(
      -1,
    )[0];
    if (underused) {
      insights.push(
        `${underused.name} is your most underused zone. Consider exploring it.`,
      );
    }

    // Failure rate warning
    if (failed > 0 && completed > 0) {
      const rate = Math.round((failed / (completed + failed)) * 100);
      if (rate > 20) {
        insights.push(
          `Task failure rate is ${rate}%. Check failed tasks for common issues.`,
        );
      }
    }

    // Cost insight
    // No specific cost data per insight, but can suggest if zero activity
    if (completed === 0 && failed === 0) {
      insights.push(
        "No tasks have been run today. Start a task from the Dispatch Tower.",
      );
    }

    return insights;
  }

  /**
   * Build weekly summary from recent digests.
   * @param {object[]} digests
   * @returns {object}
   * @private
   */
  _buildWeeklySummary(digests) {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekKey = dateKey(weekAgo);

    const weekDigests = digests.filter((d) => d.digest_date >= weekKey);

    const totalCompleted = weekDigests.reduce(
      (s, d) => s + (d.tasks_completed || 0),
      0,
    );
    const totalFailed = weekDigests.reduce(
      (s, d) => s + (d.tasks_failed || 0),
      0,
    );
    const totalTokens = weekDigests.reduce(
      (s, d) => s + (d.total_tokens || 0),
      0,
    );
    const totalCost = weekDigests.reduce((s, d) => s + (d.total_cost || 0), 0);
    const activeDays = weekDigests.length;

    // Trend: compare first half vs second half
    const mid = Math.floor(weekDigests.length / 2);
    const firstHalf = weekDigests.slice(0, mid);
    const secondHalf = weekDigests.slice(mid);
    const firstAvg =
      firstHalf.reduce((s, d) => s + (d.tasks_completed || 0), 0) /
      (firstHalf.length || 1);
    const secondAvg =
      secondHalf.reduce((s, d) => s + (d.tasks_completed || 0), 0) /
      (secondHalf.length || 1);

    let trend = "stable";
    if (secondAvg > firstAvg * 1.2) trend = "up";
    else if (secondAvg < firstAvg * 0.8) trend = "down";

    return {
      totalCompleted,
      totalFailed,
      totalTokens,
      totalCost,
      activeDays,
      trend,
      digests: weekDigests,
    };
  }

  _emptyDigest(date) {
    return {
      id: "empty",
      digest_date: date,
      tasks_completed: 0,
      tasks_failed: 0,
      total_tokens: 0,
      total_cost: 0,
      top_achievement: "",
      most_active_zone: "",
      agent_of_day: "",
      health_change: "stable",
      ai_summary: "",
      insights: "[]",
    };
  }

  _emptyWeekly() {
    return {
      totalCompleted: 0,
      totalFailed: 0,
      totalTokens: 0,
      totalCost: 0,
      activeDays: 0,
      trend: "stable",
      digests: [],
    };
  }

  // ── Rendering ───────────────────────────────────────────────────────

  /**
   * Render the full digest content into the root element.
   * @private
   */
  _renderContent() {
    if (!this._root) return;
    this._root.innerHTML = "";

    // Tabs
    const tabs = this._createTabs();
    this._root.appendChild(tabs);

    // Tab contents
    for (const tab of TABS) {
      const content = document.createElement("div");
      content.className = "digest__tab-content";
      content.dataset.tab = tab.id;
      if (tab.id === this._activeTab)
        content.classList.add("digest__tab-content--active");
      this._root.appendChild(content);
    }

    // Populate active tab
    this._renderActiveTab();
  }

  /**
   * Create the tab bar.
   * @returns {HTMLElement}
   * @private
   */
  _createTabs() {
    const bar = document.createElement("div");
    bar.className = "digest__tabs";

    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.className = "digest__tab";
      if (tab.id === this._activeTab) btn.classList.add("digest__tab--active");
      btn.textContent = tab.label;
      btn.addEventListener("click", () => this._switchTab(tab.id));
      bar.appendChild(btn);
    }

    return bar;
  }

  /**
   * Switch active tab.
   * @param {string} tabId
   * @private
   */
  _switchTab(tabId) {
    this._activeTab = tabId;

    // Update tab button states
    const tabs = this._root.querySelectorAll(".digest__tab");
    tabs.forEach((t) => t.classList.remove("digest__tab--active"));
    const idx = TABS.findIndex((t) => t.id === tabId);
    if (idx >= 0 && tabs[idx]) tabs[idx].classList.add("digest__tab--active");

    // Update content visibility
    const contents = this._root.querySelectorAll(".digest__tab-content");
    contents.forEach((c) => {
      c.classList.toggle(
        "digest__tab-content--active",
        c.dataset.tab === tabId,
      );
    });

    this._renderActiveTab();
  }

  /**
   * Render content for the currently active tab.
   * @private
   */
  _renderActiveTab() {
    const container = this._root?.querySelector(
      `.digest__tab-content[data-tab="${this._activeTab}"]`,
    );
    if (!container) return;
    container.innerHTML = "";

    switch (this._activeTab) {
      case "today":
        this._renderToday(container);
        break;
      case "weekly":
        this._renderWeekly(container);
        break;
      case "goals":
        this._renderGoals(container);
        break;
      case "history":
        this._renderHistory(container);
        break;
    }
  }

  // ── Today tab ───────────────────────────────────────────────────────

  /**
   * Render today's digest view.
   * @param {HTMLElement} container
   * @private
   */
  _renderToday(container) {
    const d = this._todayDigest || this._emptyDigest(dateKey());

    // Date header
    const header = document.createElement("div");
    header.className = "digest__date-header";

    const dateEl = document.createElement("div");
    dateEl.className = "digest__date";
    dateEl.textContent = formatDate(d.digest_date);

    const healthTrend = trendArrow(d.health_change);
    const trendEl = document.createElement("span");
    trendEl.className = `digest__trend ${healthTrend.cls}`;
    trendEl.textContent = `${healthTrend.symbol} ${healthTrend.label}`;

    header.appendChild(dateEl);
    header.appendChild(trendEl);
    container.appendChild(header);

    // Stats grid
    const statsGrid = document.createElement("div");
    statsGrid.className = "digest__stats";

    const stats = [
      {
        icon: "\u2713",
        label: "Completed",
        value: String(d.tasks_completed),
        cls: "digest__stat-value--green",
      },
      {
        icon: "\u2717",
        label: "Failed",
        value: String(d.tasks_failed),
        cls: "digest__stat-value--red",
      },
      {
        icon: "\u{1F4AC}",
        label: "Tokens",
        value: fmtNumber(d.total_tokens),
        cls: "digest__stat-value--blue",
      },
      {
        icon: "\u{1F4B0}",
        label: "Cost",
        value: fmtCost(d.total_cost),
        cls: "digest__stat-value--amber",
      },
    ];

    for (const s of stats) {
      const card = document.createElement("div");
      card.className = "digest__stat-card";

      const icon = document.createElement("span");
      icon.className = "digest__stat-icon";
      icon.textContent = s.icon;

      const body = document.createElement("div");
      body.className = "digest__stat-body";

      const val = document.createElement("div");
      val.className = `digest__stat-value ${s.cls}`;
      val.textContent = s.value;

      const lbl = document.createElement("div");
      lbl.className = "digest__stat-label";
      lbl.textContent = s.label;

      body.appendChild(val);
      body.appendChild(lbl);
      card.appendChild(icon);
      card.appendChild(body);
      statsGrid.appendChild(card);
    }
    container.appendChild(statsGrid);

    // Highlights
    const highlights = document.createElement("div");
    highlights.className = "digest__highlights";

    const highlightData = [
      {
        icon: "\u{1F3C6}",
        title: "Top Achievement",
        value: d.top_achievement || "None yet",
      },
      {
        icon: "\u{1F5FA}",
        title: "Most Active Zone",
        value: d.most_active_zone || "None",
      },
      {
        icon: "\u{1F916}",
        title: "Agent of the Day",
        value: d.agent_of_day || "None",
      },
    ];

    for (const h of highlightData) {
      const row = document.createElement("div");
      row.className = "digest__highlight";

      const ico = document.createElement("span");
      ico.className = "digest__highlight-icon";
      ico.textContent = h.icon;

      const body = document.createElement("div");
      body.className = "digest__highlight-body";

      const title = document.createElement("div");
      title.className = "digest__highlight-title";
      title.textContent = h.title;

      const val = document.createElement("div");
      val.className = "digest__highlight-value";
      val.textContent = h.value;

      body.appendChild(title);
      body.appendChild(val);
      row.appendChild(ico);
      row.appendChild(body);
      highlights.appendChild(row);
    }
    container.appendChild(highlights);

    // AI Summary section
    this._renderAISection(container, d);

    // Insights section
    this._renderInsights(container, d);
  }

  /**
   * Render the AI summary button and result area.
   * @param {HTMLElement} container
   * @param {object} digest
   * @private
   */
  _renderAISection(container, digest) {
    const section = document.createElement("div");
    section.className = "digest__ai-section";

    const titleEl = document.createElement("div");
    titleEl.className = "digest__section-title";
    titleEl.textContent = "AI Summary";
    section.appendChild(titleEl);

    if (digest.ai_summary) {
      const quote = document.createElement("div");
      quote.className = "digest__ai-summary";
      quote.textContent = digest.ai_summary;
      section.appendChild(quote);
    } else {
      const btn = document.createElement("button");
      btn.className = "digest__ai-btn";
      btn.textContent = "\u2728 Generate AI Summary";
      btn.disabled = this._aiLoading;
      btn.addEventListener("click", () =>
        this._generateAISummary(section, digest),
      );
      section.appendChild(btn);
    }

    container.appendChild(section);
  }

  /**
   * Call the AI dispatch API to generate a summary.
   * @param {HTMLElement} section
   * @param {object} digest
   * @private
   */
  async _generateAISummary(section, digest) {
    if (this._aiLoading) return;
    this._aiLoading = true;

    // Replace button with loading indicator
    const btn = section.querySelector(".digest__ai-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating...";
    }

    const loading = document.createElement("div");
    loading.className = "digest__ai-loading";
    loading.textContent = "Asking AI to summarize your day...";
    section.appendChild(loading);

    try {
      const prompt = this._buildAIPrompt(digest);
      const result = await window.api.ai.dispatch({
        prompt,
        system:
          "You are a concise assistant summarizing daily activity in a virtual world called Claude World. Write 2-3 short sentences describing the day. Be encouraging and specific.",
        maxTokens: 200,
      });

      const summary = result?.text || result?.content || result || "";
      const text =
        typeof summary === "string" ? summary : JSON.stringify(summary);

      // Save to digest
      digest.ai_summary = text;
      try {
        await window.api.db.updateDigest(digest.id, { ai_summary: text });
      } catch (err) {
        console.warn("[DailyDigest] Could not persist AI summary:", err);
      }

      // Replace loading with summary
      loading.remove();
      if (btn) btn.remove();

      const quote = document.createElement("div");
      quote.className = "digest__ai-summary";
      quote.textContent = text;
      section.appendChild(quote);
    } catch (err) {
      console.error("[DailyDigest] AI summary error:", err);
      loading.textContent =
        "Could not generate summary. Check your API key in Settings.";
      loading.className = "";
      loading.style.cssText =
        "font-size:12px;color:var(--accent-red);padding:8px 0;";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\u2728 Generate AI Summary";
      }
    } finally {
      this._aiLoading = false;
    }
  }

  /**
   * Build the AI prompt from digest data.
   * @param {object} d
   * @returns {string}
   * @private
   */
  _buildAIPrompt(d) {
    return [
      `Daily digest for ${formatDate(d.digest_date)}:`,
      `- Tasks completed: ${d.tasks_completed}`,
      `- Tasks failed: ${d.tasks_failed}`,
      `- Tokens used: ${fmtNumber(d.total_tokens)}`,
      `- Cost: ${fmtCost(d.total_cost)}`,
      `- Top achievement: ${d.top_achievement || "None"}`,
      `- Most active zone: ${d.most_active_zone || "None"}`,
      `- Agent of the day: ${d.agent_of_day || "None"}`,
      `- World health trend: ${d.health_change}`,
      "",
      "Summarize this day in Claude World in 2-3 encouraging sentences.",
    ].join("\n");
  }

  /**
   * Render insights section.
   * @param {HTMLElement} container
   * @param {object} digest
   * @private
   */
  _renderInsights(container, digest) {
    let insights = [];
    try {
      insights =
        typeof digest.insights === "string"
          ? JSON.parse(digest.insights)
          : digest.insights || [];
    } catch {
      insights = [];
    }

    if (insights.length === 0) return;

    const titleEl = document.createElement("div");
    titleEl.className = "digest__section-title";
    titleEl.textContent = "Insights";
    container.appendChild(titleEl);

    const list = document.createElement("div");
    list.className = "digest__insights";

    for (const text of insights) {
      const row = document.createElement("div");
      row.className = "digest__insight";

      const icon = document.createElement("span");
      icon.className = "digest__insight-icon";
      icon.textContent = "\u{1F4A1}";

      const txt = document.createElement("div");
      txt.className = "digest__insight-text";
      txt.textContent = text;

      row.appendChild(icon);
      row.appendChild(txt);
      list.appendChild(row);
    }

    container.appendChild(list);
  }

  // ── Weekly tab ──────────────────────────────────────────────────────

  /**
   * Render the weekly summary tab.
   * @param {HTMLElement} container
   * @private
   */
  _renderWeekly(container) {
    const w = this._weeklyData || this._emptyWeekly();

    const titleEl = document.createElement("div");
    titleEl.className = "digest__section-title";
    titleEl.textContent = "Past 7 Days";
    container.appendChild(titleEl);

    const grid = document.createElement("div");
    grid.className = "digest__weekly";

    const trend = trendArrow(w.trend);

    const rows = [
      {
        label: "Total Completed",
        value: String(w.totalCompleted),
        trend: null,
      },
      { label: "Total Failed", value: String(w.totalFailed), trend: null },
      { label: "Total Tokens", value: fmtNumber(w.totalTokens), trend: null },
      { label: "Total Cost", value: fmtCost(w.totalCost), trend: null },
      { label: "Active Days", value: `${w.activeDays} / 7`, trend: null },
      { label: "Productivity Trend", value: trend.label, trend: trend },
    ];

    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "digest__weekly-row";

      const label = document.createElement("span");
      label.className = "digest__weekly-label";
      label.textContent = r.label;

      const valWrap = document.createElement("span");
      valWrap.className = "digest__weekly-value";

      if (r.trend) {
        const trendEl = document.createElement("span");
        trendEl.className = `digest__trend ${r.trend.cls}`;
        trendEl.textContent = `${r.trend.symbol} ${r.value}`;
        valWrap.appendChild(trendEl);
      } else {
        valWrap.textContent = r.value;
      }

      row.appendChild(label);
      row.appendChild(valWrap);
      grid.appendChild(row);
    }

    container.appendChild(grid);

    // Per-day breakdown
    if (w.digests && w.digests.length > 0) {
      const breakdownTitle = document.createElement("div");
      breakdownTitle.className = "digest__section-title";
      breakdownTitle.style.marginTop = "16px";
      breakdownTitle.textContent = "Day by Day";
      container.appendChild(breakdownTitle);

      const breakdownList = document.createElement("div");
      breakdownList.className = "digest__history";

      for (const d of w.digests.slice().reverse()) {
        const item = document.createElement("div");
        item.className = "digest__history-item";

        const left = document.createElement("div");
        const dateSpan = document.createElement("div");
        dateSpan.className = "digest__history-date";
        dateSpan.textContent = shortDate(d.digest_date);
        left.appendChild(dateSpan);

        const healthTrend = trendArrow(d.health_change);
        const trendBadge = document.createElement("span");
        trendBadge.className = `digest__trend ${healthTrend.cls}`;
        trendBadge.textContent = `${healthTrend.symbol} ${healthTrend.label}`;
        trendBadge.style.marginTop = "4px";
        trendBadge.style.display = "inline-block";
        left.appendChild(trendBadge);

        const right = document.createElement("span");
        right.className = "digest__history-tasks";
        right.textContent = `${d.tasks_completed} done, ${d.tasks_failed} failed`;

        item.appendChild(left);
        item.appendChild(right);
        breakdownList.appendChild(item);
      }

      container.appendChild(breakdownList);
    }
  }

  // ── Goals tab ───────────────────────────────────────────────────────

  /**
   * Render the goals tab with progress bars and add form.
   * @param {HTMLElement} container
   * @private
   */
  _renderGoals(container) {
    const titleEl = document.createElement("div");
    titleEl.className = "digest__section-title";
    titleEl.textContent = "Daily Goals";
    container.appendChild(titleEl);

    // Existing goals
    const goalsContainer = document.createElement("div");
    goalsContainer.className = "digest__goals";

    if (this._goals.length === 0) {
      const empty = document.createElement("div");
      empty.className = "digest__empty";
      empty.textContent = "No goals set for today. Add one below.";
      goalsContainer.appendChild(empty);
    } else {
      for (const g of this._goals) {
        goalsContainer.appendChild(this._renderGoalCard(g));
      }
    }
    container.appendChild(goalsContainer);

    // Add goal form
    const addForm = document.createElement("div");
    addForm.className = "digest__goal-add";

    const labelInput = document.createElement("input");
    labelInput.className = "digest__goal-input";
    labelInput.type = "text";
    labelInput.placeholder = "Goal description...";
    labelInput.setAttribute("aria-label", "Goal description");

    const targetInput = document.createElement("input");
    targetInput.className = "digest__goal-target";
    targetInput.type = "number";
    targetInput.min = "1";
    targetInput.value = "5";
    targetInput.placeholder = "#";
    targetInput.setAttribute("aria-label", "Goal target");

    const addBtn = document.createElement("button");
    addBtn.className = "digest__add-btn";
    addBtn.textContent = "Add Goal";
    addBtn.addEventListener("click", async () => {
      const label = labelInput.value.trim();
      const target = parseInt(targetInput.value, 10) || 1;
      if (!label) return;

      const goal = {
        id: generateId(),
        world_id: this._worldId,
        goal_date: dateKey(),
        label,
        target_value: target,
        current_value: 0,
        goal_type: "tasks",
        completed: 0,
      };

      try {
        await window.api.db.createGoal(this._worldId, goal);
        this._goals.push(goal);
      } catch (err) {
        console.warn("[DailyDigest] Could not save goal:", err);
        this._goals.push(goal);
      }

      labelInput.value = "";
      this._renderActiveTab();
    });

    labelInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        addBtn.click();
      }
    });

    addForm.appendChild(labelInput);
    addForm.appendChild(targetInput);
    addForm.appendChild(addBtn);
    container.appendChild(addForm);
  }

  /**
   * Render a single goal card with progress bar.
   * @param {object} goal
   * @returns {HTMLElement}
   * @private
   */
  _renderGoalCard(goal) {
    const card = document.createElement("div");
    card.className = "digest__goal";

    const header = document.createElement("div");
    header.className = "digest__goal-header";

    const label = document.createElement("span");
    label.className = "digest__goal-label";
    label.textContent = goal.label;

    const count = document.createElement("span");
    count.className = "digest__goal-count";
    const current = Math.min(goal.current_value, goal.target_value);
    count.textContent = `${current} / ${goal.target_value}`;

    header.appendChild(label);
    header.appendChild(count);
    card.appendChild(header);

    const barBg = document.createElement("div");
    barBg.className = "digest__goal-bar";

    const fill = document.createElement("div");
    const pct = Math.min(
      100,
      Math.round((current / (goal.target_value || 1)) * 100),
    );
    fill.className = "digest__goal-fill";
    if (pct >= 100) fill.classList.add("digest__goal-fill--complete");
    fill.style.width = pct + "%";

    barBg.appendChild(fill);
    card.appendChild(barBg);

    return card;
  }

  // ── History tab ─────────────────────────────────────────────────────

  /**
   * Render the digest history list.
   * @param {HTMLElement} container
   * @private
   */
  _renderHistory(container) {
    const titleEl = document.createElement("div");
    titleEl.className = "digest__section-title";
    titleEl.textContent = "Digest History";
    container.appendChild(titleEl);

    if (this._history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "digest__empty";
      empty.textContent =
        "No past digests yet. They will appear here after each day.";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "digest__history";

    // Show most recent first
    const sorted = [...this._history].sort((a, b) =>
      b.digest_date.localeCompare(a.digest_date),
    );

    for (const d of sorted) {
      const item = document.createElement("div");
      item.className = "digest__history-item";
      if (d.digest_date === dateKey()) {
        item.classList.add("digest__history-item--active");
      }

      const left = document.createElement("div");

      const dateSpan = document.createElement("div");
      dateSpan.className = "digest__history-date";
      dateSpan.textContent = shortDate(d.digest_date);
      left.appendChild(dateSpan);

      if (d.ai_summary) {
        const meta = document.createElement("div");
        meta.className = "digest__history-meta";
        meta.textContent = "AI summary available";
        left.appendChild(meta);
      }

      const right = document.createElement("span");
      right.className = "digest__history-tasks";
      right.textContent = `${d.tasks_completed} completed`;

      item.appendChild(left);
      item.appendChild(right);

      // Click to view past digest
      item.addEventListener("click", () => {
        this._viewHistoricDigest(d);
      });

      list.appendChild(item);
    }

    container.appendChild(list);
  }

  /**
   * View a historic digest by switching to the Today tab with that digest's data.
   * @param {object} digest
   * @private
   */
  _viewHistoricDigest(digest) {
    this._todayDigest = digest;
    this._switchTab("today");
  }
}
