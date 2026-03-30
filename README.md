# Claude World 🏙️

> An AI-native OS visualized as a living, breathing isometric city — built with Electron, PixiJS, and Claude.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-v41-47848F?logo=electron)](https://www.electronjs.org/)
[![PixiJS](https://img.shields.io/badge/PixiJS-v8-e91e8c)](https://pixijs.com/)

![Claude World Screenshot](build/screenshot-placeholder.png)

## What is Claude World?

Claude World is a **Mac desktop app** where your AI agents live inside an isometric city. Every workflow, task, and system becomes a zone you can see, click, and interact with. The city grows as you work — buildings rise, agents wander the streets, zones unlock, and the world evolves based on your activity.

It's not a chat interface. It's not a dashboard. It's a **place** your AI agents actually inhabit.

### The City Zones (45+)

| Zone                     | Color    | Purpose                                               |
| ------------------------ | -------- | ----------------------------------------------------- |
| **Dispatch HQ**          | Cyan     | Run AI tasks — single or multi-step agent dispatch    |
| **Brain Library**        | Purple   | Memory, knowledge, long-term storage                  |
| **Skills Academy**       | Amber    | Build and train custom skills                         |
| **Legal Tower**          | Gold     | AI-drafted legal docs, contracts, NDAs                |
| **The Council**          | Multi    | Multi-model debates (Claude vs GPT-4 vs Gemini)       |
| **The Archive**          | Blue     | World snapshots and experiments                       |
| **R&D Lab**              | Teal     | Long-horizon research and experimentation             |
| **Identity Panel**       | Lavender | World identity, reputation, XP system                 |
| **Sales District**       | Emerald  | Lead tracking and AI sales workflows                  |
| **Marketing Plaza**      | Purple   | Content pipeline and campaign management              |
| **The Exchange**         | Orange   | API integrations and webhook management               |
| **The Market**           | Pink     | Install community tools and extensions                |
| **The Airport**          | Sky      | Deploy agents to external environments                |
| **Globe Room**           | Indigo   | Global research and intelligence                      |
| **Broadcast Tower**      | Red      | Channels and broadcast messaging                      |
| **World Versions**       | Violet   | Version control for your entire world                 |
| **Mission Control**      | Green    | Command center — terminal + analytics                 |
| **Treasury**             | Gold     | Budget tracking and cost management                   |
| **Chat Rooms**           | Blue     | Agent communication and logs                          |
| **Connector Docks**      | Teal     | External API connections                              |
| **Minion Tunnels**       | Gray     | Background automation pipelines                       |
| **Memory Vault**         | Purple   | Persistent agent memory store                         |
| **Analytics Dashboard**  | Blue     | Real-time metrics, charts, and world statistics       |
| **Settings**             | Slate    | App configuration, preferences, API keys              |
| **Reports**              | Indigo   | Generate and export structured reports                |
| **Timeline**             | Amber    | Chronological view of all world activity              |
| **Home Dashboard**       | White    | At-a-glance overview — recent activity, quick actions |
| **Kanban Board**         | Green    | Drag-and-drop task management with columns            |
| **Knowledge Graph**      | Violet   | Visual map of connected concepts and entities         |
| **Automation Builder**   | Orange   | No-code workflow builder with triggers and actions    |
| **Skill Trees**          | Emerald  | Visual progression trees for agent capabilities       |
| **Calendar**             | Blue     | Schedule tasks, deadlines, and agent activities       |
| **Sharing / Export**     | Teal     | Share snapshots, export data, publish reports         |
| **Achievements Gallery** | Gold     | Track milestones, badges, and world accomplishments   |
| **Plugin Store**         | Violet   | Browse, install, and manage community plugins         |
| **Leaderboard**          | Amber    | Rankings, streaks, and competitive agent stats        |
| **Prompt Library**       | Cyan     | Curated and custom prompt templates                   |
| **Conversation History** | Blue     | Searchable log of all AI conversations                |
| **Agent Profiles**       | Lavender | Detailed agent bios, skills, and configuration        |
| **World Map**            | Green    | Bird's-eye view of all zones and connections          |
| **MCP Hub**              | Teal     | Model Context Protocol server management              |
| **Daily Digest**         | Orange   | Morning briefing with overnight activity summary      |
| **Backups**              | Slate    | Auto-backup management and restore points             |

### Visual Systems

- **Isometric city** rendered in WebGL via PixiJS v8 — 40×40 tile grid
- **Day/night cycle** — the city transforms at dusk and dawn
- **Weather effects** — rain, snow, fog, aurora, lightning — 5 dynamic weather types
- **Particle system** — 10 presets (sparks, embers, fireflies, snow, rain, smoke, confetti, bubbles, stars, dust)
- **Data flow visualization** — animated connections between zones showing real-time data movement
- **Agent sprites** — named agents walk the city streets, enter buildings, carry out tasks
- **Fog of war** — zones reveal as you unlock them
- **City life** — windows light up at night, smoke rises, ambient animation
- **VFX system** — XP fountains, zone glows, lightning, aurora effects
- **5 themes** — Cyber Noir, Solar Flare, Arctic Void, Forest Deep, Blood Moon
- **Thought bubbles** — agents surface context-aware thoughts
- **Celebration system** — confetti, level-ups, quest completions
- **Focus / Zen mode** — dim the city, hide UI, spotlight the active zone
- **Workspace** — multi-panel tabs with split view layout
- **Sound effects** — 12 audio cues for actions, notifications, and achievements
- **Command history** — full undo/redo stack for world actions
- **Backup system** — automatic world backups with one-click restore
- **Quality manager** — adaptive performance settings based on hardware
- **Plugin API** — third-party zone and extension support

---

## Tech Stack

```
claude-world/                    # 99K+ lines · 191 files
├── electron/                    # Main process (Node.js)
│   ├── main.js                  # App entry, window, menu
│   ├── ipc-handlers.js          # All IPC handlers (100+ endpoints)
│   ├── preload.js               # contextBridge API exposure
│   ├── key-store.js             # safeStorage encrypted keys
│   └── auto-updater.js          # update.electronjs.org auto-updates
│
├── src/
│   ├── db/                      # Database layer
│   │   ├── database.js          # SQLite connection + migrations
│   │   └── seed.js              # Initial world data
│   │
│   ├── renderer/                # PixiJS isometric engine (19 modules)
│   │   ├── app.js               # Renderer entry, PixiJS init
│   │   ├── tiles.js             # Isometric tile grid
│   │   ├── buildings.js         # Zone buildings + progress
│   │   ├── camera.js            # Pan/zoom camera
│   │   ├── fog.js               # Fog of war
│   │   ├── daynight.js          # Day/night cycle
│   │   ├── weather.js           # Weather state machine
│   │   ├── weather-effects.js   # Rain, snow, fog, aurora, lightning
│   │   ├── particles.js         # Particle system (10 presets)
│   │   ├── data-flows.js        # Animated data flow between zones
│   │   ├── agent-sprites.js     # Agent walking sprites
│   │   ├── agents.js            # Agent placement + behavior
│   │   ├── vfx.js               # Visual effects (8 types)
│   │   ├── city-life.js         # Ambient city animation
│   │   ├── zones.js             # Zone rendering layer
│   │   ├── constants.js         # Shared constants
│   │   └── drag-drop.js         # Drag-and-drop support
│   │
│   ├── zones/                   # 45+ zones — each a JS + CSS pair
│   │   ├── dispatch.js/css      # Dispatch HQ
│   │   ├── kanban.js/css        # Kanban Board
│   │   ├── calendar.js/css      # Calendar
│   │   ├── knowledge-graph.js/css # Knowledge Graph
│   │   ├── automation-builder.js/css # Automation Builder
│   │   ├── analytics.js/css     # Analytics Dashboard
│   │   ├── home-dashboard.js/css # Home Dashboard
│   │   ├── skill-tree.js/css    # Skill Trees
│   │   ├── timeline.js/css      # Timeline
│   │   ├── reports.js/css       # Reports
│   │   ├── settings.js/css      # Settings
│   │   ├── sharing.js/css       # Sharing / Export
│   │   └── ... (21 more)        # All original zones
│   │
│   ├── systems/                 # Cross-cutting systems (24 modules)
│   │   ├── dispatch.js          # AI task runner (Claude + OpenAI)
│   │   ├── world-state.js       # Reactive world state
│   │   ├── themes.js            # 5 color themes
│   │   ├── audio.js             # Web Audio API synthesis
│   │   ├── celebrations.js      # Confetti + XP floaters
│   │   ├── focus-mode.js/css    # Focus / Zen mode
│   │   ├── achievements.js      # Achievement tracking
│   │   ├── agent-personalities.js # Named agents + moods
│   │   ├── agent-relationships.js # Agent social graph
│   │   ├── onboarding-cinema.js # Cinematic intro
│   │   ├── morning-briefing.js  # Daily digest
│   │   ├── quests.js            # Quest system
│   │   ├── reputation.js        # XP + reputation engine
│   │   ├── global-search.js     # Cross-zone search
│   │   ├── zone-ambience.js     # Per-zone audio ambience
│   │   ├── quality.js           # Quality metrics
│   │   ├── tutorial.js          # Interactive tutorial
│   │   ├── sanitize.js          # Input sanitization
│   │   ├── notify.js            # Notification system
│   │   └── providers/           # AI provider adapters
│   │       ├── base.js
│   │       ├── anthropic.js
│   │       └── openai.js
│   │
│   └── ui/                      # Overlay UI (zero frameworks, 30+ modules)
│       ├── hud.js/css           # HUD (avatar, resources, clock)
│       ├── panels.js/css        # Zone panel router
│       ├── command-palette.js/css # Cmd+K AI command palette
│       ├── shortcuts-overlay.js/css # Keyboard shortcuts overlay
│       ├── perf-monitor.js/css  # Performance monitor
│       ├── minimap.js/css       # City minimap
│       ├── status-bar.js/css    # Bottom status bar
│       ├── notification-center.js/css # Notification center
│       ├── context-menu.js/css  # Right-click context menu
│       ├── achievements-panel.js/css # Achievements display
│       ├── thought-bubbles.js/css # Agent thought display
│       ├── theme-picker.js      # Live theme switcher
│       └── ... (18 more)
│
├── landing/                     # Product landing page (zero deps)
│   ├── index.html
│   └── style.css
│
└── build/                       # Packaging assets
    ├── icon.svg
    ├── dmg-background.svg
    └── entitlements.mac.plist
```

**Database:** SQLite via `better-sqlite3` — WAL mode, FTS5 full-text search, migrations covering all zones.

**AI:** `@anthropic-ai/sdk` (Claude) + `openai` (GPT-4/Gemini) — dual provider, streaming responses, provider abstraction layer.

**UI:** Zero frontend frameworks — vanilla ES modules, CSS custom properties, glass morphism.

---

## Keyboard Shortcuts

| Shortcut      | Action                                                    |
| ------------- | --------------------------------------------------------- |
| `Cmd+K`       | Command Palette — search zones, run tasks, jump anywhere  |
| `Cmd+Shift+F` | Focus Mode — dim the city, hide UI, spotlight active zone |
| `Cmd+Shift+P` | Performance Monitor — FPS, memory, render stats           |
| `Cmd+\`       | Split View — open a second panel side-by-side             |
| `Cmd+W`       | Close Tab — close the active workspace tab                |
| `Cmd+Z`       | Undo — revert the last world action                       |
| `Cmd+Shift+Z` | Redo — re-apply the last undone action                    |
| `Cmd+Shift+H` | Command History — browse and replay past commands         |
| `?`           | Shortcuts Overlay — show all available shortcuts          |
| `V`           | Toggle Data Flows — show/hide animated data connections   |
| `1`–`9`       | Zone Quick Jump — jump directly to your pinned zones      |

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

- Anthropic (Claude Sonnet 4, Claude Haiku 4)
- OpenAI (GPT-4o, GPT-4o mini)
- Google (Gemini 2.0 Flash) — via OpenAI-compatible endpoint

---

## Building for Distribution

### macOS DMG

```bash
npm run build:icons  # Generate .icns from SVG
npm run build:dmg    # Build the DMG installer (universal: x64 + arm64)
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
    const el = document.createElement("div");
    el.className = "my-zone";
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
- **Database** — add migrations in `src/db/migrations/` as `NNN_name.sql`. Never modify existing migrations.
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

### Built

- [x] 45+ fully functional zones (Kanban, Calendar, Knowledge Graph, Automation Builder, Skill Trees, Analytics, Plugin Store, MCP Hub, and more)
- [x] Weather effects system (rain, snow, fog, aurora, lightning)
- [x] Particle system with 10 presets
- [x] Data flow visualization between zones
- [x] Agent sprites walking the city
- [x] Focus / Zen mode
- [x] Agent memory persistence across sessions (Memory Vault)
- [x] Streaming task visualization in real-time (Task Stream)
- [x] Achievements and milestone tracking
- [x] Sharing and export system
- [x] Performance monitor and keyboard shortcuts overlay
- [x] Global search across all zones
- [x] Workspace system with multi-panel tabs and split view
- [x] Sound effects (12 audio cues)
- [x] Command history with undo/redo
- [x] Backup system with auto-backup and restore
- [x] Quality manager for adaptive performance
- [x] Plugin API for third-party extensions

### Up Next

- [ ] Windows + Linux support (remove macOS-only APIs)
- [ ] Zone marketplace (community zones as npm packages)
- [ ] Multiplayer worlds (shared city, multiple users)
- [ ] Mobile companion app
- [ ] Voice commands ("Hey Claude, dispatch a task")

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
