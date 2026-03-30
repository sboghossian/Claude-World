"use strict";

/**
 * @fileoverview Seed functions for initialising a new Claude World.
 * Each function takes a Database instance (from database.js) and a worldId,
 * then inserts the canonical starting data for zones, agents, and quests.
 */

// ---------------------------------------------------------------------------
// Zone definitions
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, zone_type: string, name: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number, unlocked: 0|1}>} */
const ZONE_DEFS = [
  {
    id: "dispatch_tower",
    zone_type: "dispatch_tower",
    name: "Dispatch Tower",
    grid_x: 20,
    grid_y: 20,
    grid_w: 4,
    grid_h: 4,
    unlocked: 1,
  },
  {
    id: "brain_library",
    zone_type: "brain_library",
    name: "Brain Library",
    grid_x: 16,
    grid_y: 20,
    grid_w: 3,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "skills_academy",
    zone_type: "skills_academy",
    name: "Skills Academy",
    grid_x: 14,
    grid_y: 24,
    grid_w: 3,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "memory_vault",
    zone_type: "memory_vault",
    name: "Memory Vault",
    grid_x: 24,
    grid_y: 16,
    grid_w: 3,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "connector_docks",
    zone_type: "connector_docks",
    name: "Connector Docks",
    grid_x: 8,
    grid_y: 30,
    grid_w: 4,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "chat_rooms",
    zone_type: "chat_rooms",
    name: "Chat Rooms",
    grid_x: 14,
    grid_y: 16,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "treasury",
    zone_type: "treasury",
    name: "Treasury",
    grid_x: 28,
    grid_y: 20,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "minion_tunnels",
    zone_type: "minion_tunnels",
    name: "Minion Tunnels",
    grid_x: 24,
    grid_y: 24,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "legal_tower",
    zone_type: "legal_tower",
    name: "Legal Tower",
    grid_x: 16,
    grid_y: 12,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "sales_district",
    zone_type: "sales_district",
    name: "Sales District",
    grid_x: 28,
    grid_y: 26,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "marketing_plaza",
    zone_type: "marketing_plaza",
    name: "Marketing Plaza",
    grid_x: 22,
    grid_y: 30,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_exchange",
    zone_type: "the_exchange",
    name: "The Exchange",
    grid_x: 32,
    grid_y: 18,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_market",
    zone_type: "the_market",
    name: "The Market",
    grid_x: 32,
    grid_y: 24,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_council",
    zone_type: "the_council",
    name: "The Council",
    grid_x: 10,
    grid_y: 14,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "rd_lab",
    zone_type: "rd_lab",
    name: "R&D Lab",
    grid_x: 10,
    grid_y: 20,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_archive",
    zone_type: "the_archive",
    name: "The Archive",
    grid_x: 10,
    grid_y: 26,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "airport",
    zone_type: "airport",
    name: "Airport",
    grid_x: 34,
    grid_y: 10,
    grid_w: 4,
    grid_h: 4,
    unlocked: 0,
  },
  {
    id: "globe_room",
    zone_type: "globe_room",
    name: "Globe Room",
    grid_x: 28,
    grid_y: 10,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "broadcast_tower",
    zone_type: "broadcast_tower",
    name: "Broadcast Tower",
    grid_x: 20,
    grid_y: 8,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
];

// ---------------------------------------------------------------------------
// Agent definitions (for the 5 unlocked starter zones)
// ---------------------------------------------------------------------------

/** @type {Array<{name: string, zone_id: string, role: string, personality: string, sprite_set: string, system_prompt: string}>} */
const AGENT_DEFS = [
  {
    name: "Commander",
    zone_id: "dispatch_tower",
    role: "dispatcher",
    personality: "strategic",
    sprite_set: "commander",
    system_prompt:
      "You are the Commander of the Dispatch Tower. You coordinate all task routing " +
      "across the city, prioritise workloads, and ensure every request reaches the " +
      "right agent. You are decisive, strategic, and always focused on throughput.",
  },
  {
    name: "Librarian",
    zone_id: "brain_library",
    role: "researcher",
    personality: "meticulous",
    sprite_set: "librarian",
    system_prompt:
      "You are the Librarian of the Brain Library. You catalogue knowledge, perform " +
      "deep research, and synthesise information from multiple sources. You are " +
      "meticulous, curious, and value accuracy above speed.",
  },
  {
    name: "Teacher",
    zone_id: "skills_academy",
    role: "trainer",
    personality: "patient",
    sprite_set: "teacher",
    system_prompt:
      "You are the Teacher at the Skills Academy. You design prompt templates, " +
      "train other agents on new skills, and refine techniques through practice. " +
      "You are patient, encouraging, and believe every problem is a learning opportunity.",
  },
  {
    name: "Archivist",
    zone_id: "memory_vault",
    role: "memory_keeper",
    personality: "thoughtful",
    sprite_set: "archivist",
    system_prompt:
      "You are the Archivist of the Memory Vault. You preserve conversation history, " +
      "organise long-term memories, and surface relevant context when needed. You are " +
      "thoughtful, precise, and have an excellent recall for detail.",
  },
  {
    name: "Harbor Master",
    zone_id: "connector_docks",
    role: "integrator",
    personality: "practical",
    sprite_set: "harbor_master",
    system_prompt:
      "You are the Harbor Master at the Connector Docks. You manage API connections, " +
      "validate credentials, and ensure data flows smoothly between external services " +
      "and the city. You are practical, reliable, and security-conscious.",
  },
];

// ---------------------------------------------------------------------------
// Quest chain definitions
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, chain_id: string, title: string, description: string, status: string, sort_order: number, reward_xp: number, trigger_type: string, trigger_value: string}>} */
const QUEST_DEFS = [
  {
    id: "q_first_contact",
    chain_id: "onboarding",
    title: "First Contact",
    description: "Enter the Brain Library and meet the Librarian.",
    status: "active",
    sort_order: 0,
    reward_xp: 50,
    trigger_type: "zone_enter",
    trigger_value: "brain_library",
  },
  {
    id: "q_open_docks",
    chain_id: "onboarding",
    title: "Open the Docks",
    description: "Connect your first API key at the Connector Docks.",
    status: "locked",
    sort_order: 1,
    reward_xp: 80,
    trigger_type: "api_connect",
    trigger_value: "any",
  },
  {
    id: "q_dispatch_task",
    chain_id: "onboarding",
    title: "Dispatch a Task",
    description: "Send your first AI task from the Dispatch Tower.",
    status: "locked",
    sort_order: 2,
    reward_xp: 120,
    trigger_type: "task_complete",
    trigger_value: "any",
  },
  {
    id: "q_enroll_school",
    chain_id: "onboarding",
    title: "Enroll in School",
    description: "Create your first skill at the Skills Academy.",
    status: "locked",
    sort_order: 3,
    reward_xp: 100,
    trigger_type: "skill_create",
    trigger_value: "any",
  },
  {
    id: "q_deploy_minion",
    chain_id: "onboarding",
    title: "Deploy a Minion",
    description: "Schedule an automated task in the Minion Tunnels.",
    status: "locked",
    sort_order: 4,
    reward_xp: 150,
    trigger_type: "task_schedule",
    trigger_value: "any",
  },
  {
    id: "q_build_treasury",
    chain_id: "onboarding",
    title: "Build the Treasury",
    description: "Set a spending budget in the Treasury.",
    status: "locked",
    sort_order: 5,
    reward_xp: 100,
    trigger_type: "budget_set",
    trigger_value: "any",
  },
  {
    id: "q_hire_team",
    chain_id: "onboarding",
    title: "Hire your Team",
    description: "Connect three different API providers.",
    status: "locked",
    sort_order: 6,
    reward_xp: 200,
    trigger_type: "provider_count",
    trigger_value: "3",
  },
  {
    id: "q_go_to_market",
    chain_id: "onboarding",
    title: "Go to Market",
    description: "Publish a skill to The Market.",
    status: "locked",
    sort_order: 7,
    reward_xp: 300,
    trigger_type: "skill_publish",
    trigger_value: "any",
  },
];

// ---------------------------------------------------------------------------
// Template → extra zone unlocks
// ---------------------------------------------------------------------------

/** @type {Record<string, string[]>} */
const TEMPLATE_UNLOCKS = {
  startup_founder: ["legal_tower", "sales_district", "treasury"],
  freelancer: ["chat_rooms"],
  developer: ["minion_tunnels", "the_exchange"],
};

// ---------------------------------------------------------------------------
// Template-specific starter tasks (5 per template, all completed with mock responses)
// ---------------------------------------------------------------------------

/** @type {Record<string, Array<{prompt: string, response: string, zone_id: string}>>} */
const TEMPLATE_TASKS = {
  startup_founder: [
    {
      prompt:
        "Summarize the key points of this Y Combinator essay on startup fundraising",
      response:
        "Here are the key points:\n\n1. **Raise money only when you need it** — Fundraising is a distraction from building.\n2. **Get the first commitment quickly** — Momentum matters; once one investor says yes, others follow.\n3. **Stay lean early** — Lower burn rate gives you more runway and negotiating power.\n4. **Focus on traction** — Revenue or user growth is the strongest signal to investors.\n5. **Know your numbers cold** — CAC, LTV, MRR, and runway should be at your fingertips.",
      zone_id: "brain_library",
    },
    {
      prompt:
        "Write a professional email to a potential investor requesting a meeting",
      response:
        "Subject: Quick intro — [Your Company] Series Seed\n\nHi Sarah,\n\nI'm the founder of [Your Company], where we're building AI-powered workflow automation for SMBs. We've grown to $25K MRR in 4 months with zero paid acquisition.\n\nI'd love 20 minutes to share what we're working on and get your perspective. Would next Tuesday or Thursday work?\n\nBest,\n[Your Name]",
      zone_id: "dispatch_tower",
    },
    {
      prompt: "Draft a terms of service outline for our SaaS product",
      response:
        "**Terms of Service — Outline**\n\n1. **Acceptance of Terms** — By using the service, users agree to these terms.\n2. **Account Registration** — Users must provide accurate info; one account per person.\n3. **Subscription & Billing** — Monthly/annual plans; auto-renewal; refund policy.\n4. **Acceptable Use** — No illegal activity, no abuse, no reverse engineering.\n5. **Data & Privacy** — Reference privacy policy; GDPR/CCPA compliance.\n6. **Intellectual Property** — Users own their data; company owns the platform.\n7. **Limitation of Liability** — Service provided as-is; cap on damages.\n8. **Termination** — Either party can terminate; data export window.\n9. **Governing Law** — Jurisdiction and dispute resolution.",
      zone_id: "brain_library",
    },
    {
      prompt: "Brainstorm 10 ideas for our product launch campaign",
      response:
        '1. **Launch on Product Hunt** with a polished video demo\n2. **Founder story thread** on Twitter/X showing the 0-to-launch journey\n3. **Early-bird pricing** (40% off for first 100 users)\n4. **Partner cross-promotion** with complementary SaaS tools\n5. **Live demo webinar** with Q&A and a signup incentive\n6. **"Build in public" recap** — share metrics, lessons, and behind-the-scenes\n7. **Influencer seeding** — give 10 micro-influencers free accounts\n8. **Launch-day AMA** on relevant subreddits\n9. **Customer spotlight** — pre-launch beta user success story\n10. **Referral bonus** — give both referrer and referee an extra free month',
      zone_id: "dispatch_tower",
    },
    {
      prompt: "Create a project plan for launching our MVP in 6 weeks",
      response:
        "**6-Week MVP Launch Plan**\n\n**Week 1-2: Core Build**\n- Finalize feature scope (auth, dashboard, core workflow)\n- Set up CI/CD pipeline\n- Design system + key screens\n\n**Week 3: Integration**\n- Payment integration (Stripe)\n- Email notifications\n- API documentation\n\n**Week 4: Testing & Polish**\n- Internal QA + bug fixes\n- Performance optimization\n- Onboarding flow\n\n**Week 5: Beta**\n- Invite 20 beta users\n- Collect feedback daily\n- Iterate on top 3 pain points\n\n**Week 6: Launch**\n- Prepare launch assets (Product Hunt, landing page, social)\n- Final bug sweep\n- Launch day: monitor metrics, respond to feedback",
      zone_id: "dispatch_tower",
    },
  ],
  developer: [
    {
      prompt:
        "Summarize the key points of this article on microservices vs monoliths",
      response:
        "Here are the key points:\n\n1. **Start monolith, extract later** — Premature microservices add complexity without benefit.\n2. **Team boundaries drive service boundaries** — Conway's Law applies; split services along team ownership.\n3. **Shared databases are the #1 anti-pattern** — Each service should own its data.\n4. **Observability is non-negotiable** — Distributed tracing, structured logging, and health checks are table stakes.\n5. **Network is unreliable** — Design for retries, timeouts, circuit breakers, and graceful degradation.",
      zone_id: "brain_library",
    },
    {
      prompt:
        "Debug this JavaScript error: TypeError: Cannot read properties of undefined (reading 'map')",
      response:
        "**Root cause:** You're calling `.map()` on a variable that is `undefined` at the time of execution.\n\n**Common scenarios:**\n1. API response hasn't loaded yet — `data.items.map(...)` before `data` is set\n2. Optional chaining missing — use `data?.items?.map(...)` \n3. Default value missing — initialize with `const [items, setItems] = useState([])`\n\n**Fix:**\n```js\n// Before (broken)\nconst list = data.items.map(item => item.name);\n\n// After (safe)\nconst list = (data?.items ?? []).map(item => item.name);\n```\n\n**Prevention:** Enable the `no-unsafe-optional-chaining` ESLint rule and always provide default values for arrays.",
      zone_id: "dispatch_tower",
    },
    {
      prompt:
        "Write a professional email to the team about the upcoming API migration",
      response:
        "Subject: API v2 Migration — Timeline & Action Items\n\nHi team,\n\nWe're migrating from REST API v1 to v2 starting next Monday. Here's what you need to know:\n\n**Timeline:**\n- Mon-Wed: v2 endpoints go live alongside v1\n- Thu-Fri: Integration testing window\n- Following Monday: v1 deprecated (30-day sunset)\n\n**Action items:**\n1. Update your service clients to point to `/api/v2/*`\n2. Replace `X-Auth-Token` header with `Authorization: Bearer`\n3. Run the migration test suite: `npm run test:v2-compat`\n\nI'll hold office hours Tuesday 2-4pm for questions. Docs are in the wiki under \"API v2 Migration Guide.\"\n\nThanks,\n[Your Name]",
      zone_id: "dispatch_tower",
    },
    {
      prompt: "Brainstorm 10 ideas for improving our CI/CD pipeline",
      response:
        "1. **Parallel test execution** — split test suites across workers\n2. **Docker layer caching** — cache base images and dependency layers\n3. **Preview environments** — spin up per-PR preview deploys\n4. **Flaky test quarantine** — auto-skip and report intermittent failures\n5. **Build time dashboard** — track and alert on build duration regressions\n6. **Dependency caching** — cache `node_modules` / pip wheels between runs\n7. **Canary deploys** — route 5% traffic to new version before full rollout\n8. **Security scanning** — add SAST/DAST in the pipeline\n9. **Commit-message linting** — enforce conventional commits for changelogs\n10. **Rollback automation** — one-click revert to last known good deploy",
      zone_id: "dispatch_tower",
    },
    {
      prompt: "Create a project plan for refactoring our authentication system",
      response:
        "**Auth Refactor Plan — 4 Sprints**\n\n**Sprint 1: Audit & Design**\n- Map all auth flows (login, signup, OAuth, API keys)\n- Identify tech debt (session handling, token rotation)\n- Design new architecture (JWT + refresh tokens, RBAC)\n\n**Sprint 2: Core Implementation**\n- Implement token service (issue, refresh, revoke)\n- Build RBAC middleware\n- Write migration scripts for existing sessions\n\n**Sprint 3: Integration & Testing**\n- Update all API routes to use new auth middleware\n- Add integration tests for every auth flow\n- Penetration testing (OWASP top 10)\n\n**Sprint 4: Migration & Cleanup**\n- Feature-flag rollout to 10% → 50% → 100%\n- Remove legacy auth code\n- Update API docs and developer guide",
      zone_id: "dispatch_tower",
    },
  ],
  freelancer: [
    {
      prompt:
        "Summarize the key points of this article on freelance pricing strategies",
      response:
        "Here are the key points:\n\n1. **Value-based pricing beats hourly** — Charge for the outcome, not the time spent.\n2. **Package your services** — Offer 3 tiers (Basic, Standard, Premium) to anchor pricing.\n3. **Raise rates with every new client** — Your last rate is your floor, not your ceiling.\n4. **Scope creep kills margins** — Define deliverables precisely; charge for additions.\n5. **Show ROI in proposals** — Frame your fee against the revenue or savings you generate.",
      zone_id: "brain_library",
    },
    {
      prompt:
        "Write a professional email to a client requesting project feedback",
      response:
        "Subject: Quick check-in — How's the new website working for you?\n\nHi Alex,\n\nIt's been two weeks since we launched the redesign and I'd love to hear how things are going. A few quick questions:\n\n1. Are you seeing the traffic improvements we discussed?\n2. Is the CMS easy to use for your team?\n3. Anything you'd tweak or add?\n\nIf you're happy with the results, I'd really appreciate a short testimonial I could feature on my portfolio. No pressure at all.\n\nLooking forward to hearing from you!\n\nBest,\n[Your Name]",
      zone_id: "dispatch_tower",
    },
    {
      prompt:
        "Debug this CSS layout issue: flexbox items not wrapping on mobile",
      response:
        "**Root cause:** Missing `flex-wrap` property on the container.\n\n**Fix:**\n```css\n/* Before (broken) */\n.container {\n  display: flex;\n  gap: 1rem;\n}\n\n/* After (wraps on mobile) */\n.container {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 1rem;\n}\n\n.item {\n  flex: 1 1 300px; /* grow, shrink, min-width before wrapping */\n}\n```\n\n**Bonus tips:**\n- Use `min-width: 0` on flex children to prevent overflow\n- Consider `grid` with `auto-fit` for more control: `grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))`",
      zone_id: "dispatch_tower",
    },
    {
      prompt: "Brainstorm 10 ideas for growing my freelance client base",
      response:
        '1. **Niche down** — Become the go-to person for one industry (e.g., "Shopify for DTC brands")\n2. **Case study portfolio** — Show before/after results, not just screenshots\n3. **Referral incentive** — Offer existing clients a discount for referrals\n4. **Weekly LinkedIn post** — Share a tip, insight, or behind-the-scenes from a project\n5. **Cold outreach with value** — Audit a prospect\'s site and send 3 free suggestions\n6. **Subcontract network** — Partner with agencies who need overflow help\n7. **Productized service** — Offer a fixed-scope, fixed-price package (e.g., "5-page website in 2 weeks")\n8. **Teach a workshop** — Host a free webinar to demonstrate expertise\n9. **Open source contribution** — Build a plugin or tool that drives inbound leads\n10. **Testimonial engine** — Ask every happy client for a video testimonial within 48 hours of delivery',
      zone_id: "dispatch_tower",
    },
    {
      prompt:
        "Create a project plan for redesigning a client's e-commerce site",
      response:
        "**E-Commerce Redesign Plan — 5 Weeks**\n\n**Week 1: Discovery**\n- Stakeholder interviews + brand audit\n- Analytics review (top pages, drop-off points, conversion funnel)\n- Competitive analysis (3 competitors)\n\n**Week 2: Design**\n- Wireframes for key pages (home, PLP, PDP, cart, checkout)\n- Mobile-first responsive layouts\n- Client review + revision round\n\n**Week 3: Visual Design**\n- High-fidelity mockups with brand colors/typography\n- Component library (buttons, cards, forms)\n- Client sign-off\n\n**Week 4: Development**\n- Build responsive pages in Shopify/WooCommerce\n- Integrate payment and shipping\n- SEO setup (meta tags, schema, redirects)\n\n**Week 5: Launch**\n- QA across devices and browsers\n- Performance optimization (Core Web Vitals)\n- Launch + 48-hour monitoring",
      zone_id: "dispatch_tower",
    },
  ],
};

// ---------------------------------------------------------------------------
// Starter prompt templates
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, title: string, category: string, template: string, description: string, tags: string}>} */
const STARTER_PROMPTS = [
  {
    id: "prompt_summarize",
    title: "Summarize",
    category: "Research",
    template:
      "Summarize the following text in clear, concise bullet points:\n\n{{text}}",
    description: "Condense any text into key points",
    tags: '["summarize","research","reading"]',
  },
  {
    id: "prompt_email_draft",
    title: "Email Draft",
    category: "Writing",
    template:
      "Write a professional email to {{recipient}} about {{subject}}. Keep the tone friendly but professional. Include a clear call to action.",
    description: "Draft a professional email with recipient and subject",
    tags: '["email","writing","communication"]',
  },
  {
    id: "prompt_code_review",
    title: "Code Review",
    category: "Development",
    template:
      "Review the following code for bugs, performance issues, and best-practice violations. Suggest improvements with code examples:\n\n```\n{{code}}\n```",
    description: "Get a thorough code review with actionable suggestions",
    tags: '["code","review","development"]',
  },
];

// ---------------------------------------------------------------------------
// Zones that should start with partial build progress (0.25) per template
// ---------------------------------------------------------------------------

/** @type {Record<string, string[]>} */
const TEMPLATE_PARTIAL_ZONES = {
  startup_founder: ["dispatch_tower", "brain_library", "legal_tower"],
  developer: ["dispatch_tower", "brain_library", "minion_tunnels"],
  freelancer: ["dispatch_tower", "brain_library", "chat_rooms"],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed the 19 default zones for a newly-created world.
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to seed.
 * @returns {Array<{id: string, zone_type: string}>}  Inserted zone rows (id + type).
 */
function seedDefaultZones(db, worldId) {
  const insertZone = db.db.prepare(`
    INSERT INTO zones (id, world_id, zone_type, name, grid_x, grid_y, grid_w, grid_h, unlocked, build_progress, discovered, unlocked_at, discovered_at)
    VALUES (@id, @world_id, @zone_type, @name, @grid_x, @grid_y, @grid_w, @grid_h, @unlocked, @build_progress, @discovered, @unlocked_at, @discovered_at)
  `);

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const zones = [];
  for (const def of ZONE_DEFS) {
    const row = {
      id: def.id,
      world_id: worldId,
      zone_type: def.zone_type,
      name: def.name,
      grid_x: def.grid_x,
      grid_y: def.grid_y,
      grid_w: def.grid_w,
      grid_h: def.grid_h,
      unlocked: def.unlocked,
      build_progress: def.unlocked ? 1.0 : 0.0,
      discovered: def.unlocked ? 1 : 0,
      unlocked_at: def.unlocked ? now : null,
      discovered_at: def.unlocked ? now : null,
    };
    insertZone.run(row);
    zones.push({ id: def.id, zone_type: def.zone_type });
  }

  return zones;
}

/**
 * Seed the 5 starter agents, one for each unlocked zone.
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to seed.
 * @param {Array<{id: string, zone_type: string}>} zones  The zones previously created.
 * @returns {Array<{id: string, name: string}>}  Inserted agent rows.
 */
function seedDefaultAgents(db, worldId, zones) {
  const insertAgent = db.db.prepare(`
    INSERT INTO agents (world_id, zone_id, name, role, personality, sprite_set, system_prompt, tile_x, tile_y)
    VALUES (@world_id, @zone_id, @name, @role, @personality, @sprite_set, @system_prompt, @tile_x, @tile_y)
  `);

  const zoneMap = new Map(zones.map((z) => [z.id, z]));
  const agents = [];

  for (const def of AGENT_DEFS) {
    const zone = zoneMap.get(def.zone_id);
    if (!zone) continue;

    const info = insertAgent.run({
      world_id: worldId,
      zone_id: def.zone_id,
      name: def.name,
      role: def.role,
      personality: def.personality,
      sprite_set: def.sprite_set,
      system_prompt: def.system_prompt,
      tile_x: 1,
      tile_y: 1,
    });

    // better-sqlite3 does not return the generated id from DEFAULT, so we
    // retrieve the last inserted rowid and query back.
    const row = db.db
      .prepare("SELECT id FROM agents WHERE rowid = ?")
      .get(info.lastInsertRowid);

    agents.push({ id: row.id, name: def.name });
  }

  return agents;
}

/**
 * Seed the onboarding quest chain (8 quests, first one active).
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to seed.
 * @returns {void}
 */
function seedQuestChain(db, worldId) {
  const insertQuest = db.db.prepare(`
    INSERT INTO quests (id, world_id, chain_id, title, description, status, sort_order, reward_xp, trigger_type, trigger_value)
    VALUES (@id, @world_id, @chain_id, @title, @description, @status, @sort_order, @reward_xp, @trigger_type, @trigger_value)
  `);

  for (const def of QUEST_DEFS) {
    insertQuest.run({ ...def, world_id: worldId });
  }
}

/**
 * Unlock additional zones based on the chosen world template.
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to apply the template to.
 * @param {string|null|undefined} template  The template name (e.g. 'startup_founder').
 * @returns {void}
 */
function applyTemplate(db, worldId, template) {
  if (!template || !TEMPLATE_UNLOCKS[template]) return;

  // 1. Unlock extra zones for this template
  const unlockStmt = db.db.prepare(`
    UPDATE zones
    SET unlocked = 1,
        build_progress = 1.0,
        discovered = 1,
        unlocked_at = datetime('now'),
        discovered_at = datetime('now')
    WHERE world_id = ? AND id = ? AND unlocked = 0
  `);

  for (const zoneId of TEMPLATE_UNLOCKS[template]) {
    unlockStmt.run(worldId, zoneId);
  }

  // 2. Set partial build progress (0.25) on key zones so buildings look under construction
  const partialZones = TEMPLATE_PARTIAL_ZONES[template];
  if (partialZones) {
    const progressStmt = db.db.prepare(`
      UPDATE zones SET build_progress = 0.25
      WHERE world_id = ? AND id = ?
    `);
    for (const zoneId of partialZones) {
      progressStmt.run(worldId, zoneId);
    }
  }

  // 3. Seed starter tasks (completed, with mock responses) for this template
  const tasks = TEMPLATE_TASKS[template];
  if (tasks) {
    const insertTask = db.db.prepare(`
      INSERT INTO tasks (world_id, zone_id, provider, model, status, prompt, response, input_tokens, output_tokens, cost_usd, latency_ms, completed_at, metadata_json)
      VALUES (@world_id, @zone_id, @provider, @model, @status, @prompt, @response, @input_tokens, @output_tokens, @cost_usd, @latency_ms, datetime('now'), @metadata_json)
    `);

    for (const task of tasks) {
      insertTask.run({
        world_id: worldId,
        zone_id: task.zone_id,
        provider: "demo",
        model: "claude-3-haiku",
        status: "completed",
        prompt: task.prompt,
        response: task.response,
        input_tokens: 120 + Math.floor(Math.random() * 80),
        output_tokens: 250 + Math.floor(Math.random() * 200),
        cost_usd: 0.0,
        latency_ms: 800 + Math.floor(Math.random() * 1200),
        metadata_json: JSON.stringify({ seed: true, template }),
      });
    }
  }

  // 4. Seed starter prompt templates
  const insertPrompt = db.db.prepare(`
    INSERT OR IGNORE INTO prompts (id, world_id, title, category, template, description, tags)
    VALUES (@id, @world_id, @title, @category, @template, @description, @tags)
  `);

  for (const prompt of STARTER_PROMPTS) {
    insertPrompt.run({ ...prompt, world_id: worldId });
  }

  // 5. Emit a welcome notification event
  const insertEvent = db.db.prepare(`
    INSERT INTO world_events (world_id, event_type, source_id, target_id, data_json)
    VALUES (@world_id, @event_type, @source_id, @target_id, @data_json)
  `);

  insertEvent.run({
    world_id: worldId,
    event_type: "notification",
    source_id: "system",
    target_id: null,
    data_json: JSON.stringify({
      title: "Welcome to your world!",
      message:
        "Your AI city is ready. Explore the Dispatch Tower to send your first task, " +
        "or visit the Brain Library to start researching. Check out the 5 example " +
        "tasks we prepared to see what's possible.",
      icon: "welcome",
      seed: true,
    }),
  });
}

module.exports = {
  seedDefaultZones,
  seedDefaultAgents,
  seedQuestChain,
  applyTemplate,
  ZONE_DEFS,
  AGENT_DEFS,
  QUEST_DEFS,
  TEMPLATE_UNLOCKS,
  TEMPLATE_TASKS,
  STARTER_PROMPTS,
  TEMPLATE_PARTIAL_ZONES,
};
