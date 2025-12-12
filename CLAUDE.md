# Ferni AI Voice Agent

> **We believe in making AI human, and the decisions we make will reflect that.**

See `CORE-PRINCIPLES.md` for our complete philosophy. Every architecture decision, feature, and line of code should make AI feel more human, serve relationships over transactions, and support gentle growth.

---

## Quick Reference
```bash
npm run quality      # Typecheck + lint + format + test (run before commits)
npm run quality:check # Code quality metrics (as any, console.log, file size)
npm run quality:arch  # Architecture layer validation
npm run quality:full  # All checks combined
npm run typecheck    # TypeScript only
npm run lint:fix     # Auto-fix lint issues
npm test             # Vitest (60% coverage required)
```

## Automated Quality Gates

Pre-commit hooks validate both backend and frontend code. CI enforces all quality gates.

| Check | Threshold | Script |
|-------|-----------|--------|
| TypeScript errors | 0 | `npm run typecheck` |
| ESLint errors | 0 | `npm run lint` |
| `as any` assertions | ≤30 | `npm run quality:check` |
| `console.*` usage | ≤100 | `npm run quality:check` |
| File size | ≤500 lines | `npm run quality:check` |
| Layer violations | 0 | `npm run quality:arch` |
| Design tokens (frontend) | 0 | `cd frontend-typescript && npm run lint:tokens` |

## 🚀 Development Servers (MUST RUN ALL 3)
```bash
# Terminal 1: Token Server (port 3001) - LiveKit tokens, Spotify OAuth, subscriptions
node token-server.js

# Terminal 2: UI Server (port 3002) - APIs, engagement routes, agent registry
PORT=3002 node ui-server.js

# Terminal 3: Vite Dev Server (port 3004) - Frontend with HMR
cd frontend-typescript && npm run dev
```

**Why 3 servers?** Vite proxies API calls: `/api/*` → UI Server (3002), `/token`, `/spotify/*`, `/subscription/*` → Token Server (3001)

## 🌐 Production Deployment (Blue-Green)

**⚠️ ALWAYS use the deploy script** - it implements blue-green deployment with health checks:

```bash
# Deploy Voice Agent (blue-green, async)
npm run deploy:agent:async

# Deploy UI (blue-green, async)
npm run deploy:ui:async

# Monitor progress
tail -f .deploy-logs/*.log
```

### Blue-Green Deployment Flow
1. Build container image
2. Deploy new revision with `--no-traffic` (green)
3. Health check the green revision
4. **Only shift traffic if healthy**
5. Keep old revision running if health check fails

### ⛔ NEVER DO
| Wrong | Right |
|-------|-------|
| `gcloud run deploy voiceai-agent` | `npm run deploy:agent:async` |
| `gcloud builds submit && gcloud run deploy` | `npm run deploy:agent:async` |
| Direct `gcloud` deploy commands | Always use `npm run deploy:*` |

**Why?** Direct deploys skip health checks and can push broken code to production. The crash on 2025-12-11 was caused by direct deploy without blue-green.

| Deploy Command | What it deploys | Blue-Green? |
|----------------|-----------------|-------------|
| `npm run deploy:agent:async` | Voice agent | ✅ Yes |
| `npm run deploy:ui:async` | UI backend APIs | ✅ Yes |
| `npm run deploy:frontend` | Firebase Hosting | ✅ Yes (preview channel) |
| `npm run deploy:landing` | Landing page | ✅ Yes (preview channel) |

**Key files:** `scripts/deploy.ts`, `cloudbuild.yaml`, `cloudbuild-ui.yaml`

## 🎨 Design System (SINGLE SOURCE OF TRUTH)

All design tokens live in `design-system/tokens/*.json`. **Never edit generated files directly.**

### Quick Commands
```bash
npm run tokens:sync    # Build & sync all tokens (run after editing JSON)
npm run tokens:check   # Validate no drift (runs in pre-commit & CI)
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
3. Run `npm run tokens:sync`
4. Commit all generated files

### Adding a New Animation
1. Edit `design-system/tokens/animation.json`
2. Run `npm run build:animation-constants`
3. Import from `animation-constants.generated.ts`

### Pre-commit Hook
Token drift is checked automatically. If you see drift warnings:
```bash
npm run tokens:sync
git add -A
```

### CI/CD
GitHub Actions runs `tokens:check` on every PR touching design tokens. Drift = failed build.

**Key files:** `design-system/tokens/`, `design-system/*.js`, `.github/workflows/token-check.yml`

### Brand Alignment (Automated)

Brand colors are validated against `brand/FERNI-BRAND-GUIDELINES.md`:

```bash
npm run brand:check    # Validate tokens match brand guidelines
npm run tokens:check   # Validate generated files match source
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

**In Tailwind configs**, use CSS variable references:

```javascript
// CORRECT - single source of truth
ferni: { DEFAULT: 'var(--color-ferni)' }

// WRONG - causes drift
ferni: { DEFAULT: '#4a6741' }
```

**Before modifying any color**, check the brand guidelines:
1. Read `brand/FERNI-BRAND-GUIDELINES.md`
2. Modify `design-system/tokens/colors.json` (source of truth)
3. Run `npm run tokens:sync`
4. Run `npm run brand:check`

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
- **Emotional Intelligence**: `brand/BETTER-THAN-HUMAN.md`

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

**Reference:** `brand/BETTER-THAN-HUMAN.md` for full documentation.

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
| Edit `design-tokens.css` directly | Run `npm run tokens:sync` after editing JSON |

### Always Do
- Await all promises OR handle with proper `.catch()` logging
- Use `Result<T, E>` for expected failures, `throw` for bugs
- Register tools/builders via registry pattern (not direct exports)
- Write tests for new features (`src/tests/`, Vitest)
- Use `readonly` for data that shouldn't change
- Validate at boundaries (user input, API responses)
- Run `npm run tokens:sync` after editing `design-system/tokens/*.json`

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

Import rules: Lower layers CANNOT import from higher layers (enforced by `npm run quality:arch`).

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
1. Run `npm run typecheck` - catches type errors immediately
2. Run `npm run lint` - catches code style issues
3. Run `npm run tokens:check` - catches design system drift

**Before suggesting deployment:**
1. Run `npm run quality` - full quality check
2. Test the feature in browser if it's UI
3. Verify no regressions in related functionality

**Common Agent Mistakes to Avoid:**
| Mistake | Prevention |
|---------|------------|
| Breaking types | Run `npm run typecheck` after EVERY edit |
| Hardcoded colors | Use `var(--color-*)` ALWAYS |
| console.log | Use `createLogger('Module')` |
| Editing generated files | Check filename for `.generated.` |
| Wrong deploy target | Check table in Deployment section |
| Forgetting to sync tokens | Run `npm run tokens:sync` after token edits |
| Direct `gcloud run deploy` | **NEVER** - use `npm run deploy:*:async` (blue-green) |

**If pre-commit fails:**
```bash
npm run lint:fix      # Auto-fix lint issues
npm run format        # Auto-fix formatting
npm run tokens:sync   # Fix token drift
```

## Subdirectory CLAUDE.md Files
- `src/tools/CLAUDE.md` - How to create tools
- `src/tools/habit-coaching/CLAUDE.md` - Habit coaching module structure
- `src/personas/CLAUDE.md` - How to create personas
- `src/intelligence/context-builders/CLAUDE.md` - Context builder patterns
- `frontend-typescript/CLAUDE.md` - Frontend/design system rules
