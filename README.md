# Claude World 🏙️

> An AI-native OS visualized as a living, breathing isometric city — built with Electron, PixiJS, and Claude.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-v41-47848F?logo=electron)](https://www.electronjs.org/)
[![PixiJS](https://img.shields.io/badge/PixiJS-v8-e91e8c)](https://pixijs.com/)

![Claude World Screenshot](build/screenshot-placeholder.png)

## What is Claude World?

Claude World is a **Mac desktop app** where your AI agents live inside an isometric city. Every workflow, task, and system becomes a zone you can see, click, and interact with. The city grows as you work — buildings rise, agents wander the streets, zones unlock, and the world evolves based on your activity.

It's not a chat interface. It's not a dashboard. It's a **place** your AI agents actually inhabit.

### The City Zones

| Zone | Color | Purpose |
|------|-------|---------|
| **Dispatch HQ** | Cyan | Run AI tasks — single or multi-step agent dispatch |
| **Brain Library** | Purple | Memory, knowledge, long-term storage |
| **Skills Academy** | Amber | Build and train custom skills |
| **Legal Tower** | Gold | AI-drafted legal docs, contracts, NDAs |
| **The Council** | Multi | Multi-model debates (Claude vs GPT-4 vs Gemini) |
| **The Archive** | Blue | World snapshots and experiments |
| **R&D Lab** | Teal | Long-horizon research and experimentation |
| **Identity Panel** | Lavender | World identity, reputation, XP system |
| **Sales District** | Emerald | Lead tracking and AI sales workflows |
| **Marketing Plaza** | Purple | Content pipeline and campaign management |
| **The Exchange** | Orange | API integrations and webhook management |
| **The Market** | Pink | Install community tools and extensions |
| **The Airport** | Sky | Deploy agents to external environments |
| **Globe Room** | Indigo | Global research and intelligence |
| **Broadcast Tower** | Red | Channels and broadcast messaging |
| **World Versions** | Violet | Version control for your entire world |
| **Mission Control** | Green | Command center — terminal + analytics |
| **Treasury** | Gold | Budget tracking and cost management |
| **Chat Rooms** | Blue | Agent communication and logs |
| **Connector Docks** | Teal | External API connections |
| **Minion Tunnels** | Gray | Background automation pipelines |
| **Memory Vault** | Purple | Persistent agent memory store |

### Visual Systems

- **Isometric city** rendered in WebGL via PixiJS v8 — 40×40 tile grid
- **Day/night cycle** — the city transforms at dusk and dawn
- **Dynamic weather** — rain, fog, clear skies reflecting world state
- **Fog of war** — zones reveal as you unlock them
- **City life** — agents wander streets, windows light up at night, smoke rises
- **VFX system** — XP fountains, zone glows, lightning, aurora effects
- **5 themes** — Cyber Noir, Solar Flare, Arctic Void, Forest Deep, Blood Moon
- **Thought bubbles** — agents surface context-aware thoughts
- **Celebration system** — confetti, level-ups, quest completions

---

## Tech Stack

```
claude-world/
├── electron/           # Main process (Node.js)
│   ├── main.js         # App entry, window, menu
│   ├── ipc-handlers.js # All IPC handlers (60+ endpoints)
│   ├── preload.js      # contextBridge API exposure
│   ├── key-store.js    # safeStorage encrypted keys
│   └── auto-updater.js # update.electronjs.org auto-updates
│
├── src/
│   ├── renderer/       # PixiJS isometric engine
│   │   ├── app.js      # Renderer entry, PixiJS init
│   │   ├── tiles.js    # Isometric tile grid
│   │   ├── buildings.js # Zone buildings + progress
│   │   ├── camera.js   # Pan/zoom camera
│   │   ├── fog.js      # Fog of war
│   │   ├── daynight.js # Day/night cycle
│   │   ├── weather.js  # Weather system
│   │   ├── vfx.js      # Visual effects (8 types)
│   │   ├── city-life.js # Ambient city animation
│   │   └── index.html  # Boot sequence (18 steps)
│   │
│   ├── zones/          # Each zone = a JS + CSS file
│   │   └── *.js + *.css
│   │
│   ├── systems/        # Cross-cutting systems
│   │   ├── dispatch.js      # AI task runner (Claude + OpenAI)
│   │   ├── world-state.js   # Reactive world state
│   │   ├── themes.js        # 5 color themes
│   │   ├── audio.js         # Web Audio API synthesis
│   │   ├── celebrations.js  # Confetti + XP floaters
│   │   ├── agent-personalities.js # Named agents + moods
│   │   ├── onboarding-cinema.js   # Cinematic intro
│   │   ├── agent-relationships.js # Agent social graph
│   │   ├── morning-briefing.js    # Daily digest
│   │   ├── quests.js        # Quest system
│   │   └── reputation.js    # XP + reputation engine
│   │
│   └── ui/             # Overlay UI (zero frameworks)
│       ├── hud.js       # HUD (avatar, resources, clock)
│       ├── panels.js    # Zone panel router
│       ├── command-palette.js # Cmd+K AI command palette
│       ├── thought-bubbles.js # Agent thought display
│       ├── theme-picker.js    # Live theme switcher
│       └── ...
│
├── landing/            # Product landing page (zero deps)
│   ├── index.html
│   └── style.css
│
└── build/              # Packaging assets
    ├── icon.svg
    ├── dmg-background.svg
    └── entitlements.mac.plist
```

**Database:** SQLite via `better-sqlite3` — WAL mode, FTS5 full-text search, 13 migrations covering all zones.

**AI:** `@anthropic-ai/sdk` (Claude) + `openai` (GPT-4/Gemini) — dual provider, streaming responses.

**UI:** Zero frontend frameworks — vanilla ES modules, CSS custom properties, glass morphism.

---

## Getting Started

### Prerequisites

- **macOS** (Monterey 12+ recommended)
- **Node.js** 18+
- **API keys**: Anthropic and/or OpenAI

### Installation

```bash
git clone https://github.com/sboghossian/Claude-World.git
cd claude-world
npm install
```

### Running in Development

```bash
npm start
```

Open DevTools automatically:
```bash
NODE_ENV=development npm start
```

### First Launch

On first launch, the onboarding system walks you through:
1. Naming your world
2. Choosing a template (Startup / Developer / Freelancer)
3. Connecting your first API key
4. Watching the cinematic intro as your city comes to life

### API Keys

Keys are stored encrypted via Electron's `safeStorage`. Enter them in **Connector Docks** zone → API Keys tab. No keys are ever sent anywhere except the respective AI provider APIs.

Supported providers:
- Anthropic (Claude 3.5 Sonnet, Haiku)
- OpenAI (GPT-4o, GPT-4o mini)
- Google (Gemini 1.5 Pro) — via OpenAI-compatible endpoint

---

## Building for Distribution

### macOS DMG

```bash
# First, generate the .icns icon
cd build && ./generate-icons.sh  # or see build/README.md for manual steps

# Build the DMG (universal: x64 + arm64)
npm run build:dmg
```

Output: `dist/Claude World-0.1.0-universal.dmg`

The app is code-signed and notarized-ready. Set `CSC_LINK` and `CSC_KEY_PASSWORD` env vars for signing.

---

## Contributing

Claude World is open source and we'd love your help! Here's how to contribute:

### Ways to Contribute

**New Zones** — Each zone lives in `src/zones/name.js` + `src/zones/name.css`. A zone is:
```js
export class MyZone {
  render() {
    const el = document.createElement('div');
    el.className = 'my-zone';
    // build your UI here
    return el;
  }
  async init(worldId) {
    // load data via window.api.db.*
  }
}
```
Then wire it into `src/ui/panels.js` (routing), `electron/ipc-handlers.js` (IPC), and `electron/preload.js` (API bridge).

**Visual improvements** — `src/renderer/` is the PixiJS engine. Great targets: new building types, agent sprites, particle effects, zone-specific animations.

**AI features** — `src/systems/dispatch.js` orchestrates AI calls. Add new tools, streaming modes, or providers.

**Bug fixes** — Check [Issues](https://github.com/sboghossian/Claude-World/issues) for open bugs.

### Development Guidelines

- **No frontend frameworks** — vanilla ES modules only. Keep the zero-dependency renderer philosophy.
- **Zone pattern** — each zone is self-contained (JS + CSS). It fetches its own data, manages its own state.
- **IPC pattern** — renderer never touches Node.js directly. All main-process work goes through `window.api.db.*` via contextBridge.
- **Database** — add migrations in `electron/migrations/` as `NNN_name.sql`. Never modify existing migrations.
- **Styling** — use `--cw-*` CSS variables for colors. See `src/ui/variables.css` for the full token set.

### Pull Request Process

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-zone
# Fork first: https://github.com/sboghossian/Claude-World/fork`
3. Make your changes
4. Test with `npm start`
5. Open a PR with a screenshot or demo GIF

### Reporting Issues

Please include:
- macOS version
- Node.js version
- Steps to reproduce
- Console errors (CMD+OPTION+I in the app with `NODE_ENV=development`)

---

## Roadmap

- [ ] Windows + Linux support (remove macOS-only APIs)
- [ ] Agent memory persistence across sessions
- [ ] Zone marketplace (community zones as npm packages)
- [ ] Multiplayer worlds (shared city, multiple users)
- [ ] Mobile companion app
- [ ] Plugin API for third-party zones
- [ ] Voice commands ("Hey Claude, dispatch a task")
- [ ] Streaming task visualization in real-time

---

## License

MIT — see [LICENSE](LICENSE)

---

## Credits

Built with:
- [Electron](https://www.electronjs.org/) — Desktop shell
- [PixiJS](https://pixijs.com/) — WebGL renderer
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-node) — Claude AI

Made with ❤️ and a lot of Claude.
