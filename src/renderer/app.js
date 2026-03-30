/**
 * app.js - Main entry point for the Claude World isometric renderer
 *
 * Initializes PixiJS, creates the world container, tile grid, buildings,
 * fog of war, camera system, and day/night cycle. Runs at 30fps with
 * frame skipping to conserve battery.
 */

import { Application, Container } from "pixi.js";
import { FRAME_INTERVAL } from "./constants.js";
import { createTileGrid, screenToTile } from "./tiles.js";
import { Camera } from "./camera.js";
import { BuildingManager } from "./buildings.js";
import { FogOfWar } from "./fog.js";
import { DayNightCycle } from "./daynight.js";
import { WeatherSystem } from "./weather.js";
import { WeatherEffects } from "./weather-effects.js";
import worldState from "../systems/world-state.js";

/** @type {Application | null} */
let app = null;
/** @type {Camera | null} */
let camera = null;
/** @type {BuildingManager | null} */
let buildingManager = null;
/** @type {FogOfWar | null} */
let fog = null;
/** @type {DayNightCycle | null} */
let dayNight = null;
/** @type {WeatherSystem | null} */
let weatherSystem = null;
/** @type {WeatherEffects | null} */
let weatherEffects = null;

/**
 * Initialize the Claude World renderer.
 * Attaches to the existing `<canvas id="world-canvas">` element.
 * @returns {Promise<void>}
 */
export async function initWorld() {
  const canvas = document.getElementById("world-canvas");
  if (!canvas) {
    throw new Error("Canvas element #world-canvas not found");
  }

  // ── Create PixiJS Application ─────────────────────────────────
  app = new Application();
  await app.init({
    canvas,
    resizeTo: window,
    background: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // ── World container (root of all isometric content) ───────────
  const worldContainer = new Container();
  worldContainer.sortableChildren = true;
  app.stage.addChild(worldContainer);

  // ── Tile grid (ground plane) ──────────────────────────────────
  const tileGrid = createTileGrid();
  tileGrid.zIndex = 0;
  worldContainer.addChild(tileGrid);

  // ── Buildings ─────────────────────────────────────────────────
  buildingManager = new BuildingManager();
  buildingManager.container.zIndex = 1;
  worldContainer.addChild(buildingManager.container);

  // ── Fog of war ────────────────────────────────────────────────
  fog = new FogOfWar();
  fog.container.zIndex = 2;
  worldContainer.addChild(fog.container);

  // ── Camera system ─────────────────────────────────────────────
  camera = new Camera(worldContainer, canvas);

  // ── Day/night cycle ───────────────────────────────────────────
  dayNight = new DayNightCycle(worldContainer);

  // ── Weather system ──────────────────────────────────────────────
  weatherSystem = new WeatherSystem(worldContainer);

  // Wire world state changes to the weather system
  worldState.onChange((snapshot) => {
    weatherSystem.setState(snapshot);
    weatherSystem.setActiveZones(worldState.getActiveZones());
  });

  // Initialize weather with current state
  weatherSystem.setState(worldState.getState());

  // ── Visual weather effects (rain, snow, fog, etc.) ───────────────
  weatherEffects = new WeatherEffects(app, worldContainer);

  // Map world state weather strings to visual effects
  const mapWeatherToEffect = (weather) => {
    switch (weather) {
      case "storm":
        return "storm";
      case "rain":
        return "rain";
      case "cloudy":
        return "cloudy";
      case "clear":
        return "clear";
      case "sunny":
        return "sunny";
      default:
        return "clear";
    }
  };

  // Wire world state changes to visual weather effects
  worldState.onChange((snapshot) => {
    const effectType = mapWeatherToEffect(snapshot.weather);
    const intensity = 1.0 - snapshot.moodScore; // lower mood = more intense weather
    weatherEffects.setWeather(effectType, intensity);
  });

  // Initialize visual effects with current state
  const initState = worldState.getState();
  weatherEffects.setWeather(
    mapWeatherToEffect(initState.weather),
    1.0 - initState.moodScore,
  );

  // ── Click handler ─────────────────────────────────────────────
  canvas.addEventListener("click", (e) => {
    if (!camera || !buildingManager) return;
    const worldPos = camera.screenToWorld(e.clientX, e.clientY);
    const hitZone = buildingManager.hitTest(worldPos.x, worldPos.y);
    if (hitZone) {
      console.log(
        `[Claude World] Clicked zone: ${hitZone.name} (${hitZone.id})`,
        hitZone,
      );
      // Dispatch custom event for the Electron shell to listen to
      document.dispatchEvent(
        new CustomEvent("zone-click", { detail: hitZone }),
      );
    }
  });

  // ── Window resize ─────────────────────────────────────────────
  window.addEventListener("resize", () => {
    if (app) {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    }
  });

  // ── Start render loop ─────────────────────────────────────────
  startRenderLoop();

  console.log("[Claude World] Renderer initialized");
}

/**
 * Main render loop targeting 30fps with frame skipping.
 */
function startRenderLoop() {
  let lastFrameTime = 0;

  const loop = (timestamp) => {
    requestAnimationFrame(loop);

    // Frame skip: only render at TARGET_FPS
    const elapsed = timestamp - lastFrameTime;
    if (elapsed < FRAME_INTERVAL) return;
    lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

    // Update systems
    const dt = elapsed / 1000;
    if (camera) camera.update(dt);
    if (dayNight) {
      dayNight.update();
      if (buildingManager) {
        buildingManager.setNightGlow(dayNight.nightIntensity);
      }
    }
    if (weatherSystem) {
      weatherSystem.update(dt);
    }
    if (weatherEffects) {
      if (dayNight) {
        weatherEffects.setDayNightIntensity(dayNight.nightIntensity);
      }
      weatherEffects.update(dt);
    }
    // Data flow visualization (attached at runtime via window.__dataFlows)
    if (window.__dataFlows) {
      window.__dataFlows.update(dt);
    }
  };

  requestAnimationFrame(loop);
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Get the camera instance for external control.
 * @returns {Camera | null}
 */
export function getApp() {
  return app;
}

export function getCamera() {
  return camera;
}

/**
 * Get the building manager for external queries.
 * @returns {BuildingManager | null}
 */
export function getBuildingManager() {
  return buildingManager;
}

/**
 * Get the fog of war instance.
 * @returns {FogOfWar | null}
 */
export function getFog() {
  return fog;
}

/**
 * Get the day/night cycle instance.
 * @returns {DayNightCycle | null}
 */
export function getDayNight() {
  return dayNight;
}

/**
 * Get the weather system instance.
 * @returns {WeatherSystem | null}
 */
export function getWeatherSystem() {
  return weatherSystem;
}

/**
 * Get the visual weather effects instance.
 * @returns {WeatherEffects | null}
 */
export function getWeatherEffects() {
  return weatherEffects;
}

/**
 * Get the world state manager singleton.
 * @returns {import('../systems/world-state.js').WorldStateManager}
 */
export function getWorldState() {
  return worldState;
}

/**
 * Convert screen coordinates to tile coordinates (convenience wrapper).
 * @param {number} screenX
 * @param {number} screenY
 * @returns {{ tileX: number, tileY: number } | null}
 */
export function getTileAt(screenX, screenY) {
  if (!camera) return null;
  const world = camera.screenToWorld(screenX, screenY);
  return screenToTile(world.x, world.y);
}

// initWorld() is called explicitly by src/renderer/index.html boot sequence
