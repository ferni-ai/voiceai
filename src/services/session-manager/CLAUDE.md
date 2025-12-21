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
├── session-manager.ts           # Main entry (needs further splitting)
└── session-manager/
    ├── access.ts                # Session access functions (getSession, clearAll)
    ├── cleanup.ts               # TTL and cleanup management
    ├── constants.ts             # Configuration constants
    ├── utils.ts                 # Utility functions (withTimeout)
    ├── validation.ts            # User ID validation
    └── CLAUDE.md                # This file
```

---

## Refactoring Plan: session-manager.ts

**Current state:** 2,139 lines - too large for maintainability

**Already extracted:**
- ✅ `access.ts` - getSession, clearAll, getActiveIds, getActiveCount
- ✅ `cleanup.ts` - startSessionCleanup, stopSessionCleanup
- ✅ `constants.ts` - MAX_HUMANIZING_UPDATES, SUMMARIZE_TIMEOUT_MS
- ✅ `utils.ts` - withTimeout helper
- ✅ `validation.ts` - validateUserId

**Target:** Continue splitting `createSessionServices()` into focused modules.

### Phase 1: Profile Management (extract)
- [ ] `profile-loader.ts` - User profile loading/creation, intelligence state loading
  - Lines: ~100
  - Dependencies: store, realtimeMemory, cross-persona insights

### Phase 2: Engine Initialization (extract)
- [ ] `engine-factory.ts` - Create all intelligence engines
  - Lines: ~150
  - Dependencies: emotion detector, pattern analyzer, journey tracker, etc.

### Phase 3: Session Priming (extract)
- [ ] `session-primer.ts` - Build priming context for returning users
  - Lines: ~200
  - Dependencies: memory index, priming memories, conversation summaries

### Phase 4: Method Implementations (extract)
- [ ] `session-methods.ts` - analyze, addTurn, getSpeechContext, etc.
  - Lines: ~800
  - Dependencies: engines, profile, memory

### Phase 5: Main Orchestration (keep in session-manager.ts)
- `createSessionServices()` - ~400 lines (orchestrates all the above)
- Initialization and cleanup hooks

---

## Extraction Pattern

Follow the existing module patterns:

```typescript
// profile-loader.ts
import type { UserProfile } from '../../types/user-profile.js';
import type { GlobalServices } from './types.js';

export async function loadOrCreateProfile(
  userId: string | undefined,
  global: GlobalServices
): Promise<{ profile: UserProfile | null; isReturning: boolean }> {
  // Implementation
}

// session-manager.ts
import { loadOrCreateProfile } from './session-manager/profile-loader.js';

// In createSessionServices():
const { profile, isReturning } = await loadOrCreateProfile(userId, global);
```

---

## Key Exports

From main session-manager.ts:
```typescript
export { createSessionServices } from './session-manager.js';
export { getSessionServices, clearAllSessions, ... } from './session-manager/access.js';
export { startSessionCleanup, stopSessionCleanup } from './session-manager/cleanup.js';
```

---

## Testing

Each extracted module should have its own test file:
```
session-manager/__tests__/
├── profile-loader.test.ts
├── engine-factory.test.ts
├── session-primer.test.ts
└── session-methods.test.ts
```

---

*Created: December 2024*
*Status: Partial extraction complete, refactoring in progress*
