// ============================================================
// Claude World — ZoneAmbience
// Zone-specific ambient soundscapes using Web Audio API synthesis.
// No audio files required — all sounds are procedurally generated.
// ============================================================

/**
 * @typedef {Object} AmbienceLayer
 * @property {OscillatorNode|AudioBufferSourceNode|null} source
 * @property {GainNode} gain
 * @property {BiquadFilterNode} [filter]
 * @property {number|null} timer  — setTimeout id for scheduled variations
 */

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Create a white noise AudioBuffer of a given duration.
 */
function createNoiseBuffer(ctx, duration = 2) {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/**
 * Small random deviation around a center value.
 */
function jitter(center, range) {
  return center + (Math.random() - 0.5) * 2 * range;
}

/**
 * Schedule a one-shot tone burst routed through `destination`.
 */
function scheduleOneShot(ctx, dest, opts) {
  const {
    freq,
    type = 'sine',
    duration = 0.08,
    gain = 0.12,
    detune = 0,
    attack = 0.005,
    startTime = ctx.currentTime,
  } = opts;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (detune) osc.detune.setValueAtTime(detune, startTime);

  g.gain.setValueAtTime(0.0001, startTime);
  g.gain.linearRampToValueAtTime(gain, startTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(g);
  g.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * Schedule a noise burst through a bandpass filter.
 */
function scheduleNoiseBurst(ctx, dest, opts) {
  const {
    centerFreq = 1000,
    Q = 2,
    duration = 0.05,
    gain = 0.08,
    attack = 0.003,
    startTime = ctx.currentTime,
  } = opts;

  const buf = createNoiseBuffer(ctx, duration + 0.05);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(centerFreq, startTime);
  bp.Q.setValueAtTime(Q, startTime);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, startTime);
  g.gain.linearRampToValueAtTime(gain, startTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(startTime);
  src.stop(startTime + duration + 0.05);
}

// ─── Zone Sound Profiles ─────────────────────────────────────

/**
 * Each profile factory receives (ctx, outputNode) and returns
 * { layers: AmbienceLayer[], timers: number[] }.
 *
 * Layers are continuous sounds; timers schedule occasional one-shots.
 */
const ZONE_PROFILES = {

  // ── Dispatch Tower ────────────────────────────────────────
  // Low pulsing hum (50 Hz) + occasional beep sequences
  dispatch_tower(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: 50 Hz pulsing hum
    const humGain = ctx.createGain();
    humGain.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 2.5; // pulse rate
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);

    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 50;
    lfoGain.connect(hum.frequency);

    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 120;

    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(out);
    hum.start();
    lfo.start();
    layers.push(
      { source: hum, gain: humGain, timer: null },
      { source: lfo, gain: lfoGain, timer: null },
    );

    // Layer 2: sub-harmonic at 25 Hz for depth
    const subGain = ctx.createGain();
    subGain.gain.value = 0.02;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 25;
    sub.detune.value = jitter(0, 3);
    sub.connect(subGain);
    subGain.connect(out);
    sub.start();
    layers.push({ source: sub, gain: subGain, timer: null });

    // Occasional beep sequences (command-center style)
    function scheduleBeeps() {
      const delay = 3000 + Math.random() * 6000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          scheduleOneShot(ctx, out, {
            freq: jitter(1200, 200),
            type: 'square',
            duration: 0.06,
            gain: 0.04,
            startTime: now + i * 0.12,
          });
        }
        scheduleBeeps();
      }, delay);
      timers.push(t);
    }
    scheduleBeeps();

    return { layers, timers };
  },

  // ── Brain Library ─────────────────────────────────────────
  // Soft warm pad (sine chord) + gentle page-turn clicks
  brain_library(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1–3: warm sine chord (root + 3rd + 5th)
    const chordFreqs = [174.6, 220.0, 261.6]; // F3 A3 C4
    chordFreqs.forEach((freq, i) => {
      const g = ctx.createGain();
      g.gain.value = 0.018;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = jitter(0, 4); // slight random detuning
      osc.connect(g);
      g.connect(out);
      osc.start();
      layers.push({ source: osc, gain: g, timer: null });

      // Slowly drift detune for living feel
      function drift() {
        const t = setTimeout(() => {
          const target = jitter(0, 6);
          osc.detune.linearRampToValueAtTime(target, ctx.currentTime + 3);
          drift();
        }, 3000 + Math.random() * 4000);
        timers.push(t);
      }
      drift();
    });

    // Occasional page-turn clicks (short noise bursts)
    function schedulePageTurn() {
      const delay = 2000 + Math.random() * 5000;
      const t = setTimeout(() => {
        scheduleNoiseBurst(ctx, out, {
          centerFreq: jitter(3000, 800),
          Q: 1.5,
          duration: 0.025,
          gain: 0.035,
        });
        schedulePageTurn();
      }, delay);
      timers.push(t);
    }
    schedulePageTurn();

    return { layers, timers };
  },

  // ── Treasury ──────────────────────────────────────────────
  // Coin-like chimes (FM synthesis) + register sounds
  treasury(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: soft shimmering high tone
    const shimGain = ctx.createGain();
    shimGain.gain.value = 0.012;
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 2093; // C7
    const shimLfo = ctx.createOscillator();
    shimLfo.type = 'sine';
    shimLfo.frequency.value = 0.3;
    const shimLfoG = ctx.createGain();
    shimLfoG.gain.value = 15;
    shimLfo.connect(shimLfoG);
    shimLfoG.connect(shimmer.frequency);
    shimmer.connect(shimGain);
    shimGain.connect(out);
    shimmer.start();
    shimLfo.start();
    layers.push(
      { source: shimmer, gain: shimGain, timer: null },
      { source: shimLfo, gain: shimLfoG, timer: null },
    );

    // Occasional coin chimes (FM synthesis — carrier + modulator)
    function scheduleCoinChime() {
      const delay = 1500 + Math.random() * 3500;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const envGain = ctx.createGain();

        const baseFreq = jitter(3000, 500);
        carrier.type = 'sine';
        carrier.frequency.value = baseFreq;
        modulator.type = 'sine';
        modulator.frequency.value = baseFreq * 1.414; // inharmonic ratio for metallic timbre
        modGain.gain.value = baseFreq * 0.8;

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        envGain.gain.setValueAtTime(0.0001, now);
        envGain.gain.linearRampToValueAtTime(0.06, now + 0.003);
        envGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        carrier.connect(envGain);
        envGain.connect(out);
        carrier.start(now);
        modulator.start(now);
        carrier.stop(now + 0.4);
        modulator.stop(now + 0.4);

        scheduleCoinChime();
      }, delay);
      timers.push(t);
    }
    scheduleCoinChime();

    // Register ka-ching (occasional noise + high tone)
    function scheduleRegister() {
      const delay = 6000 + Math.random() * 10000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        // Mechanical noise
        scheduleNoiseBurst(ctx, out, {
          centerFreq: 2500,
          Q: 0.8,
          duration: 0.04,
          gain: 0.03,
          startTime: now,
        });
        // Bell ring
        scheduleOneShot(ctx, out, {
          freq: jitter(4186, 200),
          type: 'sine',
          duration: 0.5,
          gain: 0.04,
          startTime: now + 0.05,
        });
        scheduleRegister();
      }, delay);
      timers.push(t);
    }
    scheduleRegister();

    return { layers, timers };
  },

  // ── Legal Tower ───────────────────────────────────────────
  // Gavel thuds + quill scratching (filtered noise)
  legal_tower(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: low ambient tone — courthouse gravity
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.02;
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 82.4; // E2
    drone.detune.value = jitter(0, 5);
    const droneFilt = ctx.createBiquadFilter();
    droneFilt.type = 'lowpass';
    droneFilt.frequency.value = 150;
    drone.connect(droneFilt);
    droneFilt.connect(droneGain);
    droneGain.connect(out);
    drone.start();
    layers.push({ source: drone, gain: droneGain, filter: droneFilt, timer: null });

    // Gavel thuds
    function scheduleGavel() {
      const delay = 5000 + Math.random() * 10000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.08, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.2);
        scheduleGavel();
      }, delay);
      timers.push(t);
    }
    scheduleGavel();

    // Quill scratching (short filtered noise bursts in rapid succession)
    function scheduleQuill() {
      const delay = 3000 + Math.random() * 5000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const strokes = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < strokes; i++) {
          scheduleNoiseBurst(ctx, out, {
            centerFreq: jitter(5000, 1500),
            Q: 3,
            duration: jitter(0.03, 0.01),
            gain: 0.02,
            startTime: now + i * jitter(0.08, 0.02),
          });
        }
        scheduleQuill();
      }, delay);
      timers.push(t);
    }
    scheduleQuill();

    return { layers, timers };
  },

  // ── The Council ───────────────────────────────────────────
  // Murmuring voices (band-passed noise) + occasional gong
  the_council(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: continuous murmur — looping band-passed noise
    const noiseBuf = createNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 300;
    bp.Q.value = 1.2;

    // Slow LFO on filter frequency for organic mumble
    const murmurLfo = ctx.createOscillator();
    murmurLfo.type = 'sine';
    murmurLfo.frequency.value = 0.4;
    const murmurLfoG = ctx.createGain();
    murmurLfoG.gain.value = 80;
    murmurLfo.connect(murmurLfoG);
    murmurLfoG.connect(bp.frequency);

    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0.025;

    noiseSrc.connect(bp);
    bp.connect(murmurGain);
    murmurGain.connect(out);
    noiseSrc.start();
    murmurLfo.start();
    layers.push(
      { source: noiseSrc, gain: murmurGain, filter: bp, timer: null },
      { source: murmurLfo, gain: murmurLfoG, timer: null },
    );

    // Layer 2: very low drone for solemnity
    const dGain = ctx.createGain();
    dGain.gain.value = 0.015;
    const dOsc = ctx.createOscillator();
    dOsc.type = 'sine';
    dOsc.frequency.value = 65.4; // C2
    dOsc.connect(dGain);
    dGain.connect(out);
    dOsc.start();
    layers.push({ source: dOsc, gain: dGain, timer: null });

    // Occasional gong (low ring modulation)
    function scheduleGong() {
      const delay = 8000 + Math.random() * 15000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const gongFreq = jitter(90, 10);

        // Fundamental
        scheduleOneShot(ctx, out, {
          freq: gongFreq,
          type: 'sine',
          duration: 2.5,
          gain: 0.06,
          attack: 0.01,
          startTime: now,
        });
        // Inharmonic partial
        scheduleOneShot(ctx, out, {
          freq: gongFreq * 2.42,
          type: 'sine',
          duration: 1.5,
          gain: 0.025,
          attack: 0.01,
          startTime: now,
        });
        // High partial
        scheduleOneShot(ctx, out, {
          freq: gongFreq * 5.14,
          type: 'sine',
          duration: 0.8,
          gain: 0.012,
          attack: 0.005,
          startTime: now,
        });

        scheduleGong();
      }, delay);
      timers.push(t);
    }
    scheduleGong();

    return { layers, timers };
  },

  // ── Sales District ────────────────────────────────────────
  // Phone ring tones (dual-tone) + cash register dings
  sales_district(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: busy ambient hum
    const humGain = ctx.createGain();
    humGain.gain.value = 0.012;
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 180;
    hum.connect(humGain);
    humGain.connect(out);
    hum.start();
    layers.push({ source: hum, gain: humGain, timer: null });

    // Occasional phone ring (DTMF-like dual-tone)
    function schedulePhoneRing() {
      const delay = 4000 + Math.random() * 8000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        // Two bursts of dual-tone
        for (let ring = 0; ring < 2; ring++) {
          const t0 = now + ring * 0.6;
          const freqLo = jitter(440, 20);
          const freqHi = jitter(480, 20);

          scheduleOneShot(ctx, out, { freq: freqLo, type: 'sine', duration: 0.3, gain: 0.04, startTime: t0 });
          scheduleOneShot(ctx, out, { freq: freqHi, type: 'sine', duration: 0.3, gain: 0.04, startTime: t0 });
        }
        schedulePhoneRing();
      }, delay);
      timers.push(t);
    }
    schedulePhoneRing();

    // Cash register dings
    function scheduleDing() {
      const delay = 5000 + Math.random() * 8000;
      const t = setTimeout(() => {
        scheduleOneShot(ctx, out, {
          freq: jitter(2637, 150),
          type: 'sine',
          duration: 0.4,
          gain: 0.05,
          attack: 0.002,
        });
        scheduleDing();
      }, delay);
      timers.push(t);
    }
    scheduleDing();

    return { layers, timers };
  },

  // ── Marketing Plaza ───────────────────────────────────────
  // Social media notification pings + typing clicks
  marketing_plaza(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: bright soft pad
    const padGain = ctx.createGain();
    padGain.gain.value = 0.012;
    const pad = ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.value = 523.25; // C5
    pad.detune.value = jitter(0, 5);
    pad.connect(padGain);
    padGain.connect(out);
    pad.start();
    layers.push({ source: pad, gain: padGain, timer: null });

    // Notification pings (short high tones at varying pitches)
    function schedulePing() {
      const delay = 1500 + Math.random() * 4000;
      const t = setTimeout(() => {
        const pingFreqs = [880, 1047, 1175, 1319, 1568];
        const freq = pingFreqs[Math.floor(Math.random() * pingFreqs.length)];
        scheduleOneShot(ctx, out, {
          freq: jitter(freq, 20),
          type: 'sine',
          duration: 0.12,
          gain: 0.04,
          attack: 0.002,
        });
        schedulePing();
      }, delay);
      timers.push(t);
    }
    schedulePing();

    // Typing clicks (rapid short noise bursts)
    function scheduleTyping() {
      const delay = 2000 + Math.random() * 4000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const keystrokes = 4 + Math.floor(Math.random() * 8);
        for (let i = 0; i < keystrokes; i++) {
          scheduleNoiseBurst(ctx, out, {
            centerFreq: jitter(6000, 1000),
            Q: 4,
            duration: 0.012,
            gain: 0.02,
            startTime: now + i * jitter(0.07, 0.025),
          });
        }
        scheduleTyping();
      }, delay);
      timers.push(t);
    }
    scheduleTyping();

    return { layers, timers };
  },

  // ── The Exchange ──────────────────────────────────────────
  // Data transfer whooshes (swept filters) + connection beeps
  the_exchange(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: digital hum (slightly detuned pair)
    const humGain = ctx.createGain();
    humGain.gain.value = 0.015;
    const h1 = ctx.createOscillator();
    h1.type = 'sawtooth';
    h1.frequency.value = 110;
    const h2 = ctx.createOscillator();
    h2.type = 'sawtooth';
    h2.frequency.value = 110.5;
    const hFilt = ctx.createBiquadFilter();
    hFilt.type = 'lowpass';
    hFilt.frequency.value = 250;
    h1.connect(hFilt);
    h2.connect(hFilt);
    hFilt.connect(humGain);
    humGain.connect(out);
    h1.start();
    h2.start();
    layers.push(
      { source: h1, gain: humGain, filter: hFilt, timer: null },
      { source: h2, gain: humGain, timer: null },
    );

    // Data whooshes (swept bandpass on noise)
    function scheduleWhoosh() {
      const delay = 2500 + Math.random() * 5000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        const dur = 0.3 + Math.random() * 0.3;
        const buf = createNoiseBuffer(ctx, dur + 0.1);
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const sweep = ctx.createBiquadFilter();
        sweep.type = 'bandpass';
        sweep.Q.value = 3;
        sweep.frequency.setValueAtTime(300, now);
        sweep.frequency.exponentialRampToValueAtTime(4000, now + dur);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.05, now + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(sweep);
        sweep.connect(g);
        g.connect(out);
        src.start(now);
        src.stop(now + dur + 0.1);

        scheduleWhoosh();
      }, delay);
      timers.push(t);
    }
    scheduleWhoosh();

    // Connection beeps (short paired tones)
    function scheduleBeep() {
      const delay = 3000 + Math.random() * 6000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        scheduleOneShot(ctx, out, { freq: jitter(800, 50), type: 'square', duration: 0.04, gain: 0.03, startTime: now });
        scheduleOneShot(ctx, out, { freq: jitter(1200, 50), type: 'square', duration: 0.04, gain: 0.03, startTime: now + 0.08 });
        scheduleBeep();
      }, delay);
      timers.push(t);
    }
    scheduleBeep();

    return { layers, timers };
  },

  // ── Airport ───────────────────────────────────────────────
  // Jet turbine drone (low-pass noise) + announcement chime (3-note melody)
  airport(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: turbine drone (looping filtered noise)
    const noiseBuf = createNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    lp.Q.value = 0.5;

    const turbineGain = ctx.createGain();
    turbineGain.gain.value = 0.035;

    noiseSrc.connect(lp);
    lp.connect(turbineGain);
    turbineGain.connect(out);
    noiseSrc.start();
    layers.push({ source: noiseSrc, gain: turbineGain, filter: lp, timer: null });

    // Layer 2: sub-bass rumble
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.02;
    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 40;
    rumble.detune.value = jitter(0, 3);
    rumble.connect(rumbleGain);
    rumbleGain.connect(out);
    rumble.start();
    layers.push({ source: rumble, gain: rumbleGain, timer: null });

    // Announcement chime (3-note descending melody)
    function scheduleAnnouncement() {
      const delay = 10000 + Math.random() * 15000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        // G5 - E5 - C5 (classic airport ding-dong-ding)
        const notes = [784, 659.25, 523.25];
        notes.forEach((freq, i) => {
          scheduleOneShot(ctx, out, {
            freq,
            type: 'sine',
            duration: 0.35,
            gain: 0.06,
            attack: 0.005,
            startTime: now + i * 0.25,
          });
        });
        scheduleAnnouncement();
      }, delay);
      timers.push(t);
    }
    scheduleAnnouncement();

    return { layers, timers };
  },

  // ── Mission Control (used as default / fallback) ──────────
  // Heartbeat-like pulse + static crackle + alert tones
  _default(ctx, out) {
    const layers = [];
    const timers = [];

    // Layer 1: heartbeat pulse (low sine with envelope via LFO)
    const beatGain = ctx.createGain();
    beatGain.gain.value = 0.03;
    const beatOsc = ctx.createOscillator();
    beatOsc.type = 'sine';
    beatOsc.frequency.value = 55;
    const beatLfo = ctx.createOscillator();
    beatLfo.type = 'sine';
    beatLfo.frequency.value = 1.1; // ~66 bpm heartbeat
    const beatLfoG = ctx.createGain();
    beatLfoG.gain.value = 0.025;
    beatLfo.connect(beatLfoG);
    beatLfoG.connect(beatGain.gain);
    beatOsc.connect(beatGain);
    beatGain.connect(out);
    beatOsc.start();
    beatLfo.start();
    layers.push(
      { source: beatOsc, gain: beatGain, timer: null },
      { source: beatLfo, gain: beatLfoG, timer: null },
    );

    // Layer 2: static crackle (very quiet noise)
    const crackBuf = createNoiseBuffer(ctx, 3);
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;
    crackSrc.loop = true;
    const crackHp = ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.value = 6000;
    const crackGain = ctx.createGain();
    crackGain.gain.value = 0.008;
    crackSrc.connect(crackHp);
    crackHp.connect(crackGain);
    crackGain.connect(out);
    crackSrc.start();
    layers.push({ source: crackSrc, gain: crackGain, filter: crackHp, timer: null });

    // Occasional alert tones
    function scheduleAlert() {
      const delay = 6000 + Math.random() * 10000;
      const t = setTimeout(() => {
        const now = ctx.currentTime;
        scheduleOneShot(ctx, out, {
          freq: jitter(660, 40),
          type: 'triangle',
          duration: 0.15,
          gain: 0.04,
          startTime: now,
        });
        scheduleOneShot(ctx, out, {
          freq: jitter(880, 40),
          type: 'triangle',
          duration: 0.15,
          gain: 0.03,
          startTime: now + 0.18,
        });
        scheduleAlert();
      }, delay);
      timers.push(t);
    }
    scheduleAlert();

    return { layers, timers };
  },
};

// ─── ZoneAmbience Class ─────────────────────────────────────

const CROSSFADE_DURATION = 2; // seconds

export class ZoneAmbience {
  /**
   * @param {AudioContext} audioContext — Shared AudioContext from AudioSystem
   */
  constructor(audioContext) {
    /** @type {AudioContext} */
    this._ctx = audioContext;

    /** @type {GainNode} */
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.7;
    this._master.connect(this._ctx.destination);

    /** @type {string|null} */
    this._currentZone = null;

    /** @type {GainNode|null} — Gain envelope for the current ambience */
    this._activeGain = null;

    /** @type {{ layers: AmbienceLayer[], timers: number[] }|null} */
    this._activeProfile = null;

    /** @type {boolean} */
    this._muted = false;

    /** @type {number} */
    this._volume = 0.7;

    this._bindEvents();
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Crossfade to the ambience for a given zone.
   * @param {string} zoneId — Zone identifier (e.g. 'dispatch_tower', 'brain_library')
   */
  setZone(zoneId) {
    if (zoneId === this._currentZone) return;

    // Resume context if suspended (e.g. autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }

    // Fade out the current ambience
    this._fadeOutCurrent();

    this._currentZone = zoneId;

    // Create a new gain envelope for the incoming ambience
    const envelopeGain = this._ctx.createGain();
    envelopeGain.gain.setValueAtTime(0.0001, this._ctx.currentTime);
    envelopeGain.gain.linearRampToValueAtTime(
      this._muted ? 0.0001 : 1,
      this._ctx.currentTime + CROSSFADE_DURATION,
    );
    envelopeGain.connect(this._master);

    // Look up profile factory
    const factory = ZONE_PROFILES[zoneId] || ZONE_PROFILES._default;
    const profile = factory(this._ctx, envelopeGain);

    this._activeGain = envelopeGain;
    this._activeProfile = profile;

    console.log(`[ZoneAmbience] Now playing: ${zoneId}`);
  }

  /**
   * Set master volume (0–1).
   * @param {number} v
   */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._master && !this._muted) {
      this._master.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.1);
    }
  }

  /**
   * Mute the zone ambience without destroying it.
   */
  mute() {
    this._muted = true;
    if (this._master) {
      this._master.gain.setTargetAtTime(0.0001, this._ctx.currentTime, 0.15);
    }
  }

  /**
   * Unmute — restore volume.
   */
  unmute() {
    this._muted = false;
    if (this._master) {
      this._master.gain.setTargetAtTime(this._volume, this._ctx.currentTime, 0.15);
    }
  }

  /**
   * Tear down everything — stop all sources, clear all timers.
   */
  destroy() {
    this._teardownProfile(this._activeProfile);
    this._activeProfile = null;
    this._activeGain = null;
    this._currentZone = null;

    try {
      this._master.disconnect();
    } catch (_) {}
  }

  // ── Internal ────────────────────────────────────────────

  /**
   * Fade out and tear down the current ambience over CROSSFADE_DURATION.
   */
  _fadeOutCurrent() {
    if (!this._activeGain || !this._activeProfile) return;

    const oldGain = this._activeGain;
    const oldProfile = this._activeProfile;
    const now = this._ctx.currentTime;

    // Ramp to silence
    oldGain.gain.setTargetAtTime(0.0001, now, CROSSFADE_DURATION / 3);

    // After the fade, disconnect and clean up
    setTimeout(() => {
      this._teardownProfile(oldProfile);
      try { oldGain.disconnect(); } catch (_) {}
    }, CROSSFADE_DURATION * 1000 + 200);

    this._activeGain = null;
    this._activeProfile = null;
  }

  /**
   * Stop all oscillators/sources and clear all timers in a profile.
   */
  _teardownProfile(profile) {
    if (!profile) return;

    for (const timer of profile.timers) {
      clearTimeout(timer);
    }
    profile.timers.length = 0;

    for (const layer of profile.layers) {
      if (layer.timer) clearTimeout(layer.timer);
      try {
        if (layer.source && typeof layer.source.stop === 'function') {
          layer.source.stop();
        }
      } catch (_) {}
      try {
        if (layer.source) layer.source.disconnect();
      } catch (_) {}
      try {
        if (layer.gain) layer.gain.disconnect();
      } catch (_) {}
      try {
        if (layer.filter) layer.filter.disconnect();
      } catch (_) {}
    }
    profile.layers.length = 0;
  }

  /**
   * Listen for zone-click events from the renderer.
   */
  _bindEvents() {
    this._onZoneClick = (e) => {
      const detail = e.detail;
      if (!detail) return;
      // The zone-click event detail is the zone object with .id
      const zoneId = detail.id || detail.zoneId;
      if (zoneId) {
        this.setZone(zoneId);
      }
    };
    document.addEventListener('zone-click', this._onZoneClick);
  }
}
