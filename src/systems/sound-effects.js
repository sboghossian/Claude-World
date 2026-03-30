// ============================================================
// Claude World — SoundEffects
// Notification sound effects using Web Audio API synthesis.
// No audio files required — everything is generated in real-time.
// ============================================================

const STORAGE_KEY_SFX_VOLUME = 'claude-world:sfx-volume';
const STORAGE_KEY_SFX_MUTED  = 'claude-world:sfx-muted';

// ─── Note frequencies (Hz) ──────────────────────────────────

const NOTE = {
  A3: 220.00,
  E3: 164.81,
  F4: 349.23,
  A4: 440.00,
  C4: 261.63,
  E4: 329.63,
  G4: 392.00,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
};

// ─── Sound IDs ──────────────────────────────────────────────

export const SoundId = Object.freeze({
  TASK_COMPLETE:     'task-complete',
  TASK_FAILED:       'task-failed',
  ZONE_UNLOCKED:     'zone-unlocked',
  ACHIEVEMENT:       'achievement',
  QUEST_COMPLETE:    'quest-complete',
  LEVEL_UP:          'level-up',
  NEW_NOTIFICATION:  'new-notification',
  XP_EARNED:         'xp-earned',
  AGENT_CHAT:        'agent-chat',
  ERROR_WARNING:     'error-warning',
  TIMER_TICK:        'timer-tick',
  AMBIENT_SUCCESS:   'ambient-success',
});

// ─── Helpers ────────────────────────────────────────────────

/**
 * Create a short noise buffer for percussive sounds.
 * @param {AudioContext} ctx
 * @param {number} duration  Seconds
 * @returns {AudioBuffer}
 */
function noiseBuffer(ctx, duration) {
  const len = Math.round(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/**
 * Create a simple convolver reverb from a generated impulse.
 * @param {AudioContext} ctx
 * @param {number} duration  Impulse length in seconds
 * @param {number} decay     Decay exponent
 * @returns {ConvolverNode}
 */
function createReverb(ctx, duration = 0.4, decay = 2.0) {
  const conv = ctx.createConvolver();
  const len = Math.round(ctx.sampleRate * duration);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  conv.buffer = impulse;
  return conv;
}

// ─── SoundEffects ───────────────────────────────────────────

export class SoundEffects {
  /**
   * @param {AudioContext} [audioCtx]  Shared context from AudioSystem.
   *        If omitted, a new AudioContext is created lazily on first play.
   */
  constructor(audioCtx) {
    /** @type {AudioContext|null} */
    this._ctx = audioCtx || null;
    /** @type {boolean} */
    this._ownsCtx = !audioCtx;
    /** @type {GainNode|null} */
    this._master = null;
    /** @type {ConvolverNode|null} */
    this._reverb = null;
    /** @type {number} 0–1 */
    this._volume = 0.3;
    /** @type {boolean} */
    this._muted = false;
    /** @type {Map<string, number>} soundId → last play timestamp */
    this._cooldowns = new Map();
    /** @type {number} ms */
    this._cooldownMs = 200;
    /** @type {boolean} */
    this._initialized = false;
    /** @type {Function[]} event listener removers for cleanup */
    this._unbinders = [];

    this._loadPreferences();
    this._bindEvents();
  }

  // ── Lazy init ─────────────────────────────────────────────

  /**
   * Ensure AudioContext and master gain are ready.
   * @returns {boolean} true if ready to play.
   */
  _ensureCtx() {
    if (this._muted) return false;

    if (!this._ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      this._ctx = new Ctor();
      this._ownsCtx = true;
    }

    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }

    if (!this._initialized) {
      this._master = this._ctx.createGain();
      this._master.gain.value = this._volume;
      this._master.connect(this._ctx.destination);

      this._reverb = createReverb(this._ctx, 0.5, 2.5);
      this._reverb.connect(this._master);

      this._initialized = true;
    }

    return true;
  }

  // ── Preferences ───────────────────────────────────────────

  _loadPreferences() {
    try {
      const v = localStorage.getItem(STORAGE_KEY_SFX_VOLUME);
      if (v !== null) this._volume = parseFloat(v);
      const m = localStorage.getItem(STORAGE_KEY_SFX_MUTED);
      if (m !== null) this._muted = m === 'true';
    } catch (_) {}
  }

  _savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY_SFX_VOLUME, String(this._volume));
      localStorage.setItem(STORAGE_KEY_SFX_MUTED, String(this._muted));
    } catch (_) {}
  }

  // ── Cooldown gate ─────────────────────────────────────────

  /**
   * Returns true if the sound is allowed to play (not within cooldown).
   * @param {string} soundId
   * @returns {boolean}
   */
  _allowPlay(soundId) {
    const now = performance.now();
    const last = this._cooldowns.get(soundId) || 0;
    if (now - last < this._cooldownMs) return false;
    this._cooldowns.set(soundId, now);
    return true;
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Play a named sound effect.
   * @param {string} soundId  One of the SoundId constants.
   */
  play(soundId) {
    if (!this._allowPlay(soundId)) return;
    if (!this._ensureCtx()) return;

    const fn = this._sounds[soundId];
    if (fn) {
      fn.call(this);
    } else {
      console.warn(`[SoundEffects] Unknown sound: ${soundId}`);
    }
  }

  /**
   * Set the master volume for sound effects.
   * @param {number} v  0–1
   */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    this._savePreferences();
    if (this._master) {
      this._master.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.05);
    }
  }

  /** @returns {number} */
  getVolume() {
    return this._volume;
  }

  /** Mute all sound effects. */
  mute() {
    this._muted = true;
    this._savePreferences();
    if (this._master) {
      this._master.gain.setTargetAtTime(0, this._ctx.currentTime, 0.05);
    }
  }

  /** Unmute sound effects. */
  unmute() {
    this._muted = false;
    this._savePreferences();
    if (this._master) {
      this._master.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.05);
    }
  }

  /** @returns {boolean} */
  get isMuted() {
    return this._muted;
  }

  /** Tear down context and event listeners. */
  destroy() {
    for (const unbind of this._unbinders) {
      unbind();
    }
    this._unbinders.length = 0;

    if (this._ownsCtx && this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    this._master = null;
    this._reverb = null;
    this._initialized = false;
  }

  // ── Event wiring ──────────────────────────────────────────

  _bindEvents() {
    const on = (target, event, handler) => {
      target.addEventListener(event, handler);
      this._unbinders.push(() => target.removeEventListener(event, handler));
    };

    // Task complete — success chime
    on(window, 'dispatch:task-complete', () => {
      this.play(SoundId.TASK_COMPLETE);
    });

    // Task failed
    on(window, 'dispatch:task-failed', () => {
      this.play(SoundId.TASK_FAILED);
    });

    // Zone unlocked
    on(window, 'zone:unlocked', () => {
      this.play(SoundId.ZONE_UNLOCKED);
    });

    // Achievement unlocked
    on(window, 'achievement:unlocked', () => {
      this.play(SoundId.ACHIEVEMENT);
    });

    // Quest complete
    on(window, 'quest:complete', () => {
      this.play(SoundId.QUEST_COMPLETE);
    });

    // Level up
    on(window, 'world:level-up', () => {
      this.play(SoundId.LEVEL_UP);
    });

    // New notification
    on(document, 'notification:push', () => {
      this.play(SoundId.NEW_NOTIFICATION);
    });

    // XP earned
    on(window, 'xp:earned', () => {
      this.play(SoundId.XP_EARNED);
    });

    // Agent chat message
    on(window, 'agent:chat-message', () => {
      this.play(SoundId.AGENT_CHAT);
    });

    // Error / warning toast
    on(window, 'toast:show', (e) => {
      const type = e.detail?.type;
      if (type === 'error' || type === 'warning') {
        this.play(SoundId.ERROR_WARNING);
      }
    });

    // Timer tick
    on(window, 'timer:tick', () => {
      this.play(SoundId.TIMER_TICK);
    });

    // Ambient success (long pad swell on onboarding complete, etc.)
    on(window, 'onboarding:complete', () => {
      this.play(SoundId.AMBIENT_SUCCESS);
    });
  }

  // ── Sound definitions ─────────────────────────────────────
  //
  // Each method synthesises its sound from scratch using the
  // shared AudioContext. All routing goes through this._master.

  get _sounds() {
    return {
      [SoundId.TASK_COMPLETE]:    this._playTaskComplete,
      [SoundId.TASK_FAILED]:      this._playTaskFailed,
      [SoundId.ZONE_UNLOCKED]:    this._playZoneUnlocked,
      [SoundId.ACHIEVEMENT]:      this._playAchievement,
      [SoundId.QUEST_COMPLETE]:   this._playQuestComplete,
      [SoundId.LEVEL_UP]:         this._playLevelUp,
      [SoundId.NEW_NOTIFICATION]: this._playNewNotification,
      [SoundId.XP_EARNED]:        this._playXPEarned,
      [SoundId.AGENT_CHAT]:       this._playAgentChat,
      [SoundId.ERROR_WARNING]:    this._playErrorWarning,
      [SoundId.TIMER_TICK]:       this._playTimerTick,
      [SoundId.AMBIENT_SUCCESS]:  this._playAmbientSuccess,
    };
  }

  // ── 1. Task complete — 2-note ascending chime (C5 → E5) ──

  _playTaskComplete() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.3;
    reverbSend.connect(this._reverb);

    const playNote = (freq, t) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g);
      g.connect(this._master);
      g.connect(reverbSend);
      osc.start(t);
      osc.stop(t + 0.11);
    };

    playNote(NOTE.C5, now);
    playNote(NOTE.E5, now + 0.1);
  }

  // ── 2. Task failed — low descending buzz (A3 → E3) ───────

  _playTaskFailed() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const dur = 0.2;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(NOTE.A3, now);
    osc.frequency.exponentialRampToValueAtTime(NOTE.E3, now + dur);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this._master);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // ── 3. Zone unlocked — 3-note fanfare (C4 → E4 → G4) ────

  _playZoneUnlocked() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const notes = [NOTE.C4, NOTE.E4, NOTE.G4];

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.35;
    reverbSend.connect(this._reverb);

    notes.forEach((freq, i) => {
      const t = now + i * 0.15;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(g);
      g.connect(this._master);
      g.connect(reverbSend);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  // ── 4. Achievement — triumphant 4-note arpeggio ───────────
  //    C4 → E4 → G4 → C5, bright sine + harmonics

  _playAchievement() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const notes = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5];

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.4;
    reverbSend.connect(this._reverb);

    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const isLast = i === notes.length - 1;
      const dur = isLast ? 0.4 : 0.2;

      // Fundamental
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this._master);
      g.connect(reverbSend);
      osc.start(t);
      osc.stop(t + dur + 0.01);

      // 2nd harmonic for brightness
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
      osc2.connect(g2);
      g2.connect(this._master);
      osc2.start(t);
      osc2.stop(t + dur + 0.01);

      // 3rd harmonic (faint)
      const osc3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.value = freq * 3;
      g3.gain.setValueAtTime(0.03, t);
      g3.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
      osc3.connect(g3);
      g3.connect(this._master);
      osc3.start(t);
      osc3.stop(t + dur + 0.01);
    });
  }

  // ── 5. Quest complete — C major chord, hold 500ms, fade ───

  _playQuestComplete() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const chord = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5];
    const dur = 0.5;

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.5;
    reverbSend.connect(this._reverb);

    chord.forEach((freq) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Soft attack, sustained, gentle fade
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.2, now + 0.03);
      g.gain.setValueAtTime(0.2, now + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(g);
      g.connect(this._master);
      g.connect(reverbSend);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    });

    // Add a 5th (G4) reinforcement for fullness
    const osc5 = ctx.createOscillator();
    const g5 = ctx.createGain();
    osc5.type = 'triangle';
    osc5.frequency.value = NOTE.G4;
    g5.gain.setValueAtTime(0.0001, now);
    g5.gain.linearRampToValueAtTime(0.08, now + 0.05);
    g5.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc5.connect(g5);
    g5.connect(this._master);
    osc5.start(now);
    osc5.stop(now + dur + 0.05);
  }

  // ── 6. Level up — rising sweep (100Hz → 2kHz, sawtooth + LP filter)

  _playLevelUp() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const dur = 0.4;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(2000, now + dur);

    // Lowpass filter sweeps up with the frequency
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(4000, now + dur);
    filter.Q.value = 2;

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.05);
    g.gain.setValueAtTime(0.22, now + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this._master);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.3;
    g.connect(reverbSend);
    reverbSend.connect(this._reverb);

    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // ── 7. New notification — soft ping (G5, sine, 50ms + reverb)

  _playNewNotification() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const dur = 0.05;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = NOTE.G5;

    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.6;
    reverbSend.connect(this._reverb);

    osc.connect(g);
    g.connect(this._master);
    g.connect(reverbSend);

    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // ── 8. XP earned — quick coin sound (metallic FM synthesis, 30ms)

  _playXPEarned() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const dur = 0.03;

    // Carrier
    const carrier = ctx.createOscillator();
    const carrierGain = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.value = 1800;

    // Modulator for metallic FM timbre
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.type = 'sine';
    mod.frequency.value = 3400;
    modGain.gain.setValueAtTime(600, now);
    modGain.gain.exponentialRampToValueAtTime(1, now + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    carrierGain.gain.setValueAtTime(0.2, now);
    carrierGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    carrier.connect(carrierGain);
    carrierGain.connect(this._master);

    mod.start(now);
    carrier.start(now);
    mod.stop(now + dur + 0.01);
    carrier.stop(now + dur + 0.01);
  }

  // ── 9. Agent chat message — soft pop (noise burst + bandpass, 20ms)

  _playAgentChat() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const dur = 0.02;

    const buf = noiseBuffer(ctx, dur + 0.01);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 3;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this._master);

    src.start(now);
    src.stop(now + dur + 0.01);
  }

  // ── 10. Error / warning — two-tone alarm (A4/F4, 100ms × 3)

  _playErrorWarning() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const noteDur = 0.1;
    const tones = [NOTE.A4, NOTE.F4];

    for (let rep = 0; rep < 3; rep++) {
      tones.forEach((freq, j) => {
        const t = now + (rep * 2 + j) * noteDur;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
        osc.connect(g);
        g.connect(this._master);
        osc.start(t);
        osc.stop(t + noteDur + 0.01);
      });
    }
  }

  // ── 11. Timer tick — subtle click (noise, 5ms) ───────────

  _playTimerTick() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const dur = 0.005;

    const buf = noiseBuffer(ctx, dur + 0.002);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(hp);
    hp.connect(g);
    g.connect(this._master);

    src.start(now);
    src.stop(now + dur + 0.002);
  }

  // ── 12. Ambient success — warm pad swell (C major, 2s fade in/out)

  _playAmbientSuccess() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const totalDur = 2.0;
    const halfDur = totalDur / 2;
    const chord = [NOTE.C4, NOTE.E4, NOTE.G4];

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.6;
    reverbSend.connect(this._reverb);

    chord.forEach((freq) => {
      // Fundamental
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.12, now + halfDur);
      g.gain.linearRampToValueAtTime(0.0001, now + totalDur);

      osc.connect(g);
      g.connect(this._master);
      g.connect(reverbSend);
      osc.start(now);
      osc.stop(now + totalDur + 0.05);

      // Octave-up layer for shimmer
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;

      g2.gain.setValueAtTime(0.0001, now);
      g2.gain.linearRampToValueAtTime(0.04, now + halfDur);
      g2.gain.linearRampToValueAtTime(0.0001, now + totalDur);

      osc2.connect(g2);
      g2.connect(this._master);
      osc2.start(now);
      osc2.stop(now + totalDur + 0.05);
    });
  }
}

// ─── Factory ────────────────────────────────────────────────

/**
 * Create and return a SoundEffects instance.
 * @param {AudioContext} [audioCtx]  Optional shared AudioContext.
 * @returns {SoundEffects}
 */
export function initSoundEffects(audioCtx) {
  return new SoundEffects(audioCtx);
}
