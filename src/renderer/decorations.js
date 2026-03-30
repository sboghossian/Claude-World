/**
 * decorations.js — Environmental decorations for Claude World
 *
 * Adds trees, street lamps, benches, fountains, signposts, vehicles,
 * clouds, and birds to the isometric city using PixiJS v8 Graphics.
 * All decorations are placed in worldContainer and animate each frame.
 */

import { Container, Graphics } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, COLORS } from "./constants.js";
import { tileToScreen } from "./tiles.js";
import { ZONE_DEFS, buildPathTiles } from "./zones.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// District colors for signposts
const DISTRICT_COLORS = {
  core: 0x4a90d9,
  business: 0x4caf50,
  advanced: 0x9c5ec7,
  edge: 0xe8893c,
};

// Vehicle palette
const VEHICLE_COLORS = [
  0xcc3333, 0x3366cc, 0x33aa55, 0xddaa22, 0xcc66cc, 0x44bbbb, 0xff8844,
  0x8855cc,
];

// ─────────────────────────────────────────────────────────────────────────────
// Decorations class
// ─────────────────────────────────────────────────────────────────────────────

export class Decorations {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('pixi.js').Container}   worldContainer
   */
  constructor(app, worldContainer) {
    this._app = app;
    this._world = worldContainer;
    this._time = 0;
    this._nightIntensity = 0; // 0 = day, 1 = full night

    // Containers
    this._groundLayer = new Container(); // benches, fountains
    this._treeLayer = new Container(); // trees, signposts
    this._lampLayer = new Container(); // street lamps
    this._vehicleLayer = new Container(); // vehicles
    this._skyLayer = new Container(); // clouds, birds (above buildings)

    // State arrays
    this._trees = [];
    this._lamps = [];
    this._benches = [];
    this._fountains = [];
    this._signposts = [];
    this._vehicles = [];
    this._clouds = [];
    this._birds = [];
    this._fountainParticles = [];

    // Cache
    this._pathTiles = null;
    this._widePathTiles = null;
    this._zoneTileSet = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  init() {
    // Build lookup sets
    const { pathTiles, widePathTiles } = buildPathTiles();
    this._pathTiles = pathTiles;
    this._widePathTiles = widePathTiles;
    this._zoneTileSet = this._buildZoneTileSet();

    // Add layers to world in order
    this._groundLayer.zIndex = 0.5;
    this._treeLayer.zIndex = 1.5;
    this._lampLayer.zIndex = 1.6;
    this._vehicleLayer.zIndex = 1.4;
    this._skyLayer.zIndex = 10;

    this._world.addChild(this._groundLayer);
    this._world.addChild(this._treeLayer);
    this._world.addChild(this._lampLayer);
    this._world.addChild(this._vehicleLayer);
    this._world.addChild(this._skyLayer);

    // Spawn everything
    this._spawnTrees();
    this._spawnLamps();
    this._spawnBenches();
    this._spawnFountains();
    this._spawnSignposts();
    this._spawnVehicles();
    this._spawnClouds();
    this._spawnBirds();

    console.log("[Decorations] Initialized");
  }

  /**
   * Called every frame from the render loop.
   * @param {number} dt — seconds since last frame
   */
  update(dt) {
    this._time += dt;
    this._updateTrees(dt);
    this._updateLamps();
    this._updateFountains(dt);
    this._updateVehicles(dt);
    this._updateClouds(dt);
    this._updateBirds(dt);
  }

  /**
   * Set day/night intensity so lamps and other elements respond.
   * @param {number} intensity — 0 (full day) to 1 (full night)
   */
  setDayNight(intensity) {
    this._nightIntensity = clamp(intensity, 0, 1);
  }

  destroy() {
    this._groundLayer.destroy({ children: true });
    this._treeLayer.destroy({ children: true });
    this._lampLayer.destroy({ children: true });
    this._vehicleLayer.destroy({ children: true });
    this._skyLayer.destroy({ children: true });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  _buildZoneTileSet() {
    const set = new Set();
    for (const z of ZONE_DEFS) {
      for (let dx = 0; dx < z.w; dx++) {
        for (let dy = 0; dy < z.h; dy++) {
          set.add(`${z.tileX + dx},${z.tileY + dy}`);
        }
      }
    }
    return set;
  }

  /** Check if a tile is open grass (not path, not zone, not water). */
  _isOpenGrass(tx, ty) {
    if (tx < 5 || ty < 5 || tx >= GRID_SIZE - 5 || ty >= GRID_SIZE - 5)
      return false;
    const key = `${tx},${ty}`;
    return !this._pathTiles.has(key) && !this._zoneTileSet.has(key);
  }

  /** Check if a tile is a path tile. */
  _isPath(tx, ty) {
    return this._pathTiles.has(`${tx},${ty}`);
  }

  /** Find tiles adjacent to paths (good for trees, lamps). */
  _tilesAdjacentToPath() {
    const result = [];
    for (const key of this._pathTiles) {
      const [px, py] = key.split(",").map(Number);
      const offsets = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, 1],
      ];
      for (const [dx, dy] of offsets) {
        const nx = px + dx;
        const ny = py + dy;
        if (this._isOpenGrass(nx, ny)) {
          result.push({ x: nx, y: ny });
        }
      }
    }
    return result;
  }

  /** Collect path tiles as an array of {x,y}. */
  _pathTileArray() {
    const arr = [];
    for (const key of this._pathTiles) {
      const [x, y] = key.split(",").map(Number);
      arr.push({ x, y });
    }
    return arr;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. TREES
  // ─────────────────────────────────────────────────────────────────────────

  _spawnTrees() {
    const candidates = this._tilesAdjacentToPath();
    // Also add some random grass tiles for parks
    for (let i = 0; i < 60; i++) {
      const tx = randInt(6, GRID_SIZE - 7);
      const ty = randInt(6, GRID_SIZE - 7);
      if (this._isOpenGrass(tx, ty)) {
        candidates.push({ x: tx, y: ty });
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const k = `${c.x},${c.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(c);
      }
    }

    // Shuffle and pick 35
    for (let i = unique.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unique[i], unique[j]] = [unique[j], unique[i]];
    }

    const count = Math.min(35, unique.length);
    for (let i = 0; i < count; i++) {
      const tile = unique[i];
      const size = pick(["small", "medium", "large"]);
      this._createTree(tile.x, tile.y, size);
    }
  }

  _createTree(tx, ty, size) {
    const { x: sx, y: sy } = tileToScreen(tx, ty);
    const gfx = new Graphics();

    const radii = { small: 8, medium: 12, large: 16 };
    const trunks = { small: 6, medium: 10, large: 14 };
    const r = radii[size];
    const trunkH = trunks[size];

    // Trunk (brown stick)
    gfx.rect(-1.5, -trunkH, 3, trunkH);
    gfx.fill({ color: 0x8b5e3c });

    // Canopy (green circle)
    gfx.circle(0, -trunkH - r * 0.6, r);
    gfx.fill({ color: 0x3d8b37, alpha: 0.9 });

    // Slightly lighter highlight
    gfx.circle(-r * 0.2, -trunkH - r * 0.8, r * 0.6);
    gfx.fill({ color: 0x5aad50, alpha: 0.4 });

    gfx.x = sx;
    gfx.y = sy;
    this._treeLayer.addChild(gfx);

    this._trees.push({
      gfx,
      baseX: sx,
      phase: Math.random() * Math.PI * 2,
      swayAmount: rand(0.3, 0.8),
      swaySpeed: rand(0.8, 1.5),
    });
  }

  _updateTrees(dt) {
    for (const tree of this._trees) {
      // Subtle sway: slight x-offset oscillation
      const offset =
        Math.sin(this._time * tree.swaySpeed + tree.phase) * tree.swayAmount;
      tree.gfx.x = tree.baseX + offset;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. STREET LAMPS
  // ─────────────────────────────────────────────────────────────────────────

  _spawnLamps() {
    const adjacent = this._tilesAdjacentToPath();
    const seen = new Set();
    const unique = [];
    for (const c of adjacent) {
      const k = `${c.x},${c.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(c);
      }
    }

    // Shuffle and pick ~24, spaced apart
    for (let i = unique.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unique[i], unique[j]] = [unique[j], unique[i]];
    }

    const placed = [];
    for (const tile of unique) {
      if (placed.length >= 24) break;
      // Ensure minimum spacing of 3 tiles from other lamps
      const tooClose = placed.some(
        (p) => Math.abs(p.x - tile.x) + Math.abs(p.y - tile.y) < 3,
      );
      if (tooClose) continue;
      placed.push(tile);
      this._createLamp(tile.x, tile.y);
    }
  }

  _createLamp(tx, ty) {
    const { x: sx, y: sy } = tileToScreen(tx, ty);
    const container = new Container();
    container.x = sx;
    container.y = sy;

    // Pole
    const pole = new Graphics();
    pole.rect(-0.8, -20, 1.6, 20);
    pole.fill({ color: 0x555555 });
    container.addChild(pole);

    // Lamp head
    const head = new Graphics();
    head.rect(-3, -22, 6, 3);
    head.fill({ color: 0x666666 });
    container.addChild(head);

    // Glow circle (will be updated each frame)
    const glow = new Graphics();
    container.addChild(glow);

    this._lampLayer.addChild(container);

    this._lamps.push({
      container,
      glow,
      sx,
      sy,
    });
  }

  _updateLamps() {
    for (const lamp of this._lamps) {
      lamp.glow.clear();

      // Glow intensity based on day/night
      const intensity = this._nightIntensity;
      if (intensity < 0.05) continue; // barely visible during day

      // Warm yellow glow
      const glowAlpha = lerp(0.0, 0.6, intensity);
      const glowRadius = lerp(2, 12, intensity);

      // Outer glow
      lamp.glow.circle(0, -21, glowRadius);
      lamp.glow.fill({ color: 0xffdd66, alpha: glowAlpha * 0.3 });

      // Inner bright point
      lamp.glow.circle(0, -21, 3);
      lamp.glow.fill({ color: 0xffffaa, alpha: glowAlpha });

      // Ground light pool
      lamp.glow.ellipse(0, 2, glowRadius * 1.5, glowRadius * 0.5);
      lamp.glow.fill({ color: 0xffdd66, alpha: glowAlpha * 0.1 });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. BENCHES
  // ─────────────────────────────────────────────────────────────────────────

  _spawnBenches() {
    // Place benches near zone buildings
    const candidates = [];
    for (const z of ZONE_DEFS) {
      // One tile below the zone
      const bx = z.tileX + Math.floor(z.w / 2);
      const by = z.tileY + z.h;
      if (this._isOpenGrass(bx, by)) {
        candidates.push({ x: bx, y: by });
      }
      // One tile to the right
      const rx = z.tileX + z.w;
      const ry = z.tileY + Math.floor(z.h / 2);
      if (this._isOpenGrass(rx, ry)) {
        candidates.push({ x: rx, y: ry });
      }
    }

    // Pick up to 10
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const count = Math.min(10, candidates.length);
    for (let i = 0; i < count; i++) {
      this._createBench(candidates[i].x, candidates[i].y);
    }
  }

  _createBench(tx, ty) {
    const { x: sx, y: sy } = tileToScreen(tx, ty);
    const gfx = new Graphics();

    // Seat (horizontal rectangle in isometric perspective)
    gfx.rect(-8, -3, 16, 3);
    gfx.fill({ color: 0x8b6b3c });

    // Left leg
    gfx.rect(-7, 0, 2, 4);
    gfx.fill({ color: 0x6b4f2c });

    // Right leg
    gfx.rect(5, 0, 2, 4);
    gfx.fill({ color: 0x6b4f2c });

    // Backrest
    gfx.rect(-8, -6, 16, 2);
    gfx.fill({ color: 0x7d5e34 });

    gfx.x = sx;
    gfx.y = sy;
    this._groundLayer.addChild(gfx);

    this._benches.push({ gfx });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. FOUNTAINS
  // ─────────────────────────────────────────────────────────────────────────

  _spawnFountains() {
    // Place fountains in open areas near the center and plazas
    const spots = [
      { x: 18, y: 18 }, // near dispatch
      { x: 26, y: 28 }, // near marketing plaza
      { x: 12, y: 22 }, // near R&D
    ];

    for (const spot of spots) {
      if (this._isOpenGrass(spot.x, spot.y)) {
        this._createFountain(spot.x, spot.y);
      }
    }
  }

  _createFountain(tx, ty) {
    const { x: sx, y: sy } = tileToScreen(tx, ty);
    const container = new Container();
    container.x = sx;
    container.y = sy;

    // Circular base (ellipse for isometric)
    const base = new Graphics();
    base.ellipse(0, 0, 14, 8);
    base.fill({ color: 0x8899aa, alpha: 0.8 });
    base.ellipse(0, 0, 12, 6);
    base.stroke({ color: 0xaabbcc, width: 1.5 });
    container.addChild(base);

    // Water pool
    const pool = new Graphics();
    pool.ellipse(0, 0, 10, 5);
    pool.fill({ color: 0x5599cc, alpha: 0.5 });
    container.addChild(pool);

    // Center pillar
    const pillar = new Graphics();
    pillar.rect(-2, -10, 4, 10);
    pillar.fill({ color: 0x99aabb });
    container.addChild(pillar);

    this._groundLayer.addChild(container);

    this._fountains.push({
      container,
      sx,
      sy,
      nextParticle: 0,
    });
  }

  _updateFountains(dt) {
    // Spawn new water particles
    for (const fountain of this._fountains) {
      if (this._time >= fountain.nextParticle) {
        this._spawnFountainParticle(fountain);
        fountain.nextParticle = this._time + rand(0.04, 0.1);
      }
    }

    // Update existing particles
    const alive = [];
    for (const p of this._fountainParticles) {
      p.elapsed += dt;
      if (p.elapsed >= p.duration) {
        p.gfx.parent?.removeChild(p.gfx);
        p.gfx.destroy();
        continue;
      }
      const t = p.elapsed / p.duration;

      // Parabolic arc: up then down
      const vy = p.vy0 - 80 * p.elapsed; // gravity
      p.gfx.x = p.startX + p.vx * p.elapsed;
      p.gfx.y = p.startY + p.vy0 * p.elapsed + 40 * p.elapsed * p.elapsed;
      // Actually let's do simple: rise then fall
      p.gfx.y = p.startY - 20 * Math.sin(t * Math.PI);
      p.gfx.x = p.startX + p.vx * p.elapsed;
      p.gfx.alpha = t < 0.7 ? 0.7 : lerp(0.7, 0, (t - 0.7) / 0.3);

      alive.push(p);
    }
    this._fountainParticles = alive;
  }

  _spawnFountainParticle(fountain) {
    const gfx = new Graphics();
    const size = rand(1, 2.5);
    gfx.circle(0, 0, size);
    // Blue-white water
    const color = Math.random() > 0.4 ? 0x88ccff : 0xddeeff;
    gfx.fill({ color, alpha: 0.7 });

    const startX = fountain.sx + rand(-3, 3);
    const startY = fountain.sy - 10;
    gfx.x = startX;
    gfx.y = startY;

    this._groundLayer.addChild(gfx);

    this._fountainParticles.push({
      gfx,
      startX,
      startY,
      vx: rand(-8, 8),
      vy0: rand(-30, -50),
      elapsed: 0,
      duration: rand(0.6, 1.2),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. SIGNPOSTS
  // ─────────────────────────────────────────────────────────────────────────

  _spawnSignposts() {
    // One signpost per district boundary — find tiles near district transitions
    const districtZones = {};
    for (const z of ZONE_DEFS) {
      if (!districtZones[z.district]) districtZones[z.district] = [];
      districtZones[z.district].push(z);
    }

    for (const [district, zones] of Object.entries(districtZones)) {
      // Place a signpost near the first zone of each district
      const z = zones[0];
      const tx = z.tileX - 1;
      const ty = z.tileY - 1;
      if (tx >= 5 && ty >= 5 && tx < GRID_SIZE - 5 && ty < GRID_SIZE - 5) {
        this._createSignpost(tx, ty, district);
      }
    }
  }

  _createSignpost(tx, ty, district) {
    const { x: sx, y: sy } = tileToScreen(tx, ty);
    const gfx = new Graphics();

    // Pole
    gfx.rect(-1, -16, 2, 16);
    gfx.fill({ color: 0x777777 });

    // Flag (small rectangle)
    const flagColor = DISTRICT_COLORS[district] || 0xffd700;
    gfx.rect(1, -16, 8, 5);
    gfx.fill({ color: flagColor, alpha: 0.85 });

    // Flag border
    gfx.rect(1, -16, 8, 5);
    gfx.stroke({ color: 0x333333, width: 0.5, alpha: 0.5 });

    gfx.x = sx;
    gfx.y = sy;
    this._treeLayer.addChild(gfx);

    this._signposts.push({ gfx });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. VEHICLES
  // ─────────────────────────────────────────────────────────────────────────

  _spawnVehicles() {
    const pathArr = this._pathTileArray();
    if (pathArr.length < 10) return;

    const count = randInt(5, 8);
    for (let i = 0; i < count; i++) {
      this._createVehicle(pathArr);
    }
  }

  _createVehicle(pathArr) {
    const color = pick(VEHICLE_COLORS);
    const gfx = new Graphics();

    // Small isometric car shape
    // Body
    gfx.rect(-6, -4, 12, 6);
    gfx.fill({ color });

    // Roof (slightly darker)
    const darker =
      ((((color >> 16) & 0xff) * 0.7) << 16) |
      ((((color >> 8) & 0xff) * 0.7) << 8) |
      ((color & 0xff) * 0.7);
    gfx.rect(-4, -6, 8, 3);
    gfx.fill({ color: darker });

    // Wheels (small dark circles)
    gfx.circle(-4, 2, 1.5);
    gfx.fill({ color: 0x222222 });
    gfx.circle(4, 2, 1.5);
    gfx.fill({ color: 0x222222 });

    this._vehicleLayer.addChild(gfx);

    // Pick a random starting path tile and build a route
    const startIdx = Math.floor(Math.random() * pathArr.length);
    const start = pathArr[startIdx];
    const route = this._buildVehicleRoute(start, pathArr);

    const startScreen = tileToScreen(start.x, start.y);
    gfx.x = startScreen.x;
    gfx.y = startScreen.y;

    this._vehicles.push({
      gfx,
      route,
      routeIdx: 0,
      progress: 0, // 0..1 between current and next waypoint
      speed: rand(0.3, 0.7), // tiles per second
    });
  }

  /** Build a simple route: walk along connected path tiles. */
  _buildVehicleRoute(start, pathArr) {
    const route = [{ x: start.x, y: start.y }];
    let cx = start.x;
    let cy = start.y;
    const visited = new Set();
    visited.add(`${cx},${cy}`);

    for (let step = 0; step < 30; step++) {
      const neighbors = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (this._pathTiles.has(key) && !visited.has(key)) {
          neighbors.push({ x: nx, y: ny });
        }
      }
      if (neighbors.length === 0) break;
      const next = pick(neighbors);
      visited.add(`${next.x},${next.y}`);
      route.push(next);
      cx = next.x;
      cy = next.y;
    }

    return route;
  }

  _updateVehicles(dt) {
    for (const v of this._vehicles) {
      if (v.route.length < 2) continue;

      v.progress += v.speed * dt;

      if (v.progress >= 1) {
        v.progress -= 1;
        v.routeIdx++;

        // Loop: when reaching end, reverse or restart
        if (v.routeIdx >= v.route.length - 1) {
          v.route.reverse();
          v.routeIdx = 0;
          v.progress = 0;
        }
      }

      const from = v.route[v.routeIdx];
      const to = v.route[Math.min(v.routeIdx + 1, v.route.length - 1)];

      const fromScreen = tileToScreen(from.x, from.y);
      const toScreen = tileToScreen(to.x, to.y);

      v.gfx.x = lerp(fromScreen.x, toScreen.x, v.progress);
      v.gfx.y = lerp(fromScreen.y, toScreen.y, v.progress);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. CLOUDS
  // ─────────────────────────────────────────────────────────────────────────

  _spawnClouds() {
    const count = randInt(3, 5);
    for (let i = 0; i < count; i++) {
      this._createCloud();
    }
  }

  _createCloud() {
    const gfx = new Graphics();

    // Cluster of overlapping ellipses for a fluffy look
    const cx = 0;
    const cy = 0;
    const baseW = rand(30, 60);
    const baseH = rand(10, 20);

    gfx.ellipse(cx, cy, baseW, baseH);
    gfx.fill({ color: 0xffffff, alpha: 0.25 });

    gfx.ellipse(cx - baseW * 0.3, cy + 2, baseW * 0.7, baseH * 0.8);
    gfx.fill({ color: 0xffffff, alpha: 0.2 });

    gfx.ellipse(cx + baseW * 0.35, cy - 1, baseW * 0.6, baseH * 0.7);
    gfx.fill({ color: 0xffffff, alpha: 0.2 });

    // Position in sky above the city
    // Use screen coordinates relative to world center
    const centerTile = GRID_SIZE / 2;
    const center = tileToScreen(centerTile, centerTile);
    gfx.x = center.x + rand(-600, 600);
    gfx.y = center.y - rand(100, 300); // above the city

    this._skyLayer.addChild(gfx);

    this._clouds.push({
      gfx,
      driftSpeed: rand(3, 8), // px per second (slow drift)
      baseY: gfx.y,
      bobPhase: Math.random() * Math.PI * 2,
      resetMinX: center.x - 800,
      resetMaxX: center.x + 800,
    });
  }

  _updateClouds(dt) {
    for (const cloud of this._clouds) {
      // Drift horizontally (parallax: slower than camera)
      cloud.gfx.x += cloud.driftSpeed * dt;

      // Gentle vertical bob
      cloud.gfx.y =
        cloud.baseY + Math.sin(this._time * 0.3 + cloud.bobPhase) * 3;

      // Wrap around when off-screen right
      if (cloud.gfx.x > cloud.resetMaxX) {
        cloud.gfx.x = cloud.resetMinX;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. BIRDS
  // ─────────────────────────────────────────────────────────────────────────

  _spawnBirds() {
    // Create 2-3 flocks
    const flockCount = randInt(2, 3);
    const centerTile = GRID_SIZE / 2;
    const center = tileToScreen(centerTile, centerTile);

    for (let f = 0; f < flockCount; f++) {
      const flockCenterX = center.x + rand(-300, 300);
      const flockCenterY = center.y - rand(80, 200);
      const orbitRadius = rand(40, 100);
      const orbitSpeed = rand(0.3, 0.6) * (Math.random() > 0.5 ? 1 : -1);
      const birdCount = randInt(2, 4);

      for (let b = 0; b < birdCount; b++) {
        const gfx = new Graphics();
        this._drawBird(gfx);
        this._skyLayer.addChild(gfx);

        const angleOffset = (b / birdCount) * Math.PI * 2 + rand(-0.3, 0.3);

        this._birds.push({
          gfx,
          centerX: flockCenterX,
          centerY: flockCenterY,
          orbitRadius: orbitRadius + rand(-10, 10),
          orbitSpeed,
          angleOffset,
          swoopPhase: rand(0, Math.PI * 2),
          swoopNext: this._time + rand(5, 15),
          swooping: false,
          swoopT: 0,
          wingPhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  _drawBird(gfx, wingAngle = 0) {
    gfx.clear();
    // Tiny V-shape
    const wingSpan = 5;
    const dip = 2 + Math.sin(wingAngle) * 1.5;

    gfx.moveTo(-wingSpan, -dip);
    gfx.lineTo(0, 0);
    gfx.lineTo(wingSpan, -dip);
    gfx.stroke({ color: 0x222222, width: 1.2, alpha: 0.7 });
  }

  _updateBirds(dt) {
    for (const bird of this._birds) {
      const angle = this._time * bird.orbitSpeed + bird.angleOffset;

      let x = bird.centerX + Math.cos(angle) * bird.orbitRadius;
      let y = bird.centerY + Math.sin(angle) * bird.orbitRadius * 0.4; // flatten for isometric

      // Occasional swooping
      if (!bird.swooping && this._time >= bird.swoopNext) {
        bird.swooping = true;
        bird.swoopT = 0;
      }
      if (bird.swooping) {
        bird.swoopT += dt;
        const swoopDuration = 1.5;
        if (bird.swoopT >= swoopDuration) {
          bird.swooping = false;
          bird.swoopNext = this._time + rand(5, 15);
        } else {
          const st = bird.swoopT / swoopDuration;
          y += Math.sin(st * Math.PI) * 25; // dip down and back up
        }
      }

      bird.gfx.x = x;
      bird.gfx.y = y;

      // Animate wings
      bird.wingPhase += dt * 8;
      this._drawBird(bird.gfx, bird.wingPhase);
    }
  }
}
