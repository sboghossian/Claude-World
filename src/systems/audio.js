// ============================================================
// Claude World — AudioSystem
// Web Audio API ambient soundscape + synthesized UI sounds.
// No audio files required — everything is synthesized in-browser.
// ============================================================

const STORAGE_KEY_ENABLED = 'claude-world:audio-enabled';
const STORAGE_KEY_VOLUME  = 'claude-world:audio-volume';

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Linear ramp a GainNode from current value to `target` over `duration` seconds.
 */
function rampGain(gainNode, target, duration, ctx) {
  gainNode.gain.setTargetAtTime(target, ctx.currentTime, duration / 3);
}

/**
 * Exponential ramp. Falls back to linear if value is 0 (exp ramp requires > 0).
 */
function expRamp(gainNode, target, endTime, ctx) {
  const safeTarget = Math.max(target, 0.0001);
  gainNode.gain.exponentialRampToValueAtTime(safeTarget, endTime);
}

/**
 * Create a simple one-shot tone.
 * @param {AudioContext} ctx
 * @param {GainNode} masterGain
 * @param {{ freq: number, type?: OscillatorType, duration: number, gain?: number, endGain?: number, detuneStart?: number, detuneEnd?: number, startTime?: number }} opts
 * @returns {{ osc: OscillatorNode, gainNode: GainNode }}
 */
function playTone(ctx, masterGain, opts) {
  const {
    freq,
    type = 'sine',
    duration,
    gain = 0.3,
    endGain = 0.0001,
    detuneStart = 0,
    detuneEnd = null,
    startTime = ctx.currentTime,
  } = opts;

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (detuneEnd !== null) {
    osc.detune.setValueAtTime(detuneStart * 100, startTime);
    osc.detune.linearRampToValueAtTime(detuneEnd * 100, startTime + duration);
  } else {
    osc.detune.setValueAtTime(detuneStart * 100, startTime);
  }

  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(endGain, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(masterGain);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);

  return { osc, gainNode };
}

/**
 * Create a simple reverb via a convolver with a generated impulse.
 */
function createReverb(ctx, duration = 0.5, decay = 2.0) {
  const convolver = ctx.createConvolver();
  const sampleRate = ctx.sampleRate;
  const length = Math.round(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  convolver.buffer = impulse;
  return convolver;
}

/**
 * Generate white noise buffer.
 */
function createNoiseBuffer(ctx, duration = 0.2) {
  const sampleRate = ctx.sampleRate;
  const length = Math.round(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// ─── AudioSystem ─────────────────────────────────────────────

export class AudioSystem {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx = null;
    /** @type {GainNode|null} */
    this._master = null;
    /** @type {boolean} */
    this._enabled = true;
    /** @type {number} */
    this._volume = 0.3;
    /** @type {{ drone1: OscillatorNode|null, drone2: OscillatorNode|null, droneGain: GainNode|null, blipTimer: number|null }} */
    this._ambient = {
      drone1: null,
      drone2: null,
      droneGain: null,
      blipTimer: null,
    };
    /** @type {ConvolverNode|null} */
    this._reverb = null;

    this._loadPreferences();
    this._bindEvents();
  }

  // ── Preferences ──────────────────────────────────────────

  _loadPreferences() {
    try {
      const storedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
      if (storedEnabled !== null) {
        this._enabled = storedEnabled !== 'false';
      }
      const storedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (storedVolume !== null) {
        this._volume = parseFloat(storedVolume);
      }
    } catch (_) {
      // localStorage unavailable
    }
  }

  _savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(this._enabled));
      localStorage.setItem(STORAGE_KEY_VOLUME, String(this._volume));
    } catch (_) {}
  }

  // ── Init ─────────────────────────────────────────────────

  /**
   * Initialize the AudioContext. Must be called after a user gesture.
   */
  init() {
    if (this._ctx) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn('[AudioSystem] Web Audio API not supported.');
      return;
    }

    this._ctx = new AudioCtx();

    // Master gain
    this._master = this._ctx.createGain();
    this._master.gain.value = this._enabled ? this._volume : 0;
    this._master.connect(this._ctx.destination);

    // Shared reverb
    this._reverb = createReverb(this._ctx, 0.6, 2.5);
    this._reverb.connect(this._master);

    this._startAmbient();
  }

  // ── Ambient soundscape ───────────────────────────────────

  /**
   * Low, evolving ambient drone using two oscillators + occasional blips.
   */
  _startAmbient() {
    const ctx = this._ctx;
    const master = this._master;

    // Drone gain — very subtle
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.02;

    // Lowpass filter to keep it sub-bass only
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    filter.Q.value = 0.8;

    // Drone 1: 55 Hz sine
    const drone1 = ctx.createOscillator();
    drone1.type = 'sine';
    drone1.frequency.value = 55;

    // Drone 2: 110 Hz sine, slight detune for beat frequency
    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 110;
    drone2.detune.value = 5; // +5 cents

    drone1.connect(filter);
    drone2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(master);

    drone1.start();
    drone2.start();

    this._ambient.drone1 = drone1;
    this._ambient.drone2 = drone2;
    this._ambient.droneGain = droneGain;

    // Slowly evolve drone detune over time for a living feel
    this._evolveDrone();

    // Schedule random blip tones
    this._scheduleNextBlip();
  }

  _evolveDrone() {
    if (!this._ctx || !this._ambient.drone2) return;
    const ctx = this._ctx;
    const osc = this._ambient.drone2;

    // Drift detune between -5 and +8 cents randomly
    const nextDetune = (Math.random() - 0.4) * 13;
    const nextTime = 4 + Math.random() * 6;

    osc.detune.linearRampToValueAtTime(nextDetune, ctx.currentTime + nextTime);

    this._ambient.droneEvolveTimer = setTimeout(() => this._evolveDrone(), nextTime * 1000);
  }

  _scheduleNextBlip() {
    const delay = 4000 + Math.random() * 8000; // 4–12 seconds
    this._ambient.blipTimer = setTimeout(() => {
      if (this._ctx && this._enabled) {
        this._playAmbientBlip();
      }
      this._scheduleNextBlip();
    }, delay);
  }

  _playAmbientBlip() {
    const ctx = this._ctx;
    const freq = 800 + Math.random() * 400; // 800–1200 Hz

    playTone(ctx, this._master, {
      freq,
      type: 'sine',
      duration: 0.05,
      gain: 0.05,
      endGain: 0.0001,
    });
  }

  _stopAmbient() {
    clearTimeout(this._ambient.blipTimer);
    clearTimeout(this._ambient.droneEvolveTimer);
    try {
      this._ambient.drone1?.stop();
      this._ambient.drone2?.stop();
    } catch (_) {}
    this._ambient.drone1 = null;
    this._ambient.drone2 = null;
  }

  // ── Guard ────────────────────────────────────────────────

  _ready() {
    if (!this._ctx || !this._enabled) return false;
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return true;
  }

  // ── UI Sound Effects ─────────────────────────────────────

  /**
   * Two-note arpeggio: C5 then E5. Sine wave with subtle reverb.
   */
  playTaskComplete() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const C5 = 523.25;
    const E5 = 659.25;

    // Connect to reverb send as well for warmth
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.25;
    sendGain.connect(this._reverb);

    const playNote = (freq, startTime) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.28, startTime);
      g.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.15);
      osc.connect(g);
      g.connect(this._master);
      g.connect(sendGain);
      osc.start(startTime);
      osc.stop(startTime + 0.16);
    };

    playNote(C5, now);
    playNote(E5, now + 0.09);
  }

  /**
   * Low thud: 80 Hz sawtooth, 150ms, fast decay.
   */
  playError() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const dist = ctx.createWaveShaper();

    // Soft distortion curve for a thud character
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
    }
    dist.curve = curve;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(dist);
    dist.connect(g);
    g.connect(this._master);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Rising chirp: 400Hz → 800Hz, 100ms, triangle wave.
   */
  playXPGain() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(g);
    g.connect(this._master);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  /**
   * Ascending arpeggio: C4, E4, G4, C5, each ~100ms.
   * Full, resonant sine tones.
   */
  playLevelUp() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4 E4 G4 C5
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.35;
    sendGain.connect(this._reverb);

    notes.forEach((freq, i) => {
      const startTime = now + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();

      // Add a subtle harmonic
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      g2.gain.setValueAtTime(0.06, startTime);
      g2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
      osc2.connect(g2);
      g2.connect(this._master);
      osc2.start(startTime);
      osc2.stop(startTime + 0.26);

      osc.type = 'sine';
      osc.frequency.value = freq;
      const noteDuration = i === notes.length - 1 ? 0.5 : 0.2;
      g.gain.setValueAtTime(0.3, startTime);
      g.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);

      osc.connect(g);
      g.connect(this._master);
      g.connect(sendGain);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.01);
    });
  }

  /**
   * Soft whoosh: filtered noise burst, 200ms.
   */
  playZoneOpen() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const duration = 0.2;

    const noiseBuffer = createNoiseBuffer(ctx, duration + 0.05);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    // Bandpass sweep for whoosh character
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(200, now);
    bandpass.frequency.exponentialRampToValueAtTime(2000, now + duration);
    bandpass.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(bandpass);
    bandpass.connect(g);
    g.connect(this._master);

    source.start(now);
    source.stop(now + duration + 0.05);
  }

  /**
   * Gentle bell: 880Hz sine, 300ms, exponential decay.
   * Warm with reverb.
   */
  playToast() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.4;
    sendGain.connect(this._reverb);

    // Bell fundamental
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(g);
    g.connect(this._master);
    g.connect(sendGain);
    osc.start(now);
    osc.stop(now + 0.52);

    // Bell harmonic (inharmonic partial for bell character)
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 880 * 2.756; // inharmonic partial
    g2.gain.setValueAtTime(0.08, now);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc2.connect(g2);
    g2.connect(this._master);
    osc2.start(now);
    osc2.stop(now + 0.21);
  }

  /**
   * Triumphant 4-note fanfare using sine waves.
   * G4 - C5 - E5 - G5 with overlapping sustain.
   */
  playQuestComplete() {
    if (!this._ready()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const fanfare = [
      { freq: 392.00, start: 0,    dur: 0.18 }, // G4
      { freq: 523.25, start: 0.12, dur: 0.18 }, // C5
      { freq: 659.25, start: 0.24, dur: 0.18 }, // E5
      { freq: 783.99, start: 0.36, dur: 0.55 }, // G5 — long final
    ];

    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.5;
    sendGain.connect(this._reverb);

    fanfare.forEach(({ freq, start, dur }) => {
      const startTime = now + start;

      // Fundamental
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, startTime);
      g.gain.linearRampToValueAtTime(0.32, startTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
      osc.connect(g);
      g.connect(this._master);
      g.connect(sendGain);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.01);

      // 5th harmonic for richness
      const osc3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.value = freq * 1.5;
      g3.gain.setValueAtTime(0.0001, startTime);
      g3.gain.linearRampToValueAtTime(0.09, startTime + 0.02);
      g3.gain.exponentialRampToValueAtTime(0.0001, startTime + dur * 0.7);
      osc3.connect(g3);
      g3.connect(this._master);
      osc3.start(startTime);
      osc3.stop(startTime + dur);
    });
  }

  // ── Settings ─────────────────────────────────────────────

  /**
   * Enable or disable all audio.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    this._savePreferences();

    if (!this._ctx) return;

    if (this._master) {
      rampGain(this._master, enabled ? this._volume : 0, 0.3, this._ctx);
    }

    if (enabled && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  /**
   * Set master volume.
   * @param {number} v Value from 0 to 1.
   */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    this._savePreferences();

    if (this._master && this._enabled) {
      rampGain(this._master, this._volume, 0.15, this._ctx);
    }
  }

  /** @returns {boolean} */
  get enabled() { return this._enabled; }

  /** @returns {number} */
  get volume() { return this._volume; }

  // ── Event bindings ───────────────────────────────────────

  _bindEvents() {
    // Lazy init on first user gesture
    const initOnce = () => {
      this.init();
      window.removeEventListener('click', initOnce);
      window.removeEventListener('keydown', initOnce);
    };
    window.addEventListener('click', initOnce);
    window.addEventListener('keydown', initOnce);

    window.addEventListener('dispatch:task-complete', () => {
      this.playTaskComplete();
      // Small offset so the XP chirp hits just after the task sound
      setTimeout(() => this.playXPGain(), 120);
    });

    window.addEventListener('quest:complete', () => {
      this.playQuestComplete();
    });

    window.addEventListener('world:level-up', () => {
      this.playLevelUp();
    });

    window.addEventListener('zone-click', () => {
      this.playZoneOpen();
    });

    window.addEventListener('toast:show', (e) => {
      const type = e.detail?.type;
      if (type === 'error') {
        this.playError();
      } else {
        // success, info, default
        this.playToast();
      }
    });

    window.addEventListener('onboarding:complete', () => {
      this.playLevelUp();
    });
  }

  // ── Cleanup ──────────────────────────────────────────────

  /**
   * Tear down the AudioContext and all ambient nodes.
   */
  async destroy() {
    this._stopAmbient();
    if (this._ctx) {
      await this._ctx.close().catch(() => {});
      this._ctx = null;
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────

/**
 * Create and return a fully wired AudioSystem instance.
 * The AudioContext is lazy-initialised on the first user interaction.
 */
export function initAudio() {
  return new AudioSystem();
}
