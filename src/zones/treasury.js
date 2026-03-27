/**
 * treasury.js — Treasury zone: budget tracking, spending visualization, cost controls
 *
 * Renders inside the panel system. Reads spending data from the tasks table
 * via window.api.db and stores budget config in world settings.
 *
 * Events emitted:
 *   treasury:budget-set  — { monthlyBudget, hardCap, autoPausePercent, providerLimits }
 *   treasury:warning     — { percentUsed, remaining }
 *   treasury:critical    — { percentUsed, remaining }
 *   treasury:exceeded    — { percentUsed, remaining }
 *   treasury:export      — triggers CSV download
 */

// ── Model pricing ($ per 1K tokens) ─────────────────────────────
const MODEL_PRICING = {
  'claude-sonnet-4-20250514':   { input: 0.003,  output: 0.015  },
  'claude-3.5-sonnet':          { input: 0.003,  output: 0.015  },
  'claude-3-opus':              { input: 0.015,  output: 0.075  },
  'claude-3-haiku':             { input: 0.00025, output: 0.00125 },
  'gpt-4o':                     { input: 0.005,  output: 0.015  },
  'gpt-4o-mini':                { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo':                { input: 0.01,   output: 0.03   },
  'gemini-pro':                 { input: 0.00025, output: 0.0005 },
  'gemini-1.5-pro':             { input: 0.0035, output: 0.0105 },
};

const PROVIDER_COLORS = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
};

const ZONE_DISTRICTS = {
  dispatch: 'core', brain: 'core', chat: 'core', memory: 'core',
  skills: 'core', minions: 'core',
  treasury: 'business', sales: 'business', marketing: 'business',
  exchange: 'business', market: 'business',
  council: 'advanced', rnd: 'advanced', legal: 'advanced', archive: 'advanced',
  docks: 'edge', airport: 'edge', globe: 'edge', broadcast: 'edge',
};

// ── Default config ───────────────────────────────────────────────
const DEFAULT_CONFIG = {
  monthlyBudget: 10.00,
  hardCap: false,
  autoPausePercent: 90,
  providerLimits: {},
};

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Format a number as USD.
 * @param {number} n
 * @param {number} [decimals=2]
 * @returns {string}
 */
function usd(n, decimals = 2) {
  return `$${(n || 0).toFixed(decimals)}`;
}

/**
 * Get the start of the current month as ISO string.
 * @returns {string}
 */
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/**
 * Get days remaining in the current month.
 * @returns {number}
 */
function daysRemaining() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

/**
 * Get days elapsed in the current month (including today).
 * @returns {number}
 */
function daysElapsed() {
  return new Date().getDate();
}

/**
 * Parse tasks into spending analytics.
 * @param {object[]} tasks
 * @param {number} monthlyBudget
 * @returns {object}
 */
function analyzeSpending(tasks, monthlyBudget) {
  const now = new Date();
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);

  // Filter to current month
  const monthTasks = tasks.filter(t => {
    if (!t.cost_usd || t.cost_usd <= 0) return false;
    const created = new Date(t.created_at);
    return created >= monthStartDate;
  });

  const totalSpent = monthTasks.reduce((sum, t) => sum + (t.cost_usd || 0), 0);
  const elapsed = daysElapsed();
  const dailyAvg = elapsed > 0 ? totalSpent / elapsed : 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = dailyAvg * daysInMonth;
  const remaining = Math.max(0, monthlyBudget - totalSpent);
  const percentUsed = monthlyBudget > 0 ? (totalSpent / monthlyBudget) * 100 : 0;

  // By provider
  const byProvider = {};
  for (const t of monthTasks) {
    const p = (t.provider || 'unknown').toLowerCase();
    byProvider[p] = (byProvider[p] || 0) + (t.cost_usd || 0);
  }

  // By zone
  const byZone = {};
  for (const t of monthTasks) {
    const z = t.zone_id || 'unassigned';
    byZone[z] = (byZone[z] || 0) + (t.cost_usd || 0);
  }

  // Daily spend (last 30 days)
  const dailySpend = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailySpend[key] = 0;
  }
  for (const t of tasks) {
    if (!t.cost_usd || t.cost_usd <= 0) continue;
    const key = (t.created_at || '').slice(0, 10);
    if (key in dailySpend) {
      dailySpend[key] += t.cost_usd;
    }
  }

  return {
    totalSpent,
    dailyAvg,
    projected,
    remaining,
    percentUsed,
    daysLeft: daysRemaining(),
    byProvider,
    byZone,
    dailySpend,
    monthTasks,
  };
}

// ── DOM builders ─────────────────────────────────────────────────

/**
 * Create a collapsible section.
 * @param {string} title
 * @param {boolean} [collapsed=false]
 * @returns {{ section: HTMLElement, body: HTMLElement }}
 */
function createSection(title, collapsed = false) {
  const section = document.createElement('div');
  section.className = `treasury__section${collapsed ? ' collapsed' : ''}`;

  const header = document.createElement('div');
  header.className = 'treasury__section-header';
  header.textContent = title;
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', String(!collapsed));
  header.setAttribute('tabindex', '0');
  header.addEventListener('click', () => {
    const isCollapsed = section.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', String(!isCollapsed));
  });
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });
  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'treasury__section-body';
  section.appendChild(body);

  return { section, body };
}

/**
 * Build the stats bar showing total/budget/remaining.
 * @param {object} spending
 * @param {number} budget
 * @returns {HTMLElement}
 */
function buildStatsBar(spending, budget) {
  const bar = document.createElement('div');
  bar.className = 'treasury__stats-bar';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-label', 'Budget summary');

  // Status dot
  const dot = document.createElement('span');
  dot.className = 'treasury__status-dot';
  if (spending.percentUsed >= 80) dot.classList.add('treasury__status-dot--red');
  else if (spending.percentUsed >= 50) dot.classList.add('treasury__status-dot--amber');
  else dot.classList.add('treasury__status-dot--green');
  bar.appendChild(dot);

  const parts = [
    { label: 'Total Spent', value: usd(spending.totalSpent) },
    { label: 'Budget', value: usd(budget) },
    { label: 'Remaining', value: usd(spending.remaining) },
  ];

  parts.forEach((p, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'treasury__stats-sep';
      sep.textContent = '|';
      sep.setAttribute('aria-hidden', 'true');
      bar.appendChild(sep);
    }
    const s = document.createElement('span');
    s.textContent = `${p.label}: ${p.value}`;
    bar.appendChild(s);
  });

  return bar;
}

/**
 * Build the budget configuration section.
 * @param {object} config
 * @param {function} onSave
 * @returns {HTMLElement}
 */
function buildBudgetConfig(config, onSave) {
  const { section, body } = createSection('Budget Configuration');

  // Monthly budget
  const budgetGroup = document.createElement('div');
  budgetGroup.className = 'treasury__form-group';
  const budgetLabel = document.createElement('label');
  budgetLabel.className = 'treasury__form-label';
  budgetLabel.textContent = 'Monthly Budget (USD)';
  const budgetInput = document.createElement('input');
  budgetInput.className = 'treasury__form-input';
  budgetInput.type = 'number';
  budgetInput.min = '0';
  budgetInput.step = '1';
  budgetInput.value = config.monthlyBudget.toFixed(2);
  budgetInput.setAttribute('aria-label', 'Monthly budget in USD');
  budgetGroup.appendChild(budgetLabel);
  budgetGroup.appendChild(budgetInput);
  body.appendChild(budgetGroup);

  // Per-provider limits
  const providers = ['Anthropic', 'OpenAI', 'Google'];
  for (const provider of providers) {
    const key = provider.toLowerCase();
    const group = document.createElement('div');
    group.className = 'treasury__form-group';
    const label = document.createElement('label');
    label.className = 'treasury__form-label';
    label.textContent = `${provider} Limit (optional)`;
    const input = document.createElement('input');
    input.className = 'treasury__form-input';
    input.type = 'number';
    input.min = '0';
    input.step = '0.50';
    input.value = config.providerLimits[key] != null ? config.providerLimits[key].toFixed(2) : '';
    input.placeholder = 'No limit';
    input.setAttribute('aria-label', `${provider} budget limit`);
    input.dataset.provider = key;
    group.appendChild(label);
    group.appendChild(input);
    body.appendChild(group);
  }

  // Hard cap toggle
  const hardCapWrap = document.createElement('div');
  hardCapWrap.className = 'treasury__toggle-wrap';
  hardCapWrap.setAttribute('role', 'switch');
  hardCapWrap.setAttribute('aria-checked', String(config.hardCap));
  hardCapWrap.setAttribute('tabindex', '0');

  const hardCapToggle = document.createElement('div');
  hardCapToggle.className = `treasury__toggle${config.hardCap ? ' active' : ''}`;
  const hardCapLabel = document.createElement('span');
  hardCapLabel.className = 'treasury__toggle-label';
  hardCapLabel.textContent = 'Hard cap: stop all tasks when budget reached';
  hardCapWrap.appendChild(hardCapToggle);
  hardCapWrap.appendChild(hardCapLabel);

  let hardCap = config.hardCap;
  const toggleHardCap = () => {
    hardCap = !hardCap;
    hardCapToggle.classList.toggle('active', hardCap);
    hardCapWrap.setAttribute('aria-checked', String(hardCap));
  };
  hardCapWrap.addEventListener('click', toggleHardCap);
  hardCapWrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHardCap(); }
  });
  body.appendChild(hardCapWrap);

  // Auto-pause threshold slider
  const sliderGroup = document.createElement('div');
  sliderGroup.className = 'treasury__form-group';
  const sliderLabel = document.createElement('label');
  sliderLabel.className = 'treasury__form-label';
  sliderLabel.textContent = 'Auto-Pause Threshold';
  sliderGroup.appendChild(sliderLabel);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'treasury__slider-wrap';
  const sliderRow = document.createElement('div');
  sliderRow.className = 'treasury__slider-row';

  const slider = document.createElement('input');
  slider.className = 'treasury__slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(config.autoPausePercent);
  slider.setAttribute('aria-label', 'Auto-pause threshold percentage');

  const sliderValue = document.createElement('span');
  sliderValue.className = 'treasury__slider-value';
  sliderValue.textContent = `${config.autoPausePercent}%`;

  slider.addEventListener('input', () => {
    sliderValue.textContent = `${slider.value}%`;
  });

  sliderRow.appendChild(slider);
  sliderRow.appendChild(sliderValue);
  sliderWrap.appendChild(sliderRow);
  sliderGroup.appendChild(sliderWrap);
  body.appendChild(sliderGroup);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'treasury__save-btn';
  saveBtn.textContent = 'Save Budget Configuration';
  saveBtn.addEventListener('click', () => {
    const providerLimits = {};
    body.querySelectorAll('[data-provider]').forEach((input) => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        providerLimits[input.dataset.provider] = val;
      }
    });

    const newConfig = {
      monthlyBudget: Math.max(0, parseFloat(budgetInput.value) || 0),
      hardCap,
      autoPausePercent: parseInt(slider.value, 10),
      providerLimits,
    };

    onSave(newConfig);
  });
  body.appendChild(saveBtn);

  return section;
}

/**
 * Build the spending overview card.
 * @param {object} spending
 * @returns {HTMLElement}
 */
function buildOverview(spending) {
  const { section, body } = createSection('This Month');

  const grid = document.createElement('div');
  grid.className = 'treasury__overview-grid';

  const cards = [
    { label: 'Total Spent', value: usd(spending.totalSpent), wide: true },
    { label: 'Daily Average', value: usd(spending.dailyAvg, 3), small: true },
    { label: 'Projected', value: usd(spending.projected), small: true },
    { label: 'Days Left', value: String(spending.daysLeft), small: true },
    { label: 'Percent Used', value: `${spending.percentUsed.toFixed(1)}%`, small: true },
  ];

  for (const c of cards) {
    const card = document.createElement('div');
    card.className = `treasury__overview-card${c.wide ? ' treasury__overview-card--wide' : ''}`;

    const label = document.createElement('div');
    label.className = 'treasury__overview-label';
    label.textContent = c.label;
    card.appendChild(label);

    const val = document.createElement('div');
    val.className = `treasury__overview-value${c.small ? ' treasury__overview-value--small' : ''}`;
    val.textContent = c.value;
    card.appendChild(val);

    grid.appendChild(card);
  }

  body.appendChild(grid);
  return section;
}

/**
 * Build a horizontal bar chart breakdown.
 * @param {string} title
 * @param {Record<string, number>} data
 * @param {function} colorFn  Returns CSS class suffix for the bar fill.
 * @returns {HTMLElement}
 */
function buildBarChart(title, data, colorFn) {
  const { section, body } = createSection(title);

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'treasury__empty';
    empty.textContent = 'No spending data yet.';
    body.appendChild(empty);
    return section;
  }

  const maxVal = Math.max(...entries.map(([, v]) => v));
  const total = entries.reduce((s, [, v]) => s + v, 0);

  const list = document.createElement('div');
  list.className = 'treasury__bar-list';
  list.setAttribute('role', 'list');

  for (const [name, amount] of entries) {
    const item = document.createElement('div');
    item.className = 'treasury__bar-item';
    item.setAttribute('role', 'listitem');

    const meta = document.createElement('div');
    meta.className = 'treasury__bar-meta';

    const nameEl = document.createElement('span');
    nameEl.className = 'treasury__bar-name';
    nameEl.textContent = name;

    const amountEl = document.createElement('span');
    amountEl.className = 'treasury__bar-amount';
    const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0';
    amountEl.textContent = `${usd(amount)} (${pct}%)`;

    meta.appendChild(nameEl);
    meta.appendChild(amountEl);
    item.appendChild(meta);

    const track = document.createElement('div');
    track.className = 'treasury__bar-track';

    const fill = document.createElement('div');
    fill.className = `treasury__bar-fill treasury__bar-fill--${colorFn(name)}`;
    const widthPct = maxVal > 0 ? (amount / maxVal) * 100 : 0;
    fill.style.width = `${widthPct}%`;
    track.appendChild(fill);
    item.appendChild(track);

    list.appendChild(item);
  }

  body.appendChild(list);
  return section;
}

/**
 * Build the daily spend chart (last 30 days).
 * @param {Record<string, number>} dailySpend
 * @param {number} dailyBudget  Monthly budget / days in month
 * @returns {HTMLElement}
 */
function buildDailyChart(dailySpend, dailyBudget) {
  const { section, body } = createSection('Daily Spend (30 days)');

  const entries = Object.entries(dailySpend);
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'treasury__empty';
    empty.textContent = 'No daily data available.';
    body.appendChild(empty);
    return section;
  }

  const maxVal = Math.max(...entries.map(([, v]) => v), dailyBudget || 0.01);
  const chartHeight = 100; // px usable height

  const chart = document.createElement('div');
  chart.className = 'treasury__daily-chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Daily spending chart for the last 30 days');

  // Budget line
  if (dailyBudget > 0) {
    const lineBottom = Math.min((dailyBudget / maxVal) * chartHeight, chartHeight);
    const budgetLine = document.createElement('div');
    budgetLine.className = 'treasury__budget-line';
    budgetLine.style.bottom = `${lineBottom + 20}px`;

    const lineLabel = document.createElement('span');
    lineLabel.className = 'treasury__budget-line-label';
    lineLabel.textContent = `daily avg: ${usd(dailyBudget, 3)}`;
    budgetLine.appendChild(lineLabel);
    chart.appendChild(budgetLine);
  }

  for (const [date, amount] of entries) {
    const wrap = document.createElement('div');
    wrap.className = 'treasury__daily-bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'treasury__daily-bar';
    const heightPct = maxVal > 0 ? (amount / maxVal) * chartHeight : 0;
    bar.style.height = `${Math.max(1, heightPct)}px`;
    bar.dataset.amount = `${date.slice(5)}: ${usd(amount, 3)}`;
    bar.setAttribute('aria-label', `${date}: ${usd(amount, 3)}`);

    // Color by threshold
    if (amount > dailyBudget * 1.5) {
      bar.style.background = 'var(--accent-red)';
    } else if (amount > dailyBudget) {
      bar.style.background = 'var(--accent-amber)';
    }

    wrap.appendChild(bar);
    chart.appendChild(wrap);
  }

  // X axis labels
  const axis = document.createElement('div');
  axis.className = 'treasury__daily-axis';
  axis.setAttribute('aria-hidden', 'true');

  const firstDate = document.createElement('span');
  firstDate.textContent = entries[0][0].slice(5);
  const lastDate = document.createElement('span');
  lastDate.textContent = entries[entries.length - 1][0].slice(5);
  axis.appendChild(firstDate);
  axis.appendChild(lastDate);
  chart.appendChild(axis);

  body.appendChild(chart);
  return section;
}

/**
 * Build the recent transactions list.
 * @param {object[]} tasks
 * @param {function} onExport
 * @returns {HTMLElement}
 */
function buildTransactions(tasks, onExport) {
  const { section, body } = createSection('Recent Transactions');

  const costTasks = tasks.filter(t => t.cost_usd != null && t.cost_usd > 0).slice(0, 50);

  if (costTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'treasury__empty';
    empty.textContent = 'No transactions recorded yet.';
    body.appendChild(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'treasury__tx-list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Recent transactions');

  for (const t of costTasks) {
    const item = document.createElement('div');
    item.className = 'treasury__tx-item';
    item.setAttribute('role', 'listitem');

    const agent = document.createElement('div');
    agent.className = 'treasury__tx-agent';
    const zonePart = t.zone_id ? ` \u00B7 ${t.zone_id}` : '';
    agent.textContent = `${t.agent_id || 'system'}${zonePart}`;

    const cost = document.createElement('div');
    cost.className = 'treasury__tx-cost';
    cost.textContent = usd(t.cost_usd, 4);

    const detail = document.createElement('div');
    detail.className = 'treasury__tx-detail';

    const model = document.createElement('span');
    model.textContent = t.model || 'unknown';

    const tokens = document.createElement('span');
    const inTok = t.input_tokens || 0;
    const outTok = t.output_tokens || 0;
    tokens.textContent = `${inTok.toLocaleString()}in / ${outTok.toLocaleString()}out`;

    const time = document.createElement('span');
    const d = new Date(t.created_at);
    time.textContent = d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    detail.appendChild(model);
    detail.appendChild(tokens);
    detail.appendChild(time);

    item.appendChild(agent);
    item.appendChild(cost);
    item.appendChild(detail);
    list.appendChild(item);
  }

  body.appendChild(list);

  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'treasury__export-btn';
  exportBtn.textContent = '\u{1F4BE} Export CSV';
  exportBtn.setAttribute('aria-label', 'Export transactions as CSV');
  exportBtn.addEventListener('click', () => onExport(costTasks));
  body.appendChild(exportBtn);

  return section;
}

/**
 * Build the cost calculator.
 * @returns {HTMLElement}
 */
function buildCalculator() {
  const { section, body } = createSection('Cost Calculator', true);

  const calc = document.createElement('div');
  calc.className = 'treasury__calc';

  // Model select
  const modelGroup = document.createElement('div');
  modelGroup.className = 'treasury__form-group';
  const modelLabel = document.createElement('label');
  modelLabel.className = 'treasury__form-label';
  modelLabel.textContent = 'Model';
  const modelSelect = document.createElement('select');
  modelSelect.className = 'treasury__calc-select';
  modelSelect.setAttribute('aria-label', 'Select model for cost estimation');

  for (const model of Object.keys(MODEL_PRICING)) {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model;
    modelSelect.appendChild(opt);
  }
  modelGroup.appendChild(modelLabel);
  modelGroup.appendChild(modelSelect);
  calc.appendChild(modelGroup);

  // Token inputs
  const tokenRow = document.createElement('div');
  tokenRow.className = 'treasury__calc-row';

  const inputGroup = document.createElement('div');
  inputGroup.className = 'treasury__form-group';
  const inputLabel = document.createElement('label');
  inputLabel.className = 'treasury__form-label';
  inputLabel.textContent = 'Input Tokens';
  const inputTokens = document.createElement('input');
  inputTokens.className = 'treasury__form-input';
  inputTokens.type = 'number';
  inputTokens.min = '0';
  inputTokens.value = '1000';
  inputTokens.setAttribute('aria-label', 'Estimated input tokens');
  inputGroup.appendChild(inputLabel);
  inputGroup.appendChild(inputTokens);

  const outputGroup = document.createElement('div');
  outputGroup.className = 'treasury__form-group';
  const outputLabel = document.createElement('label');
  outputLabel.className = 'treasury__form-label';
  outputLabel.textContent = 'Output Tokens';
  const outputTokens = document.createElement('input');
  outputTokens.className = 'treasury__form-input';
  outputTokens.type = 'number';
  outputTokens.min = '0';
  outputTokens.value = '500';
  outputTokens.setAttribute('aria-label', 'Estimated output tokens');
  outputGroup.appendChild(outputLabel);
  outputGroup.appendChild(outputTokens);

  tokenRow.appendChild(inputGroup);
  tokenRow.appendChild(outputGroup);
  calc.appendChild(tokenRow);

  // Result
  const result = document.createElement('div');
  result.className = 'treasury__calc-result';

  const resultLabel = document.createElement('span');
  resultLabel.className = 'treasury__calc-result-label';
  resultLabel.textContent = 'Estimated Cost';

  const resultValue = document.createElement('span');
  resultValue.className = 'treasury__calc-result-value';
  resultValue.textContent = '$0.0000';

  result.appendChild(resultLabel);
  result.appendChild(resultValue);
  calc.appendChild(result);

  // Recalculate
  const recalc = () => {
    const model = modelSelect.value;
    const pricing = MODEL_PRICING[model];
    if (!pricing) { resultValue.textContent = '—'; return; }
    const inCount = Math.max(0, parseInt(inputTokens.value, 10) || 0);
    const outCount = Math.max(0, parseInt(outputTokens.value, 10) || 0);
    const cost = (inCount / 1000) * pricing.input + (outCount / 1000) * pricing.output;
    resultValue.textContent = usd(cost, 4);
  };

  modelSelect.addEventListener('change', recalc);
  inputTokens.addEventListener('input', recalc);
  outputTokens.addEventListener('input', recalc);
  recalc();

  body.appendChild(calc);
  return section;
}

// ── CSV export ───────────────────────────────────────────────────

/**
 * Download tasks as CSV.
 * @param {object[]} tasks
 */
function exportCSV(tasks) {
  const headers = ['timestamp', 'agent', 'zone', 'provider', 'model', 'input_tokens', 'output_tokens', 'cost_usd', 'status'];
  const rows = tasks.map(t => [
    t.created_at || '',
    t.agent_id || '',
    t.zone_id || '',
    t.provider || '',
    t.model || '',
    t.input_tokens || 0,
    t.output_tokens || 0,
    t.cost_usd || 0,
    t.status || '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claude-world-treasury-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  document.dispatchEvent(new CustomEvent('treasury:export', { bubbles: true }));
}

// ── Budget alert system ──────────────────────────────────────────

/** @type {Set<string>} Track which alerts have fired this session. */
const _firedAlerts = new Set();

/**
 * Check budget thresholds and emit alert events.
 * @param {number} percentUsed
 * @param {number} remaining
 */
function checkAlerts(percentUsed, remaining) {
  const details = { percentUsed: Math.round(percentUsed * 10) / 10, remaining };

  if (percentUsed >= 100 && !_firedAlerts.has('exceeded')) {
    _firedAlerts.add('exceeded');
    document.dispatchEvent(new CustomEvent('treasury:exceeded', { detail: details, bubbles: true }));
  } else if (percentUsed >= 80 && !_firedAlerts.has('critical')) {
    _firedAlerts.add('critical');
    document.dispatchEvent(new CustomEvent('treasury:critical', { detail: details, bubbles: true }));
  } else if (percentUsed >= 50 && !_firedAlerts.has('warning')) {
    _firedAlerts.add('warning');
    document.dispatchEvent(new CustomEvent('treasury:warning', { detail: details, bubbles: true }));
  }
}

// ── Config persistence (localStorage fallback) ───────────────────

const CONFIG_KEY = 'claude-world:treasury-config';

/**
 * Load budget config from storage.
 * @returns {object}
 */
function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save budget config to storage.
 * @param {object} config
 */
function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

// ── Main Treasury builder ────────────────────────────────────────

/**
 * Build the complete Treasury zone panel content.
 *
 * This is designed to be called by the panel system when the treasury zone
 * is opened. It returns an HTMLElement to be inserted into the panel body.
 *
 * @param {object} [options]
 * @param {string} [options.worldId]  World ID for DB queries.
 * @returns {HTMLElement}
 */
export function buildTreasuryContent(options = {}) {
  const worldId = options.worldId || null;
  const config = loadConfig();

  const root = document.createElement('div');
  root.className = 'treasury';

  // Placeholder: will be filled async
  const statsBarSlot = document.createElement('div');
  root.appendChild(statsBarSlot);

  // Budget config (sync, doesn't need data)
  const configSection = buildBudgetConfig(config, (newConfig) => {
    saveConfig(newConfig);

    document.dispatchEvent(new CustomEvent('treasury:budget-set', {
      detail: {
        monthlyBudget: newConfig.monthlyBudget,
        hardCap: newConfig.hardCap,
        autoPausePercent: newConfig.autoPausePercent,
        providerLimits: newConfig.providerLimits,
      },
      bubbles: true,
    }));

    // Show toast feedback
    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: { type: 'success', title: 'Budget Updated', description: `Monthly budget set to ${usd(newConfig.monthlyBudget)}` },
      bubbles: true,
    }));

    // Refresh the panel
    refreshData();
  });
  root.appendChild(configSection);

  // Dynamic content slots
  const overviewSlot = document.createElement('div');
  const providerSlot = document.createElement('div');
  const zoneSlot = document.createElement('div');
  const dailySlot = document.createElement('div');
  const txSlot = document.createElement('div');

  root.appendChild(overviewSlot);
  root.appendChild(providerSlot);
  root.appendChild(zoneSlot);
  root.appendChild(dailySlot);
  root.appendChild(txSlot);

  // Calculator (static)
  root.appendChild(buildCalculator());

  // ── Data fetching ───────────────────────────────────────────

  /**
   * Fetch data and rebuild dynamic sections.
   */
  async function refreshData() {
    const currentConfig = loadConfig();
    let tasks = [];
    let stats = null;

    // Try to get data from the API bridge
    try {
      if (window.api && window.api.db) {
        if (worldId) {
          const [taskData, statsData] = await Promise.all([
            window.api.db.getRecentTasks(worldId, 200),
            window.api.db.getTaskStats(worldId),
          ]);
          tasks = taskData || [];
          stats = statsData || null;
        }
      }
    } catch (err) {
      console.warn('[Treasury] Failed to load data from API:', err);
    }

    const spending = analyzeSpending(tasks, currentConfig.monthlyBudget);

    // Update exceeded state on root
    root.classList.toggle('treasury--exceeded', spending.percentUsed >= 100);

    // Stats bar
    statsBarSlot.innerHTML = '';
    statsBarSlot.appendChild(buildStatsBar(spending, currentConfig.monthlyBudget));

    // Overview
    overviewSlot.innerHTML = '';
    overviewSlot.appendChild(buildOverview(spending));

    // By provider
    providerSlot.innerHTML = '';
    providerSlot.appendChild(buildBarChart(
      'By Provider',
      spending.byProvider,
      (name) => PROVIDER_COLORS[name] || 'default',
    ));

    // By zone
    zoneSlot.innerHTML = '';
    zoneSlot.appendChild(buildBarChart(
      'By Zone',
      spending.byZone,
      (name) => ZONE_DISTRICTS[name] || 'default',
    ));

    // Daily chart
    dailySlot.innerHTML = '';
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyBudget = currentConfig.monthlyBudget / daysInMonth;
    dailySlot.appendChild(buildDailyChart(spending.dailySpend, dailyBudget));

    // Transactions
    txSlot.innerHTML = '';
    txSlot.appendChild(buildTransactions(tasks, exportCSV));

    // Check alerts
    checkAlerts(spending.percentUsed, spending.remaining);

    // Update HUD budget indicator
    try {
      document.dispatchEvent(new CustomEvent('treasury:budget-update', {
        detail: {
          spent: spending.totalSpent,
          budget: currentConfig.monthlyBudget,
          percentUsed: spending.percentUsed,
        },
        bubbles: true,
      }));
    } catch { /* ignore */ }
  }

  // Initial load
  refreshData();

  // Store refresh function for external access
  root._refresh = refreshData;

  return root;
}

/**
 * Load the treasury CSS stylesheet.
 * @param {string} [basePath='']  Base path to the zones directory.
 */
export function loadTreasuryStyles(basePath = '') {
  const existing = document.querySelector('link[data-treasury-css]');
  if (existing) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${basePath}treasury.css`;
  link.dataset.treasuryCss = 'true';
  document.head.appendChild(link);
}

/**
 * Wire treasury events to HUD and toast system.
 * Call once during app initialization.
 *
 * @param {object} [deps]
 * @param {object} [deps.hud]    HUD instance (setBudget method)
 * @param {object} [deps.toasts] ToastManager instance (show method)
 */
export function initTreasuryEvents(deps = {}) {
  const { hud, toasts } = deps;

  // Update HUD budget display
  document.addEventListener('treasury:budget-update', (e) => {
    if (hud && typeof hud.setBudget === 'function') {
      hud.setBudget(e.detail.spent, e.detail.budget);
    }
  });

  // Budget alerts → toasts
  document.addEventListener('treasury:warning', (e) => {
    if (toasts && typeof toasts.show === 'function') {
      toasts.show({
        type: 'warning',
        title: 'Budget Warning',
        description: `${e.detail.percentUsed}% of monthly budget used. ${usd(e.detail.remaining)} remaining.`,
      });
    }
  });

  document.addEventListener('treasury:critical', (e) => {
    if (toasts && typeof toasts.show === 'function') {
      toasts.show({
        type: 'warning',
        title: 'Budget Critical',
        description: `${e.detail.percentUsed}% of budget used! Only ${usd(e.detail.remaining)} remaining.`,
        duration: 6000,
      });
    }
  });

  document.addEventListener('treasury:exceeded', (e) => {
    if (toasts && typeof toasts.show === 'function') {
      toasts.show({
        type: 'error',
        title: 'Budget Exceeded',
        description: `Monthly budget has been exceeded. ${usd(e.detail.remaining)} over budget.`,
        duration: 8000,
      });
    }
  });

  // Budget set confirmation
  document.addEventListener('treasury:budget-set', (e) => {
    if (hud && typeof hud.setBudget === 'function') {
      hud.setBudget(0, e.detail.monthlyBudget);
    }
  });
}
