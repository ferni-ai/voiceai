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

## 🌐 Production Deployment (Google Cloud Run)
```bash
# Deploy UI (frontend + all APIs in one container)
./scripts/deploy-ui.sh

# Deploy Voice Agent (LiveKit agent only)
./scripts/deploy-gcp.sh
```

| Environment | UI Server | Voice Agent | Frontend |
|-------------|-----------|-------------|----------|
| **Development** | port 3002 | `npm run dev` | Vite port 3004 |
| **Production** | `Dockerfile.ui` → Cloud Run | `Dockerfile` → Cloud Run | Built into UI |

**Key files:** `cloudbuild-ui.yaml`, `cloudbuild.yaml`, `Dockerfile.ui`, `Dockerfile`

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
- **Architecture**: `docs/CLEAN-ARCHITECTURE.md`
- **Tool/Persona patterns**: `docs/AGENT-AGNOSTIC-ARCHITECTURE.md`
- **Monetization & Team Unlocks**: `docs/MONETIZATION-SYSTEM.md`
- **Full coding standards**: `.cursorrules` (22KB comprehensive guide)
- **Design tokens**: `brand/ferni-design-tokens.css`
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
| Hardcoded colors in UI | CSS variables: `var(--persona-primary)` |
| Hardcoded durations in UI | Constants: `DURATION.SLOW`, `EASING.SPRING` |

### Always Do
- Await all promises OR handle with proper `.catch()` logging
- Use `Result<T, E>` for expected failures, `throw` for bugs
- Register tools/builders via registry pattern (not direct exports)
- Write tests for new features (`src/tests/`, Vitest)
- Use `readonly` for data that shouldn't change
- Validate at boundaries (user input, API responses)

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

## Subdirectory CLAUDE.md Files
- `src/tools/CLAUDE.md` - How to create tools
- `src/tools/habit-coaching/CLAUDE.md` - Habit coaching module structure
- `src/personas/CLAUDE.md` - How to create personas
- `src/intelligence/context-builders/CLAUDE.md` - Context builder patterns
- `frontend-typescript/CLAUDE.md` - Frontend/design system rules
