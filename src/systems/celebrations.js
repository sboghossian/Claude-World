// ============================================================
// Claude World — CelebrationSystem
// Full-screen canvas overlay for particle effects & animations.
// Uses a dedicated 2D canvas (NOT PixiJS).
// ============================================================

const PALETTE = ["#a855f7", "#3b82f6", "#eab308", "#ffffff", "#ec4899"];

// ─── Helpers ────────────────────────────────────────────────

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function randColor() {
  return PALETTE[randInt(0, PALETTE.length - 1)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ─── Particle types ─────────────────────────────────────────

class ConfettiParticle {
  constructor(canvasW, canvasH, intensity) {
    this.reset(canvasW, canvasH);
    this.life = rand(2500, 4000) / intensity;
    this.maxLife = this.life;
  }

  reset(w, h) {
    this.x = rand(0, w);
    this.y = rand(-40, -10);
    this.vx = rand(-1.5, 1.5);
    this.vy = rand(1.5, 4.5);
    this.rotation = rand(0, Math.PI * 2);
    this.rotationSpeed = rand(-0.08, 0.08);
    this.color = randColor();
    this.isCircle = Math.random() < 0.3;
    this.w = rand(4, 12);
    this.h = this.isCircle ? this.w : rand(4, 12);
    this.gravity = 0.4;
    this.drift = rand(-0.02, 0.02);
    this.alive = true;
  }

  update(dt, canvasH) {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    this.vy += this.gravity * (dt / 16.67);
    this.vx += this.drift * (dt / 16.67);
    this.x += this.vx * (dt / 16.67);
    this.y += this.vy * (dt / 16.67);
    this.rotation += this.rotationSpeed * (dt / 16.67);

    if (this.y > canvasH + 20) this.alive = false;
  }

  draw(ctx) {
    const alpha = Math.min(1, this.life / 400);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;

    if (this.isCircle) {
      ctx.beginPath();
      ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }

    ctx.restore();
  }
}

class XPFloater {
  constructor(x, y, amount) {
    this.x = x;
    this.y = y;
    this.startY = y;
    this.amount = amount;
    this.life = 1200;
    this.maxLife = 1200;
    this.alive = true;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }
    const t = 1 - this.life / this.maxLife;
    this.y = this.startY - easeOutCubic(t) * 60;
  }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#eab308";
    ctx.fillText(`+${this.amount} XP`, this.x, this.y);
    ctx.restore();
  }
}

class StarOrbiter {
  constructor(cx, cy, radius, speed, phase) {
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
    this.speed = speed;
    this.angle = phase;
    this.life = 1000;
    this.maxLife = 1000;
    this.alive = true;
    this.size = rand(3, 7);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }
    this.angle += this.speed * (dt / 16.67);
  }

  draw(ctx) {
    const alpha = Math.min(1, this.life / 200);
    const x = this.cx + Math.cos(this.angle) * this.radius;
    const y = this.cy + Math.sin(this.angle) * this.radius;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#eab308";
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    this._drawStar(ctx, x, y, this.size, this.size / 2, 5);
    ctx.fill();
    ctx.restore();
  }

  _drawStar(ctx, cx, cy, outerR, innerR, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      i === 0
        ? ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
        : ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }
}

class SparkleParticle {
  constructor(cx, cy) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(80, 200);
    this.x = cx;
    this.y = cy;
    this.vx = (Math.cos(angle) * speed) / 60;
    this.vy = (Math.sin(angle) * speed) / 60;
    this.life = rand(400, 800);
    this.maxLife = this.life;
    this.size = rand(2, 6);
    this.color = randColor();
    this.alive = true;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }
    this.vx *= 0.97;
    this.vy *= 0.97;
    this.x += this.vx * (dt / 16.67);
    this.y += this.vy * (dt / 16.67);
  }

  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Animation sequences (non-particle) ─────────────────────

class ScreenFlash {
  constructor(duration = 300) {
    this.duration = duration;
    this.life = duration;
    this.maxLife = duration;
    this.alive = true;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx, w, h) {
    const t = 1 - this.life / this.maxLife;
    // alpha: 0 → 0.8 → 0
    const alpha = t < 0.3 ? (t / 0.3) * 0.8 : 0.8 * (1 - (t - 0.3) / 0.7);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

class LevelUpText {
  constructor(cx, cy, level) {
    this.cx = cx;
    this.cy = cy;
    this.level = level;
    this.life = 600;
    this.maxLife = 600;
    this.alive = true;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    // scale: 0.5 → 1.5 → 1.0
    let scale;
    if (t < 0.5) {
      scale = lerp(0.5, 1.5, easeOutCubic(t / 0.5));
    } else {
      scale = lerp(1.5, 1.0, easeInOutQuad((t - 0.5) / 0.5));
    }

    const alpha = t < 0.15 ? t / 0.15 : t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(this.cx, this.cy);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Glow
    ctx.shadowColor = "#a855f7";
    ctx.shadowBlur = 30;
    ctx.font = "bold 72px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`LEVEL ${this.level}`, 0, 0);

    ctx.restore();
  }
}

class TrophyDrop {
  constructor(cx, questTitle) {
    this.cx = cx;
    this.startY = -60;
    this.targetY = 0; // will be computed relative to canvas center
    this.y = this.startY;
    this.vy = 0;
    this.questTitle = questTitle;
    this.life = 3000;
    this.maxLife = 3000;
    this.alive = true;
    this.bounced = false;
    this.bounceCount = 0;
    this.typewriterIndex = 0;
    this.typewriterTimer = 0;
    this.typewriterInterval = 45;
  }

  update(dt, canvasH) {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    const center = canvasH * 0.38;
    this.targetY = center;

    if (!this.bounced) {
      this.vy += 0.6 * (dt / 16.67);
      this.y += this.vy * (dt / 16.67);

      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.vy = -this.vy * 0.55;
        this.bounceCount++;
        if (Math.abs(this.vy) < 0.8) {
          this.bounced = true;
          this.y = this.targetY;
        }
      }
    }

    this.typewriterTimer += dt;
    if (this.typewriterTimer >= this.typewriterInterval) {
      this.typewriterTimer = 0;
      if (this.typewriterIndex < this.questTitle.length) {
        this.typewriterIndex++;
      }
    }
  }

  draw(ctx, canvasW) {
    const t = 1 - this.life / this.maxLife;
    const fadeOut = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, fadeOut);

    // Trophy emoji
    ctx.font = "64px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 20;
    ctx.fillText("🏆", canvasW / 2, this.y);

    // Quest title with typewriter
    const displayed = this.questTitle.slice(0, this.typewriterIndex);
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#eab308";
    ctx.shadowBlur = 14;
    ctx.fillText(displayed, canvasW / 2, this.y + 58);

    ctx.restore();
  }
}

class BuildingToast {
  // Slides in from bottom, stays, slides out
  constructor(buildingName, canvasW, canvasH) {
    this.buildingName = buildingName;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.life = 2600; // total life
    this.maxLife = 2600;
    this.slideInDuration = 350;
    this.stayDuration = 2000;
    this.slideOutDuration = 250;
    this.alive = true;
    this.elapsed = 0;
    this.h = 72;
    this.w = Math.min(480, canvasW - 64);
    this.pulse = 0;
  }

  update(dt) {
    this.life -= dt;
    this.elapsed += dt;
    this.pulse += dt / 400;
    if (this.life <= 0) this.alive = false;
  }

  _getY(canvasH) {
    const baseY = canvasH - this.h - 32;
    const slideTotal = this.h + 40;

    if (this.elapsed < this.slideInDuration) {
      // Slide in
      const t = easeOutCubic(this.elapsed / this.slideInDuration);
      return baseY + slideTotal * (1 - t);
    } else if (this.elapsed < this.slideInDuration + this.stayDuration) {
      return baseY;
    } else {
      // Slide out
      const t =
        (this.elapsed - this.slideInDuration - this.stayDuration) /
        this.slideOutDuration;
      return baseY + slideTotal * Math.min(1, t);
    }
  }

  draw(ctx, canvasW, canvasH) {
    const x = (canvasW - this.w) / 2;
    const y = this._getY(canvasH);
    const r = 12;
    const pulseAlpha = 0.6 + 0.4 * Math.sin(this.pulse * Math.PI * 2);

    ctx.save();
    ctx.globalAlpha = 1;

    // Background
    ctx.fillStyle = "rgba(15,10,30,0.92)";
    this._roundRect(ctx, x, y, this.w, this.h, r);
    ctx.fill();

    // Golden border with pulse
    ctx.strokeStyle = `rgba(234,179,8,${pulseAlpha})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 12 * pulseAlpha;
    this._roundRect(ctx, x, y, this.w, this.h, r);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#eab308";
    ctx.fillText(
      `🏗️ → ✨  ${this.buildingName} Complete!`,
      x + this.w / 2,
      y + this.h / 2,
    );

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

class StreakBanner {
  constructor(count, canvasW) {
    this.count = count;
    this.canvasW = canvasW;
    this.life = 2200;
    this.maxLife = 2200;
    this.alive = true;
    this.elapsed = 0;
    this.shakeAmp = 4;
    this.shakeDecay = 0.015;
  }

  update(dt) {
    this.life -= dt;
    this.elapsed += dt;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx, canvasW) {
    const t = 1 - this.life / this.maxLife;
    const fadeOut = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    const shake =
      this.shakeAmp *
      Math.exp(-this.shakeDecay * this.elapsed) *
      Math.sin(this.elapsed * 0.05);

    const x = canvasW - 220 + shake;
    const y = 32;

    ctx.save();
    ctx.globalAlpha = Math.max(0, fadeOut);

    // Gradient fire text
    const grad = ctx.createLinearGradient(x, y, x, y + 48);
    grad.addColorStop(0, "#ff4500");
    grad.addColorStop(0.5, "#ff8c00");
    grad.addColorStop(1, "#ffcc00");

    ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#ff4500";
    ctx.shadowBlur = 18;
    ctx.fillStyle = grad;
    ctx.fillText(`🔥 ${this.count}x STREAK!`, x, y);

    ctx.restore();
  }
}

// ─── Main System ─────────────────────────────────────────────

export class CelebrationSystem {
  constructor() {
    // Full-screen overlay canvas
    this._canvas = document.createElement("canvas");
    this._canvas.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9000;";
    document.body.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");
    this._resize();
    window.addEventListener("resize", () => this._resize());

    // Particle & effect pools
    this._particles = []; // ConfettiParticle, SparkleParticle, StarOrbiter, XPFloater
    this._effects = []; // ScreenFlash, LevelUpText, TrophyDrop, BuildingToast, StreakBanner

    this._running = false;
    this._raf = null;
    this._lastTime = null;

    // Streak tracking
    this._taskTimestamps = [];
    this._streakWindow = 5 * 60 * 1000; // 5 minutes

    this._bindEvents();
    this._start();
  }

  // ── Resize ───────────────────────────────────────────────

  _resize() {
    this._canvas.width = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  get _w() {
    return this._canvas.width;
  }
  get _h() {
    return this._canvas.height;
  }

  // ── Animation loop ───────────────────────────────────────

  _start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame((t) => this._loop(t));
  }

  _loop(now) {
    const dt = now - this._lastTime;
    this._lastTime = now;
    this._tick(dt);
    this._raf = requestAnimationFrame((t) => this._loop(t));
  }

  _tick(dt) {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._w, this._h);

    // Update & draw screen-level effects first (flash, level-up text)
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const e = this._effects[i];
      e.update(dt, this._h);
      if (!e.alive) {
        this._effects.splice(i, 1);
        continue;
      }

      if (e instanceof ScreenFlash) {
        e.draw(ctx, this._w, this._h);
      } else if (e instanceof LevelUpText) {
        e.draw(ctx);
      } else if (e instanceof TrophyDrop) {
        e.draw(ctx, this._w);
      } else if (e instanceof BuildingToast) {
        e.draw(ctx, this._w, this._h);
      } else if (e instanceof StreakBanner) {
        e.draw(ctx, this._w);
      }
    }

    // Update & draw particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      if (p instanceof ConfettiParticle) {
        p.update(dt, this._h);
      } else {
        p.update(dt);
      }

      if (!p.alive) {
        this._particles.splice(i, 1);
        continue;
      }
      p.draw(ctx);
    }
  }

  // ── Event bindings ───────────────────────────────────────

  _bindEvents() {
    window.addEventListener("quest:complete", (e) => {
      const title = e.detail?.title ?? "Quest Complete";
      this.triggerQuestComplete(title);
    });

    window.addEventListener("world:level-up", (e) => {
      const level = e.detail?.level ?? "?";
      this.triggerLevelUp(level);
    });

    window.addEventListener("dispatch:task-complete", (e) => {
      // XP float at HUD XP bar position (default bottom-center if not provided)
      const x = e.detail?.screenX ?? this._w / 2;
      const y = e.detail?.screenY ?? this._h - 80;
      const amount = e.detail?.xp ?? e.detail?.amount ?? 10;
      this.triggerXPFloat(x, y, amount);
      this._trackStreak();
    });

    window.addEventListener("zone:building-complete", (e) => {
      const name = e.detail?.buildingName ?? e.detail?.name ?? "Building";
      this.triggerBuildingComplete(name);
    });

    window.addEventListener("onboarding:complete", () => {
      this.triggerConfetti(3);
      setTimeout(() => this.triggerLevelUp(1), 600);
    });
  }

  // ── Streak tracking ──────────────────────────────────────

  _trackStreak() {
    const now = Date.now();
    this._taskTimestamps.push(now);
    // Prune old timestamps
    this._taskTimestamps = this._taskTimestamps.filter(
      (t) => now - t <= this._streakWindow,
    );
    const count = this._taskTimestamps.length;
    if (count >= 3) {
      this.triggerStreak(count);
    }
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Confetti rain.
   * @param {number} intensity Multiplier for particle count (default 1).
   */
  triggerConfetti(intensity = 1) {
    const count = Math.round(200 * intensity);
    for (let i = 0; i < count; i++) {
      // Stagger spawn times by offsetting Y start so they rain in over time
      const p = new ConfettiParticle(this._w, this._h, intensity);
      // Spread initial y across a range so they don't all appear at once
      p.y = rand(-this._h * 0.5, -10);
      this._particles.push(p);
    }
  }

  /**
   * XP number floater at screen coordinates.
   * @param {number} x
   * @param {number} y
   * @param {number} amount
   */
  triggerXPFloat(x, y, amount) {
    this._particles.push(new XPFloater(x, y, amount));
  }

  /**
   * Full level-up sequence.
   * @param {number|string} newLevel
   */
  triggerLevelUp(newLevel) {
    const cx = this._w / 2;
    const cy = this._h / 2;

    // a. Screen flash
    this._effects.push(new ScreenFlash(300));

    // b. Level text burst (delay slightly so flash hits first)
    setTimeout(() => {
      const txt = new LevelUpText(cx, cy, newLevel);
      this._effects.push(txt);

      // d. Star orbiters
      const starCount = 8;
      for (let i = 0; i < starCount; i++) {
        const orbiter = new StarOrbiter(
          cx,
          cy,
          120,
          0.05 + Math.random() * 0.03,
          (i / starCount) * Math.PI * 2,
        );
        orbiter.life = 1000;
        orbiter.maxLife = 1000;
        this._particles.push(orbiter);
      }
    }, 80);

    // c. Confetti rain
    setTimeout(() => this.triggerConfetti(2), 200);
  }

  /**
   * Quest complete fanfare.
   * @param {string} questTitle
   */
  triggerQuestComplete(questTitle) {
    const cx = this._w / 2;
    const cy = this._h / 2;

    // Trophy drop
    const trophy = new TrophyDrop(cx, questTitle);
    trophy.y = -60;
    this._effects.push(trophy);

    // Sparkle burst around trophy (spread over 300ms)
    for (let i = 0; i < 40; i++) {
      setTimeout(
        () => {
          this._particles.push(new SparkleParticle(cx, cy * 0.75));
        },
        rand(0, 300),
      );
    }
  }

  /**
   * Building complete toast banner.
   * @param {string} buildingName
   */
  triggerBuildingComplete(buildingName) {
    this._effects.push(new BuildingToast(buildingName, this._w, this._h));
  }

  /**
   * Streak multiplier banner.
   * @param {number} count Number of tasks in the streak window.
   */
  triggerStreak(count) {
    // Remove existing streak banners to avoid stacking
    for (let i = this._effects.length - 1; i >= 0; i--) {
      if (this._effects[i] instanceof StreakBanner) {
        this._effects.splice(i, 1);
      }
    }
    this._effects.push(new StreakBanner(count, this._w));
  }

  /**
   * Remove canvas from DOM and stop the loop.
   */
  destroy() {
    cancelAnimationFrame(this._raf);
    this._running = false;
    this._canvas.remove();
  }
}

// ─── Factory ─────────────────────────────────────────────────

export function initCelebrations() {
  return new CelebrationSystem();
}
