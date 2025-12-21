# Session Manager

> **We believe in making AI human, and the decisions we make will reflect that.**

The session manager handles creation and lifecycle of per-conversation sessions.

---

## Architecture Level

Session Manager is at **Level 60** (Services layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/    ← THIS LAYER (session-manager/)
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Directory Structure

```
services/
├── session-manager.ts           # Main orchestration (~1000 lines)
└── session-manager/
    ├── access.ts                # Session access functions (getSession, clearAll)
    ├── cleanup.ts               # TTL and cleanup management
    ├── constants.ts             # Configuration constants
    ├── utils.ts                 # Utility functions (withTimeout)
    ├── validation.ts            # User ID validation
    ├── profile-loader.ts        # User profile loading/creation
    ├── engine-factory.ts        # Intelligence engine initialization
    ├── session-primer.ts        # Session priming for returning users
    ├── end-session.ts           # Session end lifecycle
    ├── __tests__/               # Test files
    └── CLAUDE.md                # This file
```

---

## Extracted Modules

### Core Infrastructure (already extracted)
- ✅ `access.ts` - getSession, clearAll, getActiveIds, getActiveCount
- ✅ `cleanup.ts` - startSessionCleanup, stopSessionCleanup, cleanupOrphanedSessions
- ✅ `constants.ts` - MAX_HUMANIZING_UPDATES, SUMMARIZE_TIMEOUT_MS, etc.
- ✅ `utils.ts` - withTimeout helper, generateFallbackSummary
- ✅ `validation.ts` - validateUserId

### Session Lifecycle (newly extracted)
- ✅ `profile-loader.ts` (~170 lines) - User profile loading/creation, intelligence state loading
  - `loadOrCreateProfile()` - Main entry point
  - Handles realtime memory enrichment, cross-persona insights, trust persistence

- ✅ `engine-factory.ts` (~200 lines) - Create all intelligence engines
  - `createSessionEngines()` - Creates response quality, pattern analyzer, etc.
  - Handles emotional memory loading, cross-session thread persistence

- ✅ `session-primer.ts` (~230 lines) - Build priming context for returning users
  - `generateSessionPriming()` - Memory index warming, priming context
  - `generateProactiveInsights()` - Proactive check-ins
  - `buildSuperhumanMemoryContext()` - "Better than Human" intelligence

- ✅ `end-session.ts` (~550 lines) - Session end lifecycle
  - `handleEndSession()` - Main orchestrator for session end
  - Conversation summarization (LLM or extraction)
  - Learning data finalization
  - All state persistence (handoff, threads, emotional, intelligence, journey, human memory)
  - Cleanup operations

---

## Module Responsibilities

| Module | Lines | Purpose |
|--------|-------|---------|
| `session-manager.ts` | ~1000 | Main orchestration, SessionServices object |
| `profile-loader.ts` | ~170 | Profile loading, intelligence state |
| `engine-factory.ts` | ~200 | Intelligence engine creation |
| `session-primer.ts` | ~230 | Session priming, superhuman context |
| `end-session.ts` | ~550 | Session end lifecycle |
| `access.ts` | ~105 | Session access functions |
| `cleanup.ts` | ~130 | TTL and cleanup |
| `constants.ts` | ~45 | Configuration |
| `utils.ts` | ~90 | Utility functions |
| `validation.ts` | ~50 | User ID validation |

**Total: ~2570 lines across 10 modules**

---

## Usage Pattern

```typescript
// In session-manager.ts
import { loadOrCreateProfile } from './session-manager/profile-loader.js';
import { createSessionEngines } from './session-manager/engine-factory.js';
import { generateSessionPriming, buildSuperhumanMemoryContext } from './session-manager/session-primer.js';
import { handleEndSession } from './session-manager/end-session.js';

// In createSessionServices():
const { userProfile, validatedUserId, isReturningUser } = await loadOrCreateProfile(
  userId, sessionId, global
);

const engines = createSessionEngines({
  engineKey: userId || sessionId,
  sessionId,
  userProfile,
  isReturningUser,
});

const sessionPriming = await generateSessionPriming({ ... });
const superhumanContext = buildSuperhumanMemoryContext({ ... });

// In endSession():
await handleEndSession({ sessionId, userId, validatedUserId, ... });
```

---

## Key Exports

From main session-manager.ts:
```typescript
export { createSessionServices } from './session-manager.js';
export { getSessionServices, clearAllSessions, getActiveSessionIds, getActiveSessionCount } from './session-manager/access.js';
export { startSessionCleanup, stopSessionCleanup } from './session-manager/cleanup.js';
```

---

## Testing

Each module has (or should have) corresponding tests:
```
session-manager/__tests__/
├── access.test.ts
├── cleanup.test.ts
├── session-manager-utils.test.ts
├── profile-loader.test.ts
├── engine-factory.test.ts
├── session-primer.test.ts
└── end-session.test.ts
```

Run tests:
```bash
pnpm vitest run src/services/session-manager/__tests__/
```

---

*Created: December 2024*
*Status: Refactoring complete (2139 → ~10 focused modules)*
