/**
 * Onboarding UI
 * Renders the full-screen onboarding overlay for Claude World.
 * No external stylesheet required — all styles are injected inline.
 */

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
  @keyframes cw-star-drift {
    0%   { transform: translateY(0)   rotate(0deg);   opacity: 0.6; }
    50%  { opacity: 1; }
    100% { transform: translateY(-120vh) rotate(360deg); opacity: 0; }
  }

  @keyframes cw-fade-in {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes cw-commander-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.7),
                  0 0 0 0 rgba(124, 58, 237, 0.4);
    }
    50% {
      box-shadow: 0 0 0 14px rgba(124, 58, 237, 0),
                  0 0 0 28px rgba(124, 58, 237, 0);
    }
  }

  @keyframes cw-commander-inner-spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes cw-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }

  .cw-onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #0a0a0f;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
    color: #e2e8f0;
    overflow: hidden;
  }

  .cw-onboarding-overlay.cw-hidden {
    display: none;
  }

  /* Stars background */
  .cw-stars {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .cw-star {
    position: absolute;
    bottom: -10px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #a78bfa;
    animation: cw-star-drift linear infinite;
  }

  /* Step container */
  .cw-step {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    width: 100%;
    max-width: 620px;
    padding: 0 24px;
    animation: cw-fade-in 0.45s ease both;
  }

  .cw-step.cw-hidden {
    display: none;
  }

  .cw-wordmark {
    font-size: 11px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #7c3aed;
    margin-bottom: 40px;
    opacity: 0.8;
  }

  .cw-title {
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    color: #f1f5f9;
    margin: 0 0 12px;
    line-height: 1.25;
  }

  .cw-subtitle {
    font-size: 14px;
    color: #94a3b8;
    text-align: center;
    margin: 0 0 36px;
    line-height: 1.6;
  }

  /* Text input */
  .cw-input {
    width: 100%;
    background: #0f0f1a;
    border: 1.5px solid #2d2d4e;
    border-radius: 10px;
    color: #f1f5f9;
    font-family: inherit;
    font-size: 16px;
    padding: 16px 20px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    margin-bottom: 20px;
  }

  .cw-input::placeholder {
    color: #4a4a6a;
  }

  .cw-input:focus {
    border-color: #7c3aed;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2);
  }

  /* Primary button */
  .cw-btn-primary {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 14px 32px;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s, box-shadow 0.2s, opacity 0.2s;
    box-shadow: 0 4px 24px rgba(124, 58, 237, 0.35);
    margin-top: 4px;
    align-self: center;
  }

  .cw-btn-primary:not(:disabled):hover {
    background: #6d28d9;
    box-shadow: 0 6px 32px rgba(124, 58, 237, 0.5);
    transform: translateY(-1px);
  }

  .cw-btn-primary:not(:disabled):active {
    transform: translateY(0);
  }

  .cw-btn-primary:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* Template cards */
  .cw-cards {
    display: flex;
    gap: 14px;
    width: 100%;
    margin-bottom: 28px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .cw-card {
    flex: 1 1 160px;
    max-width: 190px;
    background: #0f0f1a;
    border: 1.5px solid #2d2d4e;
    border-radius: 12px;
    padding: 22px 16px 18px;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    user-select: none;
  }

  .cw-card:hover {
    border-color: #7c3aed;
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(124, 58, 237, 0.2);
  }

  .cw-card.cw-selected {
    border-color: #7c3aed;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.3),
                0 6px 24px rgba(124, 58, 237, 0.25);
    background: #130e1f;
  }

  .cw-card-emoji {
    font-size: 28px;
    line-height: 1;
  }

  .cw-card-name {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .cw-card-desc {
    font-size: 11px;
    color: #64748b;
    line-height: 1.5;
  }

  /* Commander avatar */
  .cw-commander-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    margin-bottom: 36px;
  }

  .cw-commander-avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #a78bfa, #7c3aed 60%, #4c1d95);
    animation: cw-commander-pulse 2.4s ease-in-out infinite;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cw-commander-avatar::after {
    content: '';
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2.5px solid rgba(255, 255, 255, 0.35);
    border-top-color: rgba(255, 255, 255, 0.85);
    animation: cw-commander-inner-spin 1.8s linear infinite;
  }

  .cw-commander-label {
    font-size: 11px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #7c3aed;
    margin-top: -20px;
    opacity: 0.8;
  }

  /* Typewriter speech bubble */
  .cw-speech {
    background: #0f0f1a;
    border: 1.5px solid #2d2d4e;
    border-radius: 12px;
    padding: 20px 24px;
    font-size: 15px;
    color: #cbd5e1;
    line-height: 1.65;
    text-align: center;
    min-height: 80px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
    margin-bottom: 0;
  }

  .cw-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: #7c3aed;
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: cw-blink 1s step-end infinite;
  }

  .cw-cursor.cw-hidden {
    display: none;
  }

  /* Divider */
  .cw-divider {
    width: 48px;
    height: 2px;
    background: linear-gradient(90deg, transparent, #7c3aed, transparent);
    border-radius: 2px;
    margin: 0 auto 32px;
  }
`;

// ─── Star factory ─────────────────────────────────────────────────────────────

function createStars(container, count = 40) {
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'cw-star';

    const size    = Math.random() * 2.5 + 1;
    const delay   = Math.random() * 18;
    const dur     = Math.random() * 12 + 8;
    const leftPct = Math.random() * 100;

    star.style.cssText = `
      left: ${leftPct}%;
      width: ${size}px;
      height: ${size}px;
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
      opacity: ${Math.random() * 0.5 + 0.3};
    `;
    container.appendChild(star);
  }
}

// ─── Typewriter ───────────────────────────────────────────────────────────────

function typewrite(el, text, cursorEl, { speed = 32, onDone } = {}) {
  let i = 0;
  el.textContent = '';
  if (cursorEl) cursorEl.classList.remove('cw-hidden');

  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    } else {
      if (onDone) onDone();
    }
  }
  setTimeout(tick, speed);
}

// ─── Overlay builder ──────────────────────────────────────────────────────────

let _overlay = null;
let _system  = null;

function buildOverlay() {
  // Inject styles once
  if (!document.getElementById('cw-onboarding-styles')) {
    const tag = document.createElement('style');
    tag.id = 'cw-onboarding-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }

  const overlay = document.createElement('div');
  overlay.className = 'cw-onboarding-overlay cw-hidden';

  // Stars
  const stars = document.createElement('div');
  stars.className = 'cw-stars';
  createStars(stars);
  overlay.appendChild(stars);

  // ── Step 1: Name your world ──────────────────────────────────────────────
  const step1 = document.createElement('div');
  step1.className = 'cw-step cw-hidden';
  step1.dataset.step = '1';
  step1.innerHTML = `
    <div class="cw-wordmark">Claude World</div>
    <h1 class="cw-title">Welcome to Claude World</h1>
    <div class="cw-divider"></div>
    <p class="cw-subtitle">Every great company starts with a name.</p>
    <input
      class="cw-input"
      type="text"
      placeholder="e.g. Acme AI, Nova Labs, or just your name..."
      maxlength="64"
      autocomplete="off"
      spellcheck="false"
    />
    <button class="cw-btn-primary" disabled>Name My World &rarr;</button>
  `;

  const nameInput = step1.querySelector('.cw-input');
  const nameBtn   = step1.querySelector('.cw-btn-primary');

  nameInput.addEventListener('input', () => {
    nameBtn.disabled = nameInput.value.trim().length < 2;
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !nameBtn.disabled) nameBtn.click();
  });

  nameBtn.addEventListener('click', () => {
    goToStep(2);
  });

  overlay.appendChild(step1);

  // ── Step 2: Choose template ──────────────────────────────────────────────
  const step2 = document.createElement('div');
  step2.className = 'cw-step cw-hidden';
  step2.dataset.step = '2';

  const TEMPLATES = [
    {
      id:    'startup_founder',
      emoji: '🚀',
      name:  'Startup Founder',
      desc:  'Build a company.\nLegal, Sales, Treasury\npre-wired.',
    },
    {
      id:    'developer',
      emoji: '💻',
      name:  'Developer',
      desc:  'Automate everything.\nDocks, Minions,\nExchange ready.',
    },
    {
      id:    'freelancer',
      emoji: '🎨',
      name:  'Freelancer',
      desc:  'Create and deliver.\nSkills, Chat,\nMarketing first.',
    },
  ];

  const cardsHTML = TEMPLATES.map(t => `
    <div class="cw-card" data-template="${t.id}" tabindex="0" role="button" aria-pressed="false">
      <div class="cw-card-emoji">${t.emoji}</div>
      <div class="cw-card-name">${t.name}</div>
      <div class="cw-card-desc">${t.desc.replace(/\n/g, '<br>')}</div>
    </div>
  `).join('');

  step2.innerHTML = `
    <div class="cw-wordmark">Claude World</div>
    <h1 class="cw-title">Choose how you'll use your world</h1>
    <div class="cw-divider"></div>
    <div class="cw-cards">${cardsHTML}</div>
    <button class="cw-btn-primary" disabled>Build My World &rarr;</button>
  `;

  const buildBtn = step2.querySelector('.cw-btn-primary');
  let selectedTemplate = null;

  step2.querySelectorAll('.cw-card').forEach(card => {
    const activate = () => {
      step2.querySelectorAll('.cw-card').forEach(c => {
        c.classList.remove('cw-selected');
        c.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('cw-selected');
      card.setAttribute('aria-pressed', 'true');
      selectedTemplate = card.dataset.template;
      buildBtn.disabled = false;
    };

    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  buildBtn.addEventListener('click', async () => {
    if (!selectedTemplate) return;
    buildBtn.disabled = true;
    buildBtn.textContent = 'Creating…';
    try {
      await _system.createWorld(nameInput.value.trim(), selectedTemplate);
      goToStep(3);
    } catch (err) {
      console.error('[OnboardingUI] createWorld failed:', err);
      buildBtn.disabled = false;
      buildBtn.innerHTML = 'Build My World &rarr;';
    }
  });

  overlay.appendChild(step2);

  // ── Step 3: Meet your Commander ──────────────────────────────────────────
  const step3 = document.createElement('div');
  step3.className = 'cw-step cw-hidden';
  step3.dataset.step = '3';
  step3.innerHTML = `
    <div class="cw-wordmark">Claude World</div>
    <div class="cw-commander-wrap">
      <div class="cw-commander-avatar"></div>
      <div class="cw-commander-label">Commander</div>
    </div>
    <div class="cw-speech">
      <span class="cw-typewriter-text"></span><span class="cw-cursor"></span>
    </div>
    <button class="cw-btn-primary" style="margin-top:28px;opacity:0;pointer-events:none;">
      Let&#39;s do it &rarr;
    </button>
  `;

  const letsGoBtn   = step3.querySelector('.cw-btn-primary');
  const twText      = step3.querySelector('.cw-typewriter-text');
  const cursorSpan  = step3.querySelector('.cw-cursor');

  letsGoBtn.addEventListener('click', () => {
    hideOverlay();
    if (_system) _system.complete();
  });

  overlay.appendChild(step3);

  // ── Navigation helpers ──────────────────────────────────────────────────
  function goToStep(n) {
    overlay.querySelectorAll('.cw-step').forEach(s => s.classList.add('cw-hidden'));
    const target = overlay.querySelector(`.cw-step[data-step="${n}"]`);
    if (!target) return;
    target.classList.remove('cw-hidden');

    if (n === 1) {
      setTimeout(() => nameInput.focus(), 80);
    }

    if (n === 3) {
      const worldName = nameInput.value.trim() || 'Commander';
      const msg = `Hello ${worldName}. I'm your Commander. I'll route every task you give me to the right agent in your world. Ready to begin?`;
      setTimeout(() => {
        typewrite(twText, msg, cursorSpan, {
          speed: 28,
          onDone: () => {
            cursorSpan.classList.add('cw-hidden');
            letsGoBtn.style.opacity = '1';
            letsGoBtn.style.pointerEvents = 'auto';
          },
        });
      }, 350);
    }
  }

  _overlay = overlay;
  document.body.appendChild(overlay);

  return { overlay, goToStep };
}

// ─── Show / hide ──────────────────────────────────────────────────────────────

function showOverlay() {
  if (!_overlay) return;
  _overlay.classList.remove('cw-hidden');
  // Start at step 1
  _overlay.querySelectorAll('.cw-step').forEach(s => s.classList.add('cw-hidden'));
  const step1 = _overlay.querySelector('.cw-step[data-step="1"]');
  if (step1) {
    step1.classList.remove('cw-hidden');
    setTimeout(() => {
      const inp = step1.querySelector('.cw-input');
      if (inp) inp.focus();
    }, 80);
  }
}

function hideOverlay() {
  if (_overlay) _overlay.classList.add('cw-hidden');
}

// ─── Public exports ───────────────────────────────────────────────────────────

/**
 * Initialize the onboarding UI.
 * Wires the overlay to the given OnboardingSystem instance and listens for
 * the 'onboarding:start' event to show it automatically.
 *
 * @param {import('../systems/onboarding.js').OnboardingSystem} onboardingSystem
 */
export function initOnboarding(onboardingSystem) {
  _system = onboardingSystem;
  buildOverlay();

  document.addEventListener('onboarding:start', () => {
    showOverlay();
  });
}

/**
 * Programmatically show the onboarding overlay.
 * Can be called at any time after initOnboarding().
 */
export function showOnboarding() {
  if (!_overlay) {
    console.warn('[OnboardingUI] showOnboarding() called before initOnboarding().');
    return;
  }
  showOverlay();
}
