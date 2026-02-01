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
├── session-manager.ts           # Main orchestration (profile loading, services)
└── session-manager/
    ├── index.ts                 # Re-exports for external consumers
    │
    ├── # Core Infrastructure
    ├── access.ts                # Session access functions (getSession, clearAll)
    ├── cleanup.ts               # TTL and cleanup management
    ├── constants.ts             # Configuration constants
    ├── utils.ts                 # Utility functions (withTimeout)
    ├── validation.ts            # User ID validation
    │
    ├── # Session Lifecycle
    ├── engine-factory.ts        # Intelligence engine initialization
    ├── session-primer.ts        # Session priming for returning users
    ├── pre-session-briefing.ts  # Pre-session context briefing
    ├── session-warmup.ts        # Session warm-up optimization
    ├── session-lifecycle-hooks.ts # Lifecycle event hooks
    │
    ├── # Session End & Cleanup
    ├── end-session.ts           # Session end lifecycle
    ├── session-end-cleanup.ts   # Post-session cleanup tasks
    ├── session-summary.ts       # Session summary generation
    ├── summarization.ts         # Conversation summarization logic
    │
    ├── # State & Data
    ├── session-data-manager.ts  # Session data CRUD operations
    ├── state-persistence.ts     # State persistence to Firestore
    ├── humanizing-state.ts      # Humanization state tracking
    ├── session-variety-tracker.ts # Track conversation variety/freshness
    ├── tts-registry.ts          # TTS instance registry per session
    │
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

| Module | Purpose |
|--------|---------|
| `session-manager.ts` | Main orchestration, profile loading, SessionServices object |
| `index.ts` | Re-exports for external consumers |
| `access.ts` | Session access functions (getSession, clearAll, getActiveIds) |
| `cleanup.ts` | TTL and cleanup management |
| `constants.ts` | Configuration constants |
| `utils.ts` | Utility functions (withTimeout) |
| `validation.ts` | User ID validation |
| `engine-factory.ts` | Intelligence engine creation |
| `session-primer.ts` | Session priming, superhuman context |
| `pre-session-briefing.ts` | Pre-session context briefing |
| `session-warmup.ts` | Session warm-up optimization |
| `session-lifecycle-hooks.ts` | Lifecycle event hooks |
| `end-session.ts` | Session end lifecycle |
| `session-end-cleanup.ts` | Post-session cleanup tasks |
| `session-summary.ts` | Session summary generation |
| `summarization.ts` | Conversation summarization logic |
| `session-data-manager.ts` | Session data CRUD operations |
| `state-persistence.ts` | State persistence to Firestore |
| `humanizing-state.ts` | Humanization state tracking |
| `session-variety-tracker.ts` | Conversation variety/freshness tracking |
| `tts-registry.ts` | TTS instance registry per session |

**Total: 22 modules across core infrastructure, lifecycle, state, and cleanup**

---

## Usage Pattern

```typescript
// In session-manager.ts - profile loading is inline for userName support:
const userProfile = await global.store.getProfile(validatedUserId);
if (!userProfile) {
  userProfile = createUserProfile(validatedUserId, userName);
  await global.store.saveProfile(userProfile);
}

// Engine creation uses extracted module:
import { createSessionEngines } from './session-manager/engine-factory.js';
const engines = createSessionEngines({
  engineKey: userId || sessionId,
  sessionId,
  userProfile,
  isReturningUser,
});

// Session priming:
import { generateSessionPriming, buildSuperhumanMemoryContext } from './session-manager/session-primer.js';
const sessionPriming = await generateSessionPriming({ ... });
const superhumanContext = buildSuperhumanMemoryContext({ ... });

// Session end:
import { handleEndSession } from './session-manager/end-session.js';
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
├── engine-factory.test.ts
├── session-primer.test.ts
└── end-session.test.ts
```

Run tests:
```bash
pnpm vitest run src/services/session-manager/__tests__/
```

---

*Last updated: January 2026*
