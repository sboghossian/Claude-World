/**
 * boot.js — Claude World boot sequence
 * Dynamically imports all modules with progress logging,
 * then runs the 32-step initialization.
 */

const _log = (m) => {
  const el = document.querySelector(".splash__progress-label");
  if (el) el.textContent = m;
  console.log("[boot]", m);
};

// ── Dynamic imports with progress tracking ──────────────────────
_log("Loading core modules...");

let SplashScreen,
  initWorld,
  getWorldState,
  getBuildingManager,
  getApp,
  getCamera,
  getDayNight;
let initUI, MorningBriefing, OnboardingSystem, initOnboarding;
let AgentRelationshipSystem, IncidentPanel;
let initThemes,
  initThemePicker,
  initCelebrations,
  initAudio,
  ZoneAmbience,
  initSoundEffects;
let initPersonalityEngine, ThoughtBubbles, getQualityManager;
let initVFX, initParticles, initCityLife, initDataFlows;
let OnboardingCinema, NotificationCenter, Minimap, ActivityFeed;
let initAgentSprites, DragDropSystem, ContextMenu;
let SessionAgents;
let getAchievementEngine, TutorialEngine, FocusMode;
let TaskStream, AgentChat, StatusBar, PerfMonitor;

try {
  _log("Loading splash screen...");
  ({ SplashScreen } = await import("../ui/splash-screen.js"));

  _log("Loading PixiJS renderer...");
  ({
    initWorld,
    getWorldState,
    getBuildingManager,
    getApp,
    getCamera,
    getDayNight,
  } = await import("./app.js"));

  _log("Loading UI framework...");
  ({ initUI } = await import("../ui/index.js"));

  _log("Loading systems...");
  ({ MorningBriefing } = await import("../systems/morning-briefing.js"));
  ({ OnboardingSystem } = await import("../systems/onboarding.js"));
  ({ initOnboarding } = await import("../ui/onboarding.js"));
  ({ AgentRelationshipSystem } =
    await import("../systems/agent-relationships.js"));
  ({ IncidentPanel } = await import("../ui/incident-panel.js"));
  ({ initThemes } = await import("../systems/themes.js"));
  ({ initThemePicker } = await import("../ui/theme-picker.js"));
  ({ initCelebrations } = await import("../systems/celebrations.js"));
  ({ initAudio } = await import("../systems/audio.js"));
  ({ ZoneAmbience } = await import("../systems/zone-ambience.js"));
  ({ initSoundEffects } = await import("../systems/sound-effects.js"));
  ({ initPersonalityEngine } =
    await import("../systems/agent-personalities.js"));
  ({ ThoughtBubbles } = await import("../ui/thought-bubbles.js"));
  ({ getQualityManager } = await import("../systems/quality.js"));

  _log("Loading visual effects...");
  ({ initVFX } = await import("./vfx.js"));
  ({ initParticles } = await import("./particles.js"));
  ({ initCityLife } = await import("./city-life.js"));
  ({ initDataFlows } = await import("./data-flows.js"));

  _log("Loading UI components...");
  ({ OnboardingCinema } = await import("../systems/onboarding-cinema.js"));
  ({ NotificationCenter } = await import("../ui/notification-center.js"));
  ({ Minimap } = await import("../ui/minimap.js"));
  ({ ActivityFeed } = await import("../ui/activity-feed.js"));
  ({ initAgentSprites } = await import("./agent-sprites.js"));
  ({ SessionAgents } = await import("./session-agents.js"));
  ({ DragDropSystem } = await import("./drag-drop.js"));
  ({ ContextMenu } = await import("../ui/context-menu.js"));

  _log("Loading game systems...");
  ({ getAchievementEngine } = await import("../systems/achievements.js"));
  ({ TutorialEngine } = await import("../systems/tutorial.js"));
  ({ FocusMode } = await import("../systems/focus-mode.js"));
  ({ TaskStream } = await import("../ui/task-stream.js"));
  ({ AgentChat } = await import("../ui/agent-chat.js"));
  ({ StatusBar } = await import("../ui/status-bar.js"));
  ({ PerfMonitor } = await import("../ui/perf-monitor.js"));

  _log("All modules loaded!");
} catch (err) {
  console.error("[boot] Module import failed:", err);
  _log("ERROR: " + err.message);
  const sub = document.querySelector(".splash__subtitle");
  if (sub) sub.textContent = err.stack?.split("\n")[0] || "";
  throw err; // Stop boot
}

// ── Reputation listener ─────────────────────────────────────────
function initReputationListener(worldId) {
  const POINTS = {
    "dispatch:task-complete": {
      key: "task_complete",
      pts: 5,
      desc: (d) => d.description || "Task completed",
    },
    "skills-academy:create": {
      key: "skill_create",
      pts: 20,
      desc: (d) => (d.name ? `Skill "${d.name}" created` : "Skill created"),
    },
    "quest:complete": {
      key: "quest_complete",
      pts: 50,
      desc: (d) =>
        d.title ? `Quest "${d.title}" completed` : "Quest completed",
    },
    "zone:unlock": {
      key: "zone_unlock",
      pts: 30,
      desc: (d) =>
        d.zoneType ? `Zone "${d.zoneType}" unlocked` : "Zone unlocked",
    },
    "minion:run-complete": {
      key: "minion_run",
      pts: 3,
      desc: () => "Minion run completed",
    },
    "connector-docks:api-save": {
      key: "api_connect",
      pts: 25,
      desc: (d) =>
        d.provider ? `${d.provider} API connected` : "API connected",
    },
  };
  for (const [eventType, cfg] of Object.entries(POINTS)) {
    document.addEventListener(eventType, (e) => {
      const wid = (e.detail && e.detail.worldId) || worldId;
      if (!wid) return;
      window.api.db
        .awardReputation(wid, cfg.key, cfg.pts, cfg.desc(e.detail || {}))
        .catch(() => {});
    });
  }
}

// ── Main boot sequence ──────────────────────────────────────────
async function boot() {
  const splash = new SplashScreen();
  const TOTAL_STEPS = 32;
  try {
    // ── 1. Start the isometric world ──────────────────────────────
    splash.setProgress(1, TOTAL_STEPS, "Initializing world renderer...");
    await initWorld();
    console.log("[boot] World renderer initialized");

    // ── 2. Start the UI overlay ───────────────────────────────────
    splash.setProgress(2, TOTAL_STEPS, "Building UI overlay...");
    const ui = initUI({ cssBasePath: "../ui/" });
    console.log("[boot] UI layer initialized");

    // ── 3. Wire world state → HUD ────────────────────────────────
    splash.setProgress(3, TOTAL_STEPS, "Connecting world state...");
    const worldState = getWorldState();
    worldState.onChange((snapshot) => {
      ui.hud.setWorldState(snapshot.state);
    });

    // ── 4. Wire zone clicks → UI panels ──────────────────────────
    splash.setProgress(4, TOTAL_STEPS, "Wiring zone interactions...");
    document.addEventListener("zone-click", (e) => {
      const { zoneId, zoneName } = e.detail;
      ui.panels.openZone(zoneId, zoneName);
      ui.toasts.show({
        type: "info",
        title: zoneName,
        description: "Zone selected",
      });
    });

    // ── 5. Load zone build progress from DB → buildings ──────────
    splash.setProgress(5, TOTAL_STEPS, "Loading build progress...");
    async function syncBuildProgress(worldId) {
      try {
        const zones = await window.api.db.getZoneProgress(worldId);
        const bm = getBuildingManager();
        if (bm && zones && zones.length) {
          bm.updateAllFromDB(zones);
          console.log(
            "[boot] Build progress synced for",
            zones.length,
            "zones",
          );
        }
      } catch (err) {
        console.warn("[boot] Could not sync build progress:", err.message);
      }
    }

    // ── 6. Onboarding ─────────────────────────────────────────────
    splash.setProgress(6, TOTAL_STEPS, "Preparing onboarding...");
    const onboarding = new OnboardingSystem();
    initOnboarding(onboarding);

    document.addEventListener("onboarding:world-created", async (e) => {
      const { worldId, template } = e.detail;
      const startingZones = {
        startup_founder: ["dispatch", "brain", "legal"],
        startup: ["dispatch", "brain", "legal"],
        developer: ["dispatch", "brain", "docks"],
        freelancer: ["dispatch", "brain", "skills"],
      };
      const zones = startingZones[template] || ["dispatch", "brain"];
      for (const zoneType of zones) {
        await window.api.db.unlockZone(worldId, zoneType).catch(() => {});
      }
      await syncBuildProgress(worldId);
    });

    document.addEventListener("onboarding:complete", async (e) => {
      const worldId = e.detail?.worldId || 1;
      await syncBuildProgress(worldId);
    });

    // ── 7. Check if onboarding is needed ─────────────────────────
    splash.setProgress(7, TOTAL_STEPS, "Checking onboarding status...");
    if (!onboarding.isComplete()) {
      await onboarding.check();
    } else {
      try {
        const world = await window.api.db.getWorld(1);
        if (world?.id) await syncBuildProgress(world.id);
      } catch (_) {}
    }

    // ── 8. Wire zone progress on dispatch task complete ───────────
    splash.setProgress(8, TOTAL_STEPS, "Wiring dispatch events...");
    document.addEventListener("dispatch:task-complete", async (e) => {
      const { worldId, zoneType, success } = e.detail || {};
      if (!worldId || !zoneType) return;
      try {
        const zones = await window.api.db.getZoneProgress(worldId);
        const zone = zones?.find((z) => z.zone_type === zoneType);
        const current = zone?.build_progress ?? 0;
        const delta = success ? 0.08 + Math.random() * 0.07 : 0.02;
        const next = Math.min(1.0, current + delta);
        await window.api.db.updateZoneProgress(worldId, zoneType, next);
        const bm = getBuildingManager();
        if (bm) bm.setZoneProgress(zoneType, next);
      } catch (err) {
        console.warn("[boot] Could not update zone progress:", err.message);
      }
    });

    // ── 9. Agent relationships + incident panel ───────────────
    splash.setProgress(9, TOTAL_STEPS, "Loading agent relationships...");
    const incidentPanel = new IncidentPanel();
    incidentPanel.mount();
    const relationships = new AgentRelationshipSystem();
    try {
      const world = await window.api.db.getWorld(1);
      if (world?.id) {
        await relationships.init(world.id);
        window.__claudeWorldId = world.id;
      }
    } catch (err) {
      console.warn("[boot] Could not init relationships:", err.message);
    }

    // ── 10-15b: Non-critical systems (all wrapped in try/catch) ──
    splash.setProgress(10, TOTAL_STEPS, "Loading subsystems...");

    try {
      const b = new MorningBriefing();
      b.tryShow();
    } catch (e) {
      console.warn("[boot] Morning briefing:", e.message);
    }

    try {
      initReputationListener(window.__claudeWorldId || 1);
    } catch (e) {
      console.warn("[boot] Reputation:", e.message);
    }

    try {
      document.addEventListener("hud:avatar-click", () => {
        ui?.panels?.openZone("identity", "Identity");
      });
    } catch (e) {
      console.warn("[boot] Identity wire:", e.message);
    }

    let themeEngine = null;
    try {
      themeEngine = initThemes();
      initThemePicker(themeEngine);
      window.__themeEngine = themeEngine;
      document.addEventListener("theme:changed", (e) => {
        const bm = getBuildingManager();
        if (bm) bm.setThemeTint?.(e.detail.theme.buildingTint);
      });
    } catch (e) {
      console.warn("[boot] Themes:", e.message);
    }

    let audio = null;
    try {
      initCelebrations();
      audio = initAudio();
      window.__audio = audio;
      const sfx = initSoundEffects(audio?._ctx);
      window.__soundEffects = sfx;
      let zoneAmbience = null;
      document.addEventListener("zone-click", () => {
        if (zoneAmbience) return;
        const ctx = audio?._ctx;
        if (!ctx) return;
        zoneAmbience = new ZoneAmbience(ctx);
        window.__zoneAmbience = zoneAmbience;
      });
    } catch (e) {
      console.warn("[boot] Audio:", e.message);
    }

    try {
      const personalities = initPersonalityEngine();
      const canvas = document.getElementById("world-canvas");
      new ThoughtBubbles(canvas, personalities);
      window.__personalities = personalities;
    } catch (e) {
      console.warn("[boot] Personalities:", e.message);
    }

    try {
      const quality = getQualityManager({ firstRun: true });
      window.__quality = quality;
    } catch (e) {
      console.warn("[boot] Quality:", e.message);
    }

    // ── 16. VFX + City Life + Data Flows ─────────────────────────
    splash.setProgress(16, TOTAL_STEPS, "Starting VFX engine...");
    try {
      const pixiApp = getApp();
      if (pixiApp) {
        window.__vfx = initVFX(pixiApp);
        window.__particles = initParticles(pixiApp);
        window.__cityLife = initCityLife(pixiApp, pixiApp.stage);
        const bm = getBuildingManager();
        if (bm) {
          const dataFlows = initDataFlows(pixiApp, bm);
          pixiApp.stage.addChild(dataFlows.container);
          window.__dataFlows = dataFlows;
        }
      }
    } catch (e) {
      console.warn("[boot] VFX:", e.message);
    }

    // ── 17. Cinematic onboarding hook ────────────────────────────
    splash.setProgress(17, TOTAL_STEPS, "Preparing cinematic engine...");
    document.addEventListener("onboarding:complete", async (e) => {
      const wId = e.detail?.worldId || 1;
      try {
        const w = await window.api.db.getWorld(wId);
        if (w?.name) {
          const cinema = new OnboardingCinema({
            getCamera,
            getBuildingManager,
          });
          await cinema.play(wId, w.name);
        }
      } catch (err) {
        console.warn("[boot] Cinema:", err.message);
      }
      // API key nudge after cinema
      try {
        const keys = window.api?.keys?.list ? await window.api.keys.list() : [];
        if (!keys.some((k) => k.is_active)) {
          setTimeout(() => {
            window.__notifications?.push?.({
              category: "system",
              title: "Connect an AI provider",
              body: "Add an API key in Connector Docks to unlock your agents.",
            });
          }, 2500);
        }
      } catch (_) {}
    });

    // ── 18-32: UI components ─────────────────────────────────────
    splash.setProgress(18, TOTAL_STEPS, "Mounting UI components...");

    document.addEventListener("command:mission-control", () => {
      ui?.panels?.openZone("mission-control", "Mission Control");
    });

    try {
      const n = new NotificationCenter();
      n.mount();
      window.__notifications = n;
    } catch (e) {
      console.warn("[boot] Notifications:", e.message);
    }

    try {
      const cam = getCamera(),
        bm = getBuildingManager(),
        wc = document.getElementById("world-canvas");
      if (cam && bm && wc) {
        const m = new Minimap(wc, cam, bm);
        m.mount();
        window.__minimap = m;
      }
    } catch (e) {
      console.warn("[boot] Minimap:", e.message);
    }

    try {
      const f = new ActivityFeed();
      f.mount();
      window.__activityFeed = f;
    } catch (e) {
      console.warn("[boot] ActivityFeed:", e.message);
    }

    try {
      const pa = getApp();
      if (pa) {
        window.__agentSprites = initAgentSprites(pa, pa.stage);
      }
    } catch (e) {
      console.warn("[boot] Sprites:", e.message);
    }

    try {
      const pa = getApp();
      if (pa && SessionAgents) {
        const sessionAgents = new SessionAgents(pa, pa.stage);
        sessionAgents.start();
        window.__sessionAgents = sessionAgents;

        // Load initial sessions
        if (window.api?.sessions?.getActive) {
          window.api.sessions
            .getActive()
            .then((sessions) => {
              if (sessions?.length) sessionAgents.updateSessions(sessions);
            })
            .catch(() => {});
        }

        // Subscribe to live updates
        if (window.api?.sessions?.onUpdate) {
          window.api.sessions.onUpdate((sessions) => {
            sessionAgents.updateSessions(sessions || []);
          });
        }
      }
    } catch (e) {
      console.warn("[boot] SessionAgents:", e.message);
    }

    try {
      if (ui.mountTooltips) {
        ui.mountTooltips(
          document.getElementById("world-canvas"),
          getCamera(),
          getBuildingManager(),
        );
      }
    } catch (e) {
      console.warn("[boot] Tooltips:", e.message);
    }

    try {
      const pa = getApp(),
        cam = getCamera(),
        bm = getBuildingManager();
      if (pa && cam && bm) {
        const dd = new DragDropSystem(pa, cam, bm);
        dd.enable();
        window.__dragDrop = dd;
      }
    } catch (e) {
      console.warn("[boot] DragDrop:", e.message);
    }

    try {
      const cam = getCamera(),
        bm = getBuildingManager(),
        wc = document.getElementById("world-canvas");
      if (wc && cam && bm) {
        const cm = new ContextMenu(wc, cam, bm);
        cm.enable();
        window.__contextMenu = cm;
      }
    } catch (e) {
      console.warn("[boot] ContextMenu:", e.message);
    }

    try {
      const ae = getAchievementEngine();
      await ae.init(window.__claudeWorldId || 1);
      window.__achievements = ae;
    } catch (e) {
      console.warn("[boot] Achievements:", e.message);
    }

    try {
      const t = new TutorialEngine();
      window.__tutorials = t;
      if (!t.isComplete("getting-started") && onboarding.isComplete()) {
        setTimeout(() => t.start("getting-started"), 2000);
      }
    } catch (e) {
      console.warn("[boot] Tutorials:", e.message);
    }

    try {
      window.__focusMode = new FocusMode({
        getCamera,
        getDayNight: () => window.__dayNight,
      });
    } catch (e) {
      console.warn("[boot] FocusMode:", e.message);
    }

    try {
      const ts = new TaskStream();
      ts.mount();
      window.__taskStream = ts;
    } catch (e) {
      console.warn("[boot] TaskStream:", e.message);
    }

    try {
      const ac = new AgentChat();
      window.__agentChat = ac;
      document.addEventListener("agent-click", (ev) => ac.open(ev.detail));
    } catch (e) {
      console.warn("[boot] AgentChat:", e.message);
    }

    // Wire agent-click to open Agent Profile zone
    document.addEventListener("agent-click", (ev) => {
      try {
        const agentKey =
          ev.detail?.agentKey || ev.detail?.agentId || "commander";
        window.__agentProfileTarget = agentKey;
        ui.panels.openZone("agent-profile", "Agent Profile");
      } catch (e) {
        console.warn("[boot] AgentProfile open:", e.message);
      }
    });

    splash.setProgress(31, TOTAL_STEPS, "Mounting status bar...");
    try {
      const sb = new StatusBar();
      sb.mount();
      window.__statusBar = sb;
      try {
        const w = await window.api.db.getWorld(window.__claudeWorldId || 1);
        sb.setWorldName(w?.name || "Claude World");
      } catch (_) {
        sb.setWorldName("Claude World");
      }
      sb.setZone("home");
    } catch (e) {
      console.warn("[boot] StatusBar:", e.message);
    }

    splash.setProgress(32, TOTAL_STEPS, "Ready!");
    try {
      window.__perfMonitor = new PerfMonitor();
    } catch (e) {
      console.warn("[boot] PerfMonitor:", e.message);
    }

    // ── Done ─────────────────────────────────────────────────────
    await splash.fadeOut();
    console.log("[boot] Claude World is ready!");

    if (onboarding.isComplete()) {
      ui.panels.openZone("home", "Home");
    }
  } catch (err) {
    console.error("[boot] Initialization failed:", err);
    const splashEl = document.getElementById("splash");
    if (splashEl) splashEl.remove();
    document.body.innerHTML = `
      <div style="color: #ff4a6a; padding: 40px; font-family: monospace;">
        <h1>Claude World — Boot Error</h1>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `;
  }
}

boot();
