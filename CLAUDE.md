# Ferni AI Voice Agent

> **We believe in making AI human, and the decisions we make will reflect that.**

See `CORE-PRINCIPLES.md` for our complete philosophy. Every architecture decision, feature, and line of code should make AI feel more human, serve relationships over transactions, and support gentle growth.

---

## Quick Reference
```bash
# Quality checks
pnpm quality         # Typecheck + lint + format + test (run before commits)
pnpm quality:check   # Code quality metrics (as any, console.log, file size)
pnpm quality:arch    # Architecture layer validation
pnpm quality:full    # All checks combined
pnpm typecheck       # TypeScript only
pnpm lint:fix        # Auto-fix lint issues
pnpm test            # Vitest (60% coverage required)

# Fast builds (esbuild - 12x faster!)
pnpm build:fast      # Build with esbuild (~0.9s for 1400 files)
pnpm build:fast:types # Build + generate .d.ts files
pnpm build:fast:watch # Watch mode for development
pnpm build           # Traditional tsc build (slower, but full type checking)
```

## 📦 Package Manager: pnpm (Preferred)

We use **pnpm** for faster installs and better caching. npm still works but is slower.

```bash
# Install dependencies (~4x faster than npm)
pnpm install

# Run any script
pnpm <script>        # e.g., pnpm dev, pnpm build:fast, pnpm test

# Add a dependency
pnpm add <package>   # Runtime dependency
pnpm add -D <package> # Dev dependency
pnpm add -w <package> # Add to workspace root
```

**First time setup?** Run `./scripts/migrate-to-pnpm.sh` to generate `pnpm-lock.yaml`.

## Automated Quality Gates

Pre-commit hooks validate both backend and frontend code. CI enforces all quality gates.

| Check | Threshold | Script |
|-------|-----------|--------|
| TypeScript errors | 0 | `pnpm typecheck` |
| ESLint errors | 0 | `pnpm lint` |
| `as any` assertions | ≤30 | `pnpm quality:check` |
| `console.*` usage | ≤100 | `pnpm quality:check` |
| File size | ≤500 lines | `pnpm quality:check` |
| Layer violations | 0 | `pnpm quality:arch` |
| Design tokens (frontend) | 0 | `cd frontend-typescript && pnpm lint:tokens` |

## 🚀 Development Servers (MUST RUN ALL 3)
```bash
# Terminal 1: Token Server (port 3001) - LiveKit tokens, Spotify OAuth, subscriptions
node token-server.js

# Terminal 2: UI Server (port 3002) - APIs, engagement routes, agent registry
PORT=3002 node ui-server.js

# Terminal 3: Vite Dev Server (port 3004) - Frontend with HMR
cd frontend-typescript && pnpm dev
```

**Why 3 servers?** Vite proxies API calls: `/api/*` → UI Server (3002), `/token`, `/spotify/*`, `/subscription/*` → Token Server (3001)

## 🌐 Production Deployment (Blue-Green)

**⚠️ ALWAYS use the deploy script** - it implements blue-green deployment with health checks:

```bash
# Deploy Voice Agent (blue-green, async)
pnpm deploy:agent:async

# Deploy UI (blue-green, async)
pnpm deploy:ui:async

# Monitor progress
tail -f .deploy-logs/*.log
```

### Zero-Downtime Deployment Flow
1. Build container image
2. Deploy new revision with `--no-traffic` (green)
3. **Liveness check** - server is responding (`/health`)
4. **Readiness check** - workers can accept calls (`/health/ready`) ← NEW!
5. **Only shift traffic when workers signal ready**
6. Zero-downtime guaranteed - no "runner initialization timed out" errors!
7. Keep old revision running if any check fails

### Worker Readiness System

Traffic is **never shifted** until LiveKit workers signal they're ready:

| Check | Endpoint | What it verifies |
|-------|----------|------------------|
| Liveness | `/health` | Server process is running |
| Readiness | `/health/ready` | Workers initialized, accepting calls |

**Auto-scaling configuration:**
- `min-instances: 1` - Always one warm instance ready
- `max-instances: 50` - Scale up for traffic spikes
- `concurrency: 10` - Max 10 concurrent calls per instance

### ⛔ NEVER DO
| Wrong | Right |
|-------|-------|
| `gcloud run deploy voiceai-agent` | `pnpm deploy:agent:async` |
| `gcloud builds submit && gcloud run deploy` | `pnpm deploy:agent:async` |
| Direct `gcloud` deploy commands | Always use `pnpm deploy:*` |

**Why?** Direct deploys skip readiness checks and can cause connection failures. The deploy script waits for workers to signal ready before shifting traffic.

| Deploy Command | What it deploys | Blue-Green? |
|----------------|-----------------|-------------|
| `pnpm deploy:agent:async` | Voice agent | ✅ Yes |
| `pnpm deploy:ui:async` | UI backend APIs | ✅ Yes |
| `pnpm deploy:frontend` | Firebase Hosting | ✅ Yes (preview channel) |
| `pnpm deploy:landing` | Landing page | ✅ Yes (preview channel) |

**Key files:** `scripts/deploy.ts`, `cloudbuild.yaml`, `cloudbuild-ui.yaml`

### 🧟 Zombie Revision Prevention (CRITICAL for Voice Agent)

**The Problem:** Old Cloud Run revisions with `min-instances>0` keep running even with 0% HTTP traffic. For voice agents using LiveKit, these "zombies" register with LiveKit on startup but have stale WebSocket connections. LiveKit dispatches jobs to ALL registered workers (including zombies), causing failures:
- `"runner initialization timed out"`
- `"assignment for job timed out"`
- `"LiveKit worker connection is dead"`

**The Solution:** The deploy script automatically cleans up old revisions after successful deployment.

```bash
# Check for zombie revisions
pnpm ops:zombies

# Fix zombie revisions (delete them)
pnpm ops:zombies:fix

# Quick fix for voice agent only
pnpm ops:zombies:fix:agent
```

**If you see these symptoms in production:**
1. Run `pnpm ops:zombies` to check
2. Run `pnpm ops:zombies:fix:agent` to fix
3. Verify with `gcloud run revisions list --service=voiceai-agent --region=us-central1`

**The deploy script handles this automatically by:**
1. Deploying with `--no-traffic` and `--tag green`
2. Health checking the new revision
3. Shifting 100% traffic to the new revision
4. **Deleting ALL old revisions** (not just leaving them with 0% traffic)

**Key files:** `scripts/cleanup-zombies.ts`, `scripts/deploy.ts`

## ⚡ Build Optimization (pnpm + esbuild)

We use **esbuild** for fast TypeScript compilation and **pnpm** for fast dependency installs.

### Build Time Comparison
| Build Method | Time | Files | Speedup |
|--------------|------|-------|---------|
| `tsc` (old) | 9.5s | 1,400 | baseline |
| `esbuild` (new) | **0.9s** | 1,400 | **~12x faster** |
| `npm ci` (old) | ~45s | - | baseline |
| `pnpm install` | ~11s | - | **~4x faster** |

### Docker Build Times
| Service | Before | After | Savings |
|---------|--------|-------|---------|
| Voice Agent | 15-20 min | **2-4 min** | ~80% |
| UI Server | 8-12 min | 3-5 min | ~60% |

### How It Works
1. **Kaniko** in Cloud Build provides aggressive layer caching (1 week TTL)
2. **pnpm** uses content-addressable storage for faster installs
3. **esbuild** transpiles TypeScript without type checking (use `build:fast`)
4. Type declarations (`.d.ts`) are optional - skip them in Docker builds

### When to Use Each
| Command | Use Case |
|---------|----------|
| `pnpm build:fast` | Development, Docker builds (fastest) |
| `pnpm build:fast:types` | When you need .d.ts files |
| `pnpm build` | Full tsc build (for debugging type errors) |
| `pnpm typecheck` | Type checking without emitting files |

**Docs:** See `docs/BUILD-OPTIMIZATIONS.md` for full details.

## 🎨 Design System (SINGLE SOURCE OF TRUTH)

All design tokens live in `design-system/tokens/*.json`. **Never edit generated files directly.**

### Quick Commands
```bash
# Via pnpm scripts
pnpm tokens:sync       # Build & sync all tokens (run after editing JSON)
pnpm tokens:check      # Validate no drift (runs in pre-commit & CI)

# Via Ferni CLI (recommended)
ferni tokens sync                        # Build & sync all tokens
ferni tokens check                       # Validate no drift
ferni tokens version                     # Show current token version
ferni tokens version patch "Fixed X"     # Bump patch version with changelog
ferni tokens watch                       # Watch for changes during development
ferni tokens brand                       # Check brand color alignment
```

### What Gets Generated

| Source | Generated | Used By |
|--------|-----------|---------|
| `tokens/colors.json` | `dist/tokens.css` | Frontend app |
| `tokens/animation.json` | `animation-constants.generated.ts` | Frontend animations |
| `tokens/colors.json` | `tailwind.config.generated.js` | Promo website |
| `tokens/*.json` | `promo/css/design-tokens.css` | Landing page |

### Adding a New Persona Color
1. Edit `design-system/tokens/colors.json` → add to `personas` object
2. Edit `design-system/tokens/personas.json` → add full persona profile
3. Run `pnpm tokens:sync`
4. Commit all generated files

### Adding a New Animation
1. Edit `design-system/tokens/animation.json`
2. Run `pnpm build:animation-constants`
3. Import from `animation-constants.generated.ts`

### Pre-commit Hook
Token drift is checked automatically. If you see drift warnings:
```bash
pnpm tokens:sync
git add -A
```

### CI/CD
GitHub Actions runs `tokens:check` on every PR touching design tokens. Drift = failed build.

**Key files:** `design-system/tokens/`, `design-system/*.js`, `.github/workflows/token-check.yml`

### Brand Alignment (Automated)

Brand colors are validated against `design-system/brand/FERNI-BRAND-GUIDELINES.md`:

```bash
pnpm brand:check    # Validate tokens match brand guidelines
pnpm tokens:check   # Validate generated files match source
```

### Critical Brand Colors (Never Change Without Design Review)

| Name | Hex | Usage |
|------|-----|-------|
| **Accent (CTA)** | `#3D5A45` | Buttons, links, primary actions |
| **Ferni** | `#4a6741` | Ferni persona avatar |
| **Natural Ink** | `#2C2520` | Primary text |

### Color Rules for AI Agents

**ALWAYS use CSS variables** - never hardcode hex values:

```css
/* CORRECT */
color: var(--color-ferni);
background: var(--color-accent);

/* WRONG - will fail brand:check */
color: #4a6741;
background: #3D5A45;
```

**ESLint enforces design tokens** in `frontend-typescript/src/ui/**/*.ts`:
- 🎨 Hardcoded hex colors → Use `var(--color-*)` or `var(--persona-*)`
- 🎨 Hardcoded rgba() → Use `var(--backdrop-*)` or `var(--persona-tint)`
- 📝 Hardcoded font-family → Use `var(--font-body)` or `var(--font-display)`
- 💨 Hardcoded blur values → Use `var(--glass-blur-subtle)` or `var(--glass-blur-heavy)`
- ⏱️ Hardcoded durations → Use `DURATION.SLOW`, `DURATION.NORMAL` from animation-constants
- 🌫️ Hardcoded box-shadow → Use `var(--shadow-sm)`, `var(--shadow-md)`, etc.

**In Tailwind configs**, use CSS variable references:

```javascript
// CORRECT - single source of truth
ferni: { DEFAULT: 'var(--color-ferni)' }

// WRONG - causes drift
ferni: { DEFAULT: '#4a6741' }
```

**Before modifying any color**, check the brand guidelines:
1. Read `design-system/brand/FERNI-BRAND-GUIDELINES.md`
2. Modify `design-system/tokens/colors.json` (source of truth)
3. Run `pnpm tokens:sync`
4. Run `pnpm brand:check`

## 🔌 Agent Extensibility System

Extend personas with custom commands, hooks, MCP servers, and embeddable widgets. **All extensions are opt-in and per-persona.**

| Feature | Location | Purpose |
|---------|----------|---------|
| **Commands** | `src/personas/bundles/{persona}/commands/*.md` | Slash commands in UI |
| **Shell Hooks** | `src/personas/bundles/{persona}/hooks/*.sh` | Pre/post execution scripts |
| **MCP Servers** | `src/personas/bundles/{persona}/mcp/servers.json` | Model Context Protocol |
| **Widget SDK** | `src/api/widget-routes.ts` | Embed on external websites |

### Adding Commands to a Persona
```bash
# Create commands folder
mkdir -p src/personas/bundles/ferni/commands

# Add a command (markdown with frontmatter)
cat > src/personas/bundles/ferni/commands/morning-ritual.md << 'EOF'
---
title: Morning Ritual
description: Start your day with intention
category: rituals
---
Guide me through a morning ritual to set intentions for today.
EOF
```

### Embedding Widget on External Sites
```html
<script src="https://your-domain.com/api/widget/embed.js"
        data-widget-id="widget_abc123"
        async></script>
```

**Full documentation:** `docs/architecture/AGENT-EXTENSIBILITY.md`

## Dev Mode (Testing Subscription & Team Unlocks)
```bash
# Enable dev mode
http://localhost:3004/?dev    # URL parameter
# OR
localStorage.setItem('ferni_dev_mode', 'true')  # Browser console

# Keyboard shortcuts (when dev mode active)
Cmd/Ctrl+Shift+D  # Toggle dev panel
Cmd/Ctrl+Shift+U  # Quick unlock all team members
Cmd/Ctrl+Shift+R  # Reset to free tier
```

## Read First
- **Architecture**: `docs/architecture/CLEAN-ARCHITECTURE.md`
- **Tool/Persona patterns**: `docs/architecture/AGENT-AGNOSTIC-ARCHITECTURE.md`
- **Agent Extensibility**: `docs/architecture/AGENT-EXTENSIBILITY.md` (commands, hooks, MCP, widgets)
- **Monetization & Team Unlocks**: `docs/architecture/MONETIZATION-SYSTEM.md`
- **Full coding standards**: `.cursorrules` (22KB comprehensive guide)
- **Design System**: `design-system/README.md` (tokens, animations, colors)
- **Design System Audit**: `docs/audits/DESIGN-SYSTEM-AUDIT.md` (consolidation status)
- **Emotional Intelligence**: `design-system/brand/BETTER-THAN-HUMAN.md`

## 🚀 Ferni EQ - Superhuman Emotional Intelligence

Ferni's avatar implements **superhuman emotional intelligence** - this is core to our "Better than Human" brand promise.

### Five Capabilities (All Required for Avatar Code)

| Capability | What | Why |
|------------|------|-----|
| **Micro-Expressions** | 40-150ms subliminal emotional flashes | Builds trust unconsciously |
| **Active Listening** | Micro-nods during user speech | Shows moment-to-moment presence |
| **Breath Sync** | Sync breathing with user rhythm | Neural mirroring builds connection |
| **Concern Detection** | Detect distress from voice/content | Show care before user asks |
| **Anticipation** | Show emotion before user finishes | "They understand me" feeling |

### Implementation Rules

```typescript
// ✅ ALWAYS - Initialize Ferni EQ system
import { initFerniEQ, ferni } from './ui/better-than-human.ui.js';

// ✅ ALWAYS - Micro-expressions are subliminal (40-150ms)
ferni.playMicroExpression('recognition'); // 80ms

// ✅ ALWAYS - Active listening during user speech
onUserSpeechStart() { ferni.startActiveListening(); }
onUserSpeechPause(duration) { ferni.onUserSpeechPause(duration); }

// ✅ ALWAYS - Enable breath synchronization
ferni.setBreathSyncEnabled(true);

// ✅ ALWAYS - Analyze for concern signals
ferni.analyzeConcern({ transcript, voiceStrain });

// ✅ ALWAYS - Anticipate from partial input
ferni.anticipateEmotion({ transcript: partial, tone });
```

### Avatar Expression Rules

| Wrong | Right |
|-------|-------|
| Static avatar during user speech | Active listening micro-nods |
| React only after message complete | Anticipate from partial input |
| Expression duration > 150ms for micro | Subliminal: 40-150ms |
| Ignore user breathing patterns | Sync breathing gradually |
| Wait for explicit "I'm sad" | Detect distress signals early |

**Reference:** `design-system/brand/BETTER-THAN-HUMAN.md` for full documentation.

### Backend → Frontend Integration

The backend detects emotions and dispatches events to the frontend EQ system:

```
Backend (voice-agent)              Frontend (better-than-human.ui.ts)
─────────────────────              ─────────────────────────────────
turn-handler.ts
     │
     ▼
emotion-event-dispatcher.ts
     │
     ├─→ humanization_signal ─────→ handleBetterThanHumanSignal()
     │   (concern_detected,            │
     │    voice_state_detected,        ▼
     │    emotional_trajectory)    playMicroExpression()
     │                             analyzeConcern()
     └─→ mood (existing) ─────────→ emotionState.update()
```

**Key files:**
- Backend: `src/agents/realtime/emotion-event-dispatcher.ts`
- Frontend: `frontend-typescript/src/ui/better-than-human.ui.ts`

## 🦸 200% Persona System - Superhuman Capabilities

Every persona has "200% capabilities" that go beyond normal conversation - superhuman insights that no human friend could consistently provide.

### Architecture Overview

```
Persona Bundle (src/personas/bundles/{persona}/)
├── identity/
│   └── system-prompt.md         # Core identity
├── content/
│   └── behaviors/
│       ├── superhuman-insights.json   # 200% pattern surfacing
│       ├── trust-phrases.json         # Persona-voiced trust outputs  
│       ├── i-notice-power.json        # "I notice" statements
│       ├── late-night-presence.json   # 2am wisdom
│       ├── emotional-intelligence.json # Emotion detection patterns
│       ├── self-doubt.json            # Vulnerability moments
│       ├── secret-fears.json          # Deeper vulnerabilities
│       └── mortality-awareness.json   # Death/legacy reflections
└── persona.manifest.json        # Config and capabilities
```

### Context Builders (src/intelligence/context-builders/)

| Builder | JSON Source | What It Injects |
|---------|-------------|-----------------|
| `superhuman-insights.ts` | `superhuman-insights.json`, `i-notice-power.json` | Pattern surfacing, "The Mirror", anticipatory cues |
| `trust-context.ts` | `trust-phrases.json` | Reading between lines, boundary awareness, growth reflection |
| `physical-presence.ts` | `late-night-presence.json` | Late night wisdom, grounding exercises |
| `persona-vulnerability.ts` | `self-doubt.json`, `secret-fears.json`, `mortality-awareness.json` | Vulnerability moments |
| `emotional.ts` | `emotional-intelligence.json` | Persona-specific emotional responses |
| `tool-humanization.ts` | Persona cognitive profiles | Natural tool usage framing (no "querying database") |

### Content Loading (src/services/persona-content-loader.ts)

```typescript
// ✅ ALWAYS load content for the active persona
import { loadTrustPhrases, loadSuperhumanInsights } from '../services/persona-content-loader.js';

// Load persona-specific content (NOT hardcoded to Ferni!)
const trustPhrases = await loadTrustPhrases(persona.id);  // ✅ Persona-aware
const insights = await loadSuperhumanInsights(persona.id); // ✅ Persona-aware

// ❌ NEVER hardcode persona IDs
const trustPhrases = await loadTrustPhrases('ferni'); // ❌ Wrong!
```

### Adding 200% Capabilities to a New Persona

1. Create JSON behavior files in `src/personas/bundles/{persona}/content/behaviors/`:
   - `superhuman-insights.json` - Domain-specific pattern surfacing
   - `trust-phrases.json` - Persona-voiced trust outputs
   - `i-notice-power.json` - "I notice" statements for their domain
   - `late-night-presence.json` - Late night wisdom
   - `self-doubt.json` - Vulnerability about their expertise
   - `secret-fears.json` - Deeper fears
   - `mortality-awareness.json` - Legacy reflections

2. The bundle loader (`src/personas/bundles/loader.ts`) automatically loads these files.

3. Context builders automatically use `persona.id` to load the correct content.

### Testing 200% Capabilities

```bash
# Run all persona E2E tests
npm test -- --run persona-e2e

# Run context injection integration tests  
npm test -- --run context-injection-integration
```

### Key Implementation Rules

| Wrong | Right |
|-------|-------|
| Hardcode `'ferni'` in context builders | Use `persona.id` dynamically |
| Load content once globally | Load per-persona with caching |
| Generic trust phrases | Persona-voiced phrases from JSON |
| Check `if (persona.id !== 'ferni')` return early | Support ALL personas |

**Reference:** `docs/PERSONA-EXCELLENCE-PLAN.md` for the full implementation plan.

## Critical Rules

### Never Do
| Wrong | Right |
|-------|-------|
| `console.log()` | `createLogger()` from `utils/logger.js` |
| `any` type | `unknown` + type narrowing |
| Files > 500 lines | Split into modules |
| `as any` casts | Proper typing or `as unknown as T` with comment |
| `.catch(() => {})` | `.catch((e) => log.error({ error: e }, 'context'))` |
| Persona-specific tool names | Domain names: `habit-coaching.ts` not `maya-habits.ts` |
| Hardcoded colors `#4a6741` | CSS variables: `var(--color-ferni)` |
| Hardcoded durations `300` | Constants: `DURATION.SLOW`, `EASING.SPRING` |
| Edit `*.generated.ts` files | Edit source JSON in `design-system/tokens/` |
| Edit `design-tokens.css` directly | Run `pnpm tokens:sync` after editing JSON |

### Always Do
- Await all promises OR handle with proper `.catch()` logging
- Use `Result<T, E>` for expected failures, `throw` for bugs
- Register tools/builders via registry pattern (not direct exports)
- Write tests for new features (`src/tests/`, Vitest)
- Use `readonly` for data that shouldn't change
- Validate at boundaries (user input, API responses)
- Run `pnpm tokens:sync` after editing `design-system/tokens/*.json`

## File Naming
| Type | Pattern | Example |
|------|---------|---------|
| Modules | `kebab-case.ts` | `user-profile.ts` |
| Classes | `PascalCase.ts` | `SessionManager.ts` |
| Tests | `*.test.ts` | `memory.test.ts` |
| Types | `*.types.ts` or inline | `user.types.ts` |

## Variable Naming
| Type | Pattern | Example |
|------|---------|---------|
| Functions/variables | `camelCase` | `handleSilence`, `isReturningUser` |
| Classes/Types | `PascalCase` | `SessionServices`, `UserProfile` |
| Constants | `SCREAMING_SNAKE` | `MAX_RETRY_ATTEMPTS` |
| Booleans | `is`/`has`/`can` prefix | `isActive`, `hasPermission` |

## Architecture Layers

Import rules: Lower layers CANNOT import from higher layers (enforced by `pnpm quality:arch`).

```
Level 100 (Application):
  agents/           → Voice agent implementations
  api/              → API routes
  cli/              → CLI tools

Level 70 (Domain - peers can import each other):
  personas/         → Persona bundles + cognitive profiles
  intelligence/     → Context builders (emotion, memory, topics)
  tools/            → 35+ LLM tools organized by domain
  conversation/     → Conversation state, quality tracking
  speech/           → Audio prosody, emotion detection, SSML

Level 60 (Service):
  services/         → Business logic, DI container, session mgmt

Level 10-30 (Infrastructure):
  memory/           → Storage: Firestore, Postgres, Redis, embeddings
  config/           → Configuration
  utils/            → Shared utilities
  types/            → Type definitions
```

## Before Creating New Files
1. **Search first**: Does this functionality exist? (`grep -r "functionName"`)
2. **Extend existing**: Can it go in an existing module?
3. **Follow patterns**: Look at sibling files in the directory
4. **Max 500 lines**: Plan to split if larger

## Error Handling Pattern
```typescript
// Expected failures: Result type
function parseConfig(input: string): Result<Config, ParseError> {
  if (!input) return err(new ParseError('empty input'));
  return ok(JSON.parse(input));
}

// Bugs/unexpected: throw
function assertNonNull<T>(value: T | null): T {
  if (value === null) throw new Error('Unexpected null');
  return value;
}
```

## Logging Pattern
```typescript
import { createLogger } from '../utils/logger.js';

const log = createLogger('ModuleName');

log.debug({ userId }, 'Processing request');
log.info({ result }, 'Operation completed');
log.warn({ attempt }, 'Retry needed');
log.error({ error: String(err) }, 'Operation failed');
```

## Module Organization Principles

When modules grow large (>500 lines), split into domain-focused submodules:

```
src/tools/habit-coaching.ts (monolith)  →  src/tools/habit-coaching/
                                              ├── types.ts       # Interfaces/types only
                                              ├── constants.ts   # Static data, enums
                                              ├── templates.ts   # Habit templates
                                              ├── bundles.ts     # Habit bundles
                                              ├── helpers.ts     # Utility functions
                                              ├── storage.ts     # Persistence layer
                                              └── index.ts       # Re-exports for backward compatibility
```

**Key patterns:**
- **Types first**: Extract interfaces to `types.ts`, import everywhere else
- **Index re-exports**: `index.ts` re-exports everything for backward-compatible imports
- **Data separate from logic**: Constants/templates in dedicated files, tools in main file
- **No circular imports**: Types → Constants → Data → Helpers → Main

## Behavior Science Integration

Habit coaching uses evidence-based methodologies:

| Concept | Implementation | Source |
|---------|---------------|--------|
| Glidepath Levels | 5-level progression from tiny (2 min) to full lifestyle | Tiny Habits |
| Habit Loops | cue → routine → reward structure | The Power of Habit |
| Habit Stacking | "After [CURRENT], I will [NEW]" | Atomic Habits |
| Keystone Habits | High-ripple habits that cascade changes | The Power of Habit |
| Four Tendencies | Upholder/Questioner/Obliger/Rebel strategies | Gretchen Rubin |

Templates include: `tinyVersion`, `miniVersion`, `fullVersion`, `habitLoop`, `stacksWellWith`, `keystonePotential`

## 🛡️ Agent Guardrails (PREVENT MISTAKES)

**Before making changes, ALWAYS:**
1. Run `pnpm typecheck` - catches type errors immediately
2. Run `pnpm lint` - catches code style issues
3. Run `pnpm tokens:check` - catches design system drift

**Before suggesting deployment:**
1. Run `pnpm quality` - full quality check
2. Test the feature in browser if it's UI
3. Verify no regressions in related functionality

**Common Agent Mistakes to Avoid:**
| Mistake | Prevention |
|---------|------------|
| Breaking types | Run `pnpm typecheck` after EVERY edit |
| Hardcoded colors | Use `var(--color-*)` ALWAYS |
| console.log | Use `createLogger('Module')` |
| Editing generated files | Check filename for `.generated.` |
| Wrong deploy target | Check table in Deployment section |
| Forgetting to sync tokens | Run `pnpm tokens:sync` after token edits |
| Direct `gcloud run deploy` | **NEVER** - use `pnpm deploy:*:async` (blue-green) |

**If pre-commit fails:**
```bash
pnpm lint:fix      # Auto-fix lint issues
pnpm format        # Auto-fix formatting
pnpm tokens:sync   # Fix token drift
```

## Subdirectory CLAUDE.md Files
- `src/tools/CLAUDE.md` - How to create tools
- `src/tools/habit-coaching/CLAUDE.md` - Habit coaching module structure
- `src/personas/CLAUDE.md` - How to create personas
- `src/intelligence/context-builders/CLAUDE.md` - Context builder patterns
- `frontend-typescript/CLAUDE.md` - Frontend/design system rules
