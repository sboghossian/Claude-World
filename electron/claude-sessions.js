/**
 * claude-sessions.js — Detect live Claude Code CLI sessions on this machine
 *
 * Polls `ps aux` for Claude Code processes, reads ~/.claude/projects/ for
 * recent session files, parses JSONL for per-agent activity detail, and
 * exposes a push-based monitor that fires a callback whenever the active
 * session list changes.
 *
 * CJS module — runs in the Electron main process.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Constants ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

/** Process name patterns that indicate a Claude Code session. */
const PROCESS_PATTERNS = [
  /\bclaude\b/i,
  /\bclaude-code\b/i,
  /node.*claude/i,
  /anthropic.*agent/i,
];

/** Our own PID — never include ourselves. */
const SELF_PID = process.pid;

// ── Tool → activity mapping ─────────────────────────────────────────────

const TOOL_TO_ACTIVITY = {
  Read: "reading",
  Write: "writing",
  Edit: "writing",
  Bash: "building",
  Grep: "searching",
  Glob: "searching",
  Agent: "thinking",
  TodoWrite: "thinking",
  WebSearch: "searching",
  WebFetch: "reading",
};

/** Detect if a Bash command is a test command. */
function isBashTest(args) {
  if (!args) return false;
  const s = typeof args === "string" ? args : JSON.stringify(args);
  return /\b(test|jest|vitest|mocha|pytest|npm\s+test|yarn\s+test|pnpm\s+test|cargo\s+test)\b/i.test(
    s,
  );
}

/** Detect if a Bash command is a build command. */
function isBashBuild(args) {
  if (!args) return false;
  const s = typeof args === "string" ? args : JSON.stringify(args);
  return /\b(build|compile|webpack|vite|tsc|make|cargo\s+build|npm\s+run\s+build)\b/i.test(
    s,
  );
}

// ── State ────────────────────────────────────────────────────────────────

let _pollTimer = null;
let _callback = null;
/** @type {Map<number, SessionInfo>} */
let _sessions = new Map();
/** @type {SessionInfo[]} */
let _lastSnapshot = [];

// ── Types (JSDoc only) ──────────────────────────────────────────────────

/**
 * @typedef {Object} AgentInfo
 * @property {string}      id          — unique id: 'session-{pid}-agent-{index}'
 * @property {number}      sessionPid
 * @property {string}      role        — 'main'|'coder'|'researcher'|'explorer'|'reviewer'|'builder'
 * @property {string}      activity    — 'reading'|'writing'|'searching'|'thinking'|'building'|'testing'|'idle'|'chatting'
 * @property {string|null} target      — filename or description
 * @property {string|null} tool        — last tool used
 */

/**
 * @typedef {Object} SessionInfo
 * @property {number}      pid
 * @property {string}      command
 * @property {number}      cpu        — % CPU
 * @property {number}      mem        — % MEM
 * @property {string}      started    — process start time string
 * @property {string}      cwd        — working directory (best-effort)
 * @property {string}      status     — 'active' | 'idle' | 'streaming'
 * @property {string|null} model      — model name if detected
 * @property {string|null} task       — current task snippet if detected
 * @property {number}      tokens     — token count estimate from session file
 * @property {number}      firstSeen  — epoch ms when we first detected this PID
 * @property {AgentInfo[]} agents     — per-agent breakdown
 */

// ── Process detection ────────────────────────────────────────────────────

/**
 * Run `ps aux` and parse into structured rows.
 * @returns {Array<{pid:number, cpu:number, mem:number, started:string, command:string}>}
 */
function getPsRows() {
  try {
    const raw = execSync("ps aux 2>/dev/null", {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = raw.split("\n").slice(1); // skip header
    const rows = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid) || pid === SELF_PID) continue;
      const ppid = process.ppid || 0;
      if (pid === ppid) continue;
      const cpu = parseFloat(parts[2]) || 0;
      const mem = parseFloat(parts[3]) || 0;
      const started = parts[8] || "";
      const command = parts.slice(10).join(" ");
      rows.push({ pid, cpu, mem, started, command });
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Filter ps rows for Claude Code processes.
 */
function filterClaudeProcesses(rows) {
  return rows.filter((r) => {
    if (r.pid === SELF_PID) return false;
    if (/electron/i.test(r.command) && /claude-world/i.test(r.command))
      return false;
    return PROCESS_PATTERNS.some((re) => re.test(r.command));
  });
}

/**
 * Try to get the working directory of a process.
 */
function getProcessCwd(pid) {
  try {
    if (process.platform === "darwin") {
      const out = execSync(
        `lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`,
        { encoding: "utf8", timeout: 3000 },
      );
      const match = out.match(/^n(.+)$/m);
      return match ? match[1] : "";
    }
    const link = `/proc/${pid}/cwd`;
    if (fs.existsSync(link)) {
      return fs.readlinkSync(link);
    }
  } catch {
    // ignore
  }
  return "";
}

// ── Session file reading ─────────────────────────────────────────────────

/**
 * Scan ~/.claude/projects/ for recent .jsonl session files.
 */
function getRecentSessionFiles() {
  const results = [];
  if (!fs.existsSync(PROJECTS_DIR)) return results;

  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = path.join(PROJECTS_DIR, dir.name);
      let files;
      try {
        files = fs.readdirSync(projectPath);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const filePath = path.join(projectPath, f);
        try {
          const stat = fs.statSync(filePath);
          if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) continue;
          const lastLines = readLastLines(filePath, 40);
          results.push({ file: filePath, mtime: stat.mtimeMs, lastLines });
        } catch {
          continue;
        }
      }
    }
  } catch {
    // ignore
  }

  results.sort((a, b) => b.mtime - a.mtime);
  return results.slice(0, 20);
}

/**
 * Read the last N lines of a file (best-effort tail).
 */
function readLastLines(filePath, n) {
  try {
    const bufSize = 32768;
    const buf = Buffer.alloc(bufSize);
    const fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const readStart = Math.max(0, stat.size - bufSize);
    const bytesRead = fs.readSync(fd, buf, 0, bufSize, readStart);
    fs.closeSync(fd);
    const text = buf.toString("utf8", 0, bytesRead);
    const lines = text.split("\n").filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/**
 * Parse session lines for model, tokens, task, and per-agent activity.
 * @param {string[]} lines
 * @returns {{ model: string|null, tokens: number, task: string|null, agents: AgentInfo[] }}
 */
function parseSessionLines(lines, sessionPid) {
  let model = null;
  let tokens = 0;
  let task = null;

  // Track tool usage counts and recent tool calls per agent thread
  const toolCounts = {}; // tool -> count
  const recentTools = []; // { tool, target, isSubAgent, agentIndex }
  let subAgentCount = 0;
  let hasHumanMessage = false;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (obj.model) model = obj.model;
      if (obj.usage?.total_tokens) tokens += obj.usage.total_tokens;
      if (obj.usage?.input_tokens) tokens += obj.usage.input_tokens;

      // Detect human messages (chatting activity for main)
      if (obj.type === "human" || obj.role === "human" || obj.role === "user") {
        hasHumanMessage = true;
        const content =
          typeof obj.content === "string"
            ? obj.content
            : obj.message?.content || "";
        if (content) task = content.slice(0, 120);
      }

      // Detect assistant messages with tool_use
      if (obj.type === "assistant" || obj.role === "assistant") {
        const content = obj.content || obj.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              const toolName = block.name || "";
              toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;

              // Extract target from tool input
              let target = null;
              if (block.input) {
                target =
                  block.input.file_path ||
                  block.input.path ||
                  block.input.pattern ||
                  block.input.command?.slice(0, 60) ||
                  null;
              }

              // Check for sub-agent spawn
              const isSubAgent =
                toolName === "Agent" ||
                toolName === "dispatch_agent" ||
                /sub.?agent/i.test(toolName);
              if (isSubAgent) subAgentCount++;

              recentTools.push({
                tool: toolName,
                target,
                isSubAgent,
              });
            }
          }
        }
        // Also detect text content as task
        if (typeof content === "string" && content.length > 0) {
          // Don't overwrite human task with assistant response
        }
      }

      // Detect tool_result entries
      if (obj.type === "tool_result" || obj.role === "tool") {
        // These confirm the tool was executed
      }

      // Detect explicit agent/subagent markers
      if (obj.type === "agent" || obj.subagent_type) {
        subAgentCount++;
      }
    } catch {
      // not valid JSON
    }
  }

  // ── Build agents array from tool usage patterns ──────────────────

  const agents = [];
  const pid = sessionPid || 0;

  // Always create the main agent
  const mainActivity = _inferMainActivity(
    toolCounts,
    recentTools,
    hasHumanMessage,
  );
  agents.push({
    id: `session-${pid}-agent-0`,
    sessionPid: pid,
    role: "main",
    activity: mainActivity.activity,
    target: mainActivity.target,
    tool: mainActivity.tool,
  });

  // Create additional agents based on detected patterns
  // If there are sub-agent spawns, create researcher agents
  if (subAgentCount > 0) {
    for (let i = 0; i < Math.min(subAgentCount, 3); i++) {
      agents.push({
        id: `session-${pid}-agent-${agents.length}`,
        sessionPid: pid,
        role: "researcher",
        activity: "searching",
        target: task ? task.slice(0, 40) : null,
        tool: "Agent",
      });
    }
  }

  // Detect coding agent if lots of Write/Edit
  const writeCount = (toolCounts["Write"] || 0) + (toolCounts["Edit"] || 0);
  const readCount =
    (toolCounts["Read"] || 0) +
    (toolCounts["Grep"] || 0) +
    (toolCounts["Glob"] || 0);
  const bashCount = toolCounts["Bash"] || 0;

  if (writeCount >= 2) {
    const lastWrite = [...recentTools]
      .reverse()
      .find((t) => t.tool === "Write" || t.tool === "Edit");
    agents.push({
      id: `session-${pid}-agent-${agents.length}`,
      sessionPid: pid,
      role: "coder",
      activity: "writing",
      target: lastWrite?.target || null,
      tool: lastWrite?.tool || "Edit",
    });
  }

  // Detect explorer agent if lots of Read/Grep/Glob
  if (readCount >= 3) {
    const lastRead = [...recentTools]
      .reverse()
      .find((t) => ["Read", "Grep", "Glob"].includes(t.tool));
    agents.push({
      id: `session-${pid}-agent-${agents.length}`,
      sessionPid: pid,
      role: "explorer",
      activity: "searching",
      target: lastRead?.target || null,
      tool: lastRead?.tool || "Grep",
    });
  }

  // Detect reviewer/tester if Bash with test commands
  const hasTests = recentTools.some(
    (t) => t.tool === "Bash" && isBashTest(t.target),
  );
  if (hasTests) {
    agents.push({
      id: `session-${pid}-agent-${agents.length}`,
      sessionPid: pid,
      role: "reviewer",
      activity: "testing",
      target: "running tests",
      tool: "Bash",
    });
  }

  // Detect builder if Bash with build commands
  const hasBuilds = recentTools.some(
    (t) => t.tool === "Bash" && isBashBuild(t.target),
  );
  if (hasBuilds && !hasTests) {
    agents.push({
      id: `session-${pid}-agent-${agents.length}`,
      sessionPid: pid,
      role: "builder",
      activity: "building",
      target: "building project",
      tool: "Bash",
    });
  }

  return { model, tokens, task, agents };
}

/**
 * Infer main agent activity from tool usage.
 */
function _inferMainActivity(toolCounts, recentTools, hasHumanMessage) {
  const lastTool = recentTools.length
    ? recentTools[recentTools.length - 1]
    : null;

  if (!lastTool) {
    return {
      activity: hasHumanMessage ? "chatting" : "idle",
      target: null,
      tool: null,
    };
  }

  const tool = lastTool.tool;
  let activity = TOOL_TO_ACTIVITY[tool] || "thinking";

  // Override for test/build bash commands
  if (tool === "Bash") {
    if (isBashTest(lastTool.target)) activity = "testing";
    else if (isBashBuild(lastTool.target)) activity = "building";
  }

  return {
    activity,
    target: lastTool.target,
    tool,
  };
}

// ── Polling logic ────────────────────────────────────────────────────────

function poll() {
  const rows = getPsRows();
  const claudeRows = filterClaudeProcesses(rows);
  const sessionFiles = getRecentSessionFiles();

  const now = Date.now();
  const newSessions = new Map();

  for (const row of claudeRows) {
    const existing = _sessions.get(row.pid);
    const cwd = existing?.cwd || getProcessCwd(row.pid);

    // Find matching session file by recency
    const matchingFile =
      sessionFiles.find((sf) => {
        // Try to match by cwd in file path
        if (cwd) {
          const cwdEncoded = cwd.replace(/\//g, "-").replace(/^-/, "");
          if (sf.file.includes(cwdEncoded)) return true;
        }
        return false;
      }) || sessionFiles[0];

    // Parse agent detail from JSONL
    const parsed = matchingFile
      ? parseSessionLines(matchingFile.lastLines, row.pid)
      : { model: null, tokens: 0, task: null, agents: [] };

    // Ensure at least one agent exists
    if (parsed.agents.length === 0) {
      parsed.agents.push({
        id: `session-${row.pid}-agent-0`,
        sessionPid: row.pid,
        role: "main",
        activity: row.cpu > 5 ? "thinking" : "idle",
        target: null,
        tool: null,
      });
    }

    /** @type {SessionInfo} */
    const info = {
      pid: row.pid,
      command: row.command,
      cpu: row.cpu,
      mem: row.mem,
      started: row.started,
      cwd,
      status: row.cpu > 5 ? "streaming" : row.cpu > 0.5 ? "active" : "idle",
      model: parsed.model,
      task: parsed.task,
      tokens: parsed.tokens,
      firstSeen: existing?.firstSeen || now,
      agents: parsed.agents,
    };

    newSessions.set(row.pid, info);
  }

  const snapshot = [...newSessions.values()];

  const changed =
    snapshot.length !== _lastSnapshot.length ||
    snapshot.some((s) => {
      const prev = _sessions.get(s.pid);
      return (
        !prev ||
        prev.status !== s.status ||
        prev.cpu !== s.cpu ||
        prev.agents?.length !== s.agents?.length
      );
    });

  _sessions = newSessions;
  _lastSnapshot = snapshot;

  if (changed && _callback) {
    _callback(snapshot);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

function startSessionMonitor(callback) {
  _callback = callback;
  poll();
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  console.log("[claude-sessions] Monitor started (poll every 5s)");
}

function stopSessionMonitor() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  _callback = null;
  console.log("[claude-sessions] Monitor stopped");
}

function getActiveSessions() {
  return _lastSnapshot;
}

function getSessionHistory() {
  return getRecentSessionFiles();
}

module.exports = {
  startSessionMonitor,
  stopSessionMonitor,
  getActiveSessions,
  getSessionHistory,
};
