# Ferni AI Voice Agent

## Quick Reference
```bash
npm run quality      # Typecheck + lint + format + test (run before commits)
npm run typecheck    # TypeScript only
npm run lint:fix     # Auto-fix lint issues
npm test             # Vitest (60% coverage required)
```

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
```
agents/           → Voice agent implementations
personas/         → Persona bundles + cognitive profiles
intelligence/     → Context builders (emotion, memory, topics)
services/         → Business logic, DI container, session mgmt
memory/           → Storage: Firestore, Postgres, Redis, embeddings
tools/            → 35+ LLM tools organized by domain
conversation/     → Conversation state, quality tracking
speech/           → Audio prosody, emotion detection, SSML
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

## Subdirectory CLAUDE.md Files
- `src/tools/CLAUDE.md` - How to create tools
- `src/personas/CLAUDE.md` - How to create personas
- `src/intelligence/context-builders/CLAUDE.md` - Context builder patterns
- `frontend-typescript/CLAUDE.md` - Frontend/design system rules
