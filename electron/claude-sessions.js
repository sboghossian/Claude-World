/**
 * claude-sessions.js — Detect live Claude Code CLI sessions on this machine
 *
 * Polls `ps aux` for Claude Code processes, reads ~/.claude/projects/ for
 * recent session files, and exposes a push-based monitor that fires a
 * callback whenever the active session list changes.
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

// ── State ────────────────────────────────────────────────────────────────

let _pollTimer = null;
let _callback = null;
/** @type {Map<number, SessionInfo>} */
let _sessions = new Map();
/** @type {SessionInfo[]} */
let _lastSnapshot = [];

// ── Types (JSDoc only) ──────────────────────────────────────────────────

/**
 * @typedef {Object} SessionInfo
 * @property {number}  pid
 * @property {string}  command
 * @property {number}  cpu        — % CPU
 * @property {number}  mem        — % MEM
 * @property {string}  started    — process start time string
 * @property {string}  cwd        — working directory (best-effort)
 * @property {string}  status     — 'active' | 'idle' | 'streaming'
 * @property {string|null} model  — model name if detected
 * @property {string|null} task   — current task snippet if detected
 * @property {number}  tokens     — token count estimate from session file
 * @property {number}  firstSeen  — epoch ms when we first detected this PID
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
      // ps aux columns: USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND…
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid) || pid === SELF_PID) continue;
      // Also skip our own Electron child processes
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
 * @param {Array} rows
 * @returns {Array}
 */
function filterClaudeProcesses(rows) {
  return rows.filter((r) => {
    // Exclude ourselves and electron-based processes (the app itself)
    if (r.pid === SELF_PID) return false;
    if (/electron/i.test(r.command) && /claude-world/i.test(r.command))
      return false;
    // Must match at least one pattern
    return PROCESS_PATTERNS.some((re) => re.test(r.command));
  });
}

/**
 * Try to get the working directory of a process via lsof (macOS) or /proc (Linux).
 * @param {number} pid
 * @returns {string}
 */
function getProcessCwd(pid) {
  try {
    if (process.platform === "darwin") {
      const out = execSync(
        `lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`,
        {
          encoding: "utf8",
          timeout: 3000,
        },
      );
      const match = out.match(/^n(.+)$/m);
      return match ? match[1] : "";
    }
    // Linux: /proc/PID/cwd symlink
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
 * Returns the most recent entries parsed from the last few lines.
 * @returns {Array<{file:string, mtime:number, lastLines:string[]}>}
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
          // Only include files modified in the last 24 hours
          if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) continue;
          const lastLines = readLastLines(filePath, 5);
          results.push({
            file: filePath,
            mtime: stat.mtimeMs,
            lastLines,
          });
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
 * @param {string} filePath
 * @param {number} n
 * @returns {string[]}
 */
function readLastLines(filePath, n) {
  try {
    const buf = Buffer.alloc(8192);
    const fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const readStart = Math.max(0, stat.size - 8192);
    const bytesRead = fs.readSync(fd, buf, 0, 8192, readStart);
    fs.closeSync(fd);
    const text = buf.toString("utf8", 0, bytesRead);
    const lines = text.split("\n").filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/**
 * Try to extract model name and token count from session file lines.
 * @param {string[]} lines
 * @returns {{ model: string|null, tokens: number, task: string|null }}
 */
function parseSessionLines(lines) {
  let model = null;
  let tokens = 0;
  let task = null;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.model) model = obj.model;
      if (obj.usage?.total_tokens) tokens += obj.usage.total_tokens;
      if (obj.usage?.input_tokens) tokens += obj.usage.input_tokens;
      if (obj.message?.content && typeof obj.message.content === "string") {
        task = obj.message.content.slice(0, 120);
      }
      if (obj.type === "human" && obj.content) {
        task = (
          typeof obj.content === "string"
            ? obj.content
            : JSON.stringify(obj.content)
        ).slice(0, 120);
      }
    } catch {
      // not valid JSON — skip
    }
  }

  return { model, tokens, task };
}

// ── Polling logic ────────────────────────────────────────────────────────

/**
 * Run one poll cycle: detect processes, enrich with session file data,
 * diff against previous snapshot, and fire callback if changed.
 */
function poll() {
  const rows = getPsRows();
  const claudeRows = filterClaudeProcesses(rows);
  const sessionFiles = getRecentSessionFiles();

  // Parse aggregate info from the most recent session files
  const aggregateFileInfo = { model: null, tokens: 0, task: null };
  for (const sf of sessionFiles.slice(0, 3)) {
    const parsed = parseSessionLines(sf.lastLines);
    if (parsed.model) aggregateFileInfo.model = parsed.model;
    aggregateFileInfo.tokens += parsed.tokens;
    if (parsed.task) aggregateFileInfo.task = parsed.task;
  }

  const now = Date.now();
  const newSessions = new Map();

  for (const row of claudeRows) {
    const existing = _sessions.get(row.pid);
    const cwd = existing?.cwd || getProcessCwd(row.pid);

    /** @type {SessionInfo} */
    const info = {
      pid: row.pid,
      command: row.command,
      cpu: row.cpu,
      mem: row.mem,
      started: row.started,
      cwd,
      status: row.cpu > 5 ? "streaming" : row.cpu > 0.5 ? "active" : "idle",
      model: aggregateFileInfo.model,
      task: aggregateFileInfo.task,
      tokens: aggregateFileInfo.tokens,
      firstSeen: existing?.firstSeen || now,
    };

    newSessions.set(row.pid, info);
  }

  // Build snapshot array
  const snapshot = [...newSessions.values()];

  // Detect changes (simple: compare PID sets + status)
  const changed =
    snapshot.length !== _lastSnapshot.length ||
    snapshot.some((s) => {
      const prev = _sessions.get(s.pid);
      return !prev || prev.status !== s.status || prev.cpu !== s.cpu;
    });

  _sessions = newSessions;
  _lastSnapshot = snapshot;

  if (changed && _callback) {
    _callback(snapshot);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Start polling for Claude Code sessions.
 * @param {(sessions: SessionInfo[]) => void} callback — called when sessions change
 */
function startSessionMonitor(callback) {
  _callback = callback;
  // Run immediately
  poll();
  // Then poll on interval
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  console.log("[claude-sessions] Monitor started (poll every 5s)");
}

/**
 * Stop polling.
 */
function stopSessionMonitor() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  _callback = null;
  console.log("[claude-sessions] Monitor stopped");
}

/**
 * Get the current snapshot of active sessions (no poll — returns cached).
 * @returns {SessionInfo[]}
 */
function getActiveSessions() {
  return _lastSnapshot;
}

/**
 * Get recent session history from ~/.claude/projects/.
 * @returns {Array<{file:string, mtime:number, lastLines:string[]}>}
 */
function getSessionHistory() {
  return getRecentSessionFiles();
}

module.exports = {
  startSessionMonitor,
  stopSessionMonitor,
  getActiveSessions,
  getSessionHistory,
};
