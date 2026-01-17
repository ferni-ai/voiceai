# Handoff System - Clean Architecture

> **Status:** ✅ IMPLEMENTED - Phases 1, 2, 3 & 4 Complete
> **Author:** AI Assistant
> **Date:** January 2026
> **Tests:** 157/157 passing

## Phase 2 Complete: Unified Handoff Module

A new unified handoff module has been created at `src/handoff/`:

```
src/handoff/
├── index.ts          # Main entry point
├── unified-state.ts  # Single source of truth for all state
├── types.ts          # Consolidated type definitions
├── constants.ts      # All handoff timing constants
├── actions.ts        # High-level action functions
└── voice-id.ts       # Voice ID resolution re-exports
```

### New Import Path (Preferred)

```typescript
// NEW - Clean, unified imports
import {
  getHandoffState,
  getCurrentAgent,
  startHandoff,
  completeHandoff,
  isHandoffAllowed,
  resolveVoiceId,
  HANDOFF_TIMEOUT_MS,
} from '../handoff/index.js';
```

### Old Import Paths (Still Work - Deprecated)

```typescript
// OLD - Still works but deprecated
import { getHandoffSessionState } from '../agents/shared/handoff/session-state.js';
import { getCurrentAgent } from '../tools/handoff/state.js';
```

---

## Phase 3 & 4: Migration & Decommissioning

### Files Migrated to Unified Module

| File                                             | Change                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| `src/agents/voice-agent/data-channel-handler.ts` | Now uses `getCurrentAgent(sessionId)` from unified module |
| `src/speech/voice-manager/manager.ts`            | Now uses `handoffEvents` from unified module              |
| `src/agents/shared/handoff/event-handler.ts`     | Now uses `handoffEvents` from unified module              |
| `src/agents/shared/handoff/session-state.ts`     | Now re-exports from unified module                        |

### Files Kept as Legacy (Global State)

| File                                      | Reason                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `src/speech/voice-manager/dynamic-tts.ts` | Deprecated, uses global state intentionally                        |
| `src/tools/handoff/state.ts`              | Event emitters (`handoffEvents`, `cameoUnlockEvents`) still needed |

### Deprecation Notices Added

- `src/tools/handoff/state.ts` - Header updated with deprecation notice
- `src/tools/handoff/index.ts` - Header updated to recommend unified module

### Import Strategy

| Functionality                                    | Where to Import From                              |
| ------------------------------------------------ | ------------------------------------------------- |
| State management (sessionId required)            | `src/handoff/index.js`                            |
| Event bus (`handoffEvents`, `cameoUnlockEvents`) | `src/handoff/index.js` (re-exports from state.ts) |
| Tool building                                    | `src/tools/handoff/index.js`                      |
| Detection logic                                  | `src/tools/handoff/index.js`                      |
| Coordinator/Transaction                          | `src/tools/handoff/index.js`                      |
| Global state (deprecated)                        | `src/tools/handoff/state.js`                      |

---

## Problem Statement

The handoff system has evolved organically and now has significant duplication and overlap:

### Current State (BAD)

```
src/
├── agents/shared/handoff/           # 6 files - Agent-level coordination
│   ├── session-state.ts             # Queue, timeout, message seq
│   ├── coordinator-adapter.ts       # Adapter for coordinator
│   ├── event-handler.ts             # Event handling
│   ├── cached-modules.ts            # Module caching
│   └── types.ts                     # Types
│
├── tools/handoff/                   # 15+ files - Tool-level system
│   ├── session-state.ts             # DUPLICATE NAME! Agent state, history
│   ├── state.ts                     # GLOBAL state (deprecated)
│   ├── handoff-state-manager.ts     # Yet another state manager
│   ├── handoff-coordinator.ts       # Coordinator (another one!)
│   ├── event-sequencer.ts           # Event sequencing (overlap!)
│   ├── voice-id-resolver.ts         # Voice ID resolution
│   └── ...
│
├── services/handoff/                # 1 file - Service-level state
│   └── handoff-state.ts             # More state management
│
└── agents/multi-agent/              # Multi-agent orchestration
    ├── orchestrator.ts              # Room-level orchestration
    └── persona-agent-factory.ts     # Agent creation
```

### Issues

1. **Same name files in different directories** - `session-state.ts` exists in TWO places
2. **4+ state management systems** overlapping
3. **3+ coordinator systems** (coordinator-adapter, handoff-coordinator, orchestrator)
4. **Global vs session-scoped state confusion**
5. **No single source of truth for voice ID**
6. **Race conditions during handoffs** (greeting before session ready)

## Proposed Architecture (GOOD)

```
src/
└── handoff/                         # SINGLE unified module
    ├── index.ts                     # Public API exports only
    ├── types.ts                     # All handoff types
    │
    ├── state/                       # State management (ONE system)
    │   ├── session-state.ts         # Session-scoped state (primary)
    │   └── state-persistence.ts     # Firestore persistence
    │
    ├── voice/                       # Voice management (ONE system)
    │   ├── voice-resolver.ts        # Single source of voice ID truth
    │   └── voice-switcher.ts        # TTS voice switching
    │
    ├── coordination/                # Handoff orchestration (ONE system)
    │   ├── coordinator.ts           # Main coordinator
    │   ├── transaction.ts           # Atomic handoff transactions
    │   └── event-sequencer.ts       # Event ordering
    │
    └── tools/                       # LLM tool definitions
        ├── handoff-tools.ts         # Tool definitions
        └── tool-executor.ts         # Tool execution
```

## Migration Strategy

### Phase 1: Immediate Bug Fixes (This PR)

1. **Fix Peter not speaking** - Add timeout protection on tool loading
2. **Fix voice ID consistency** - Ensure voice ID flows correctly through handoff

### Phase 2: Consolidation (Future)

1. Create new `src/handoff/` module
2. Migrate code incrementally
3. Deprecate old locations with re-exports
4. Remove deprecated code after 2 sprints

### Phase 3: Cleanup (Future)

1. Remove all duplicate files
2. Update all imports
3. Final documentation

## Immediate Fixes (IMPLEMENTED ✅)

### Fix 1: Tool Loading Timeout During Handoffs ✅

**File:** `src/agents/multi-agent/agent-setup.ts`

The 22.9s tool loading blocked the handoff and caused Gemini session timeout.

```typescript
// Add timeout for handoffs
const HANDOFF_TOOL_TIMEOUT_MS = 3000; // 3s for handoffs (was 22.9s!)
const NORMAL_TOOL_TIMEOUT_MS = 10000; // 10s for initial startup

const toolsPromise = Promise.race([
  loadToolsInner(),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), toolTimeoutMs)),
]);
```

### Fix 2: Ensure Greeting Speaks ✅

**File:** `src/agents/multi-agent/orchestrator.ts`

```typescript
private async agentGreets(agent, previousPersonaId, request) {
  // Try coordinated speech first, fall back to direct session.say
  try {
    agent.say(textToSpeak, { allowInterruptions: false });
  } catch (sayError) {
    // Fallback: direct session speak
    const session = agent.session as { say?: Function };
    if (session?.say) {
      session.say(textToSpeak, { allowInterruptions: false });
    }
  }
}
```

### Fix 3: Voice ID Single Source of Truth ✅

**Files Updated:**

- `src/agents/shared/handoff/coordinator-adapter.ts`
- `src/agents/multi-agent/agent-setup.ts` (createPersonaTTS)
- `src/agents/shared/cameo-handler.ts` (3 locations)

```typescript
// ALWAYS use resolver - never trust passed voiceId directly
import { resolveVoiceId } from '../../tools/handoff/voice-id-resolver.js';

const voiceIdResult = resolveVoiceId({ personaId, voiceId }, { logLevel: 'info' });
const resolvedVoiceId = voiceIdResult.success ? voiceIdResult.voiceId : getVoiceId(personaId); // Emergency fallback
```

### Files Changed Summary

| File                           | Change                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `agent-setup.ts`               | Tool loading timeout + Voice ID resolver in createPersonaTTS |
| `orchestrator.ts`              | Greeting fallback to direct session.say                      |
| `coordinator-adapter.ts`       | Voice ID resolver in handleVoiceSwitch                       |
| `cameo-handler.ts`             | Voice ID resolver in 3 voice switch locations                |
| `unified-tool-orchestrator.ts` | Parallelized tool loading (earlier fix)                      |
| Turn timing files              | Reduced delays (earlier fix)                                 |

## Key Principles

1. **Session-scoped state only** - No global state, ever
2. **Single source of truth** - One place for each piece of data
3. **Fail-fast with graceful degradation** - Validate early, recover gracefully
4. **Transaction pattern** - Handoffs are atomic (commit or rollback)
5. **Event-driven** - Observable state changes for debugging

## Related Docs

- `docs/audits/AGENT-TRANSFER-BUGS-GAPS.md`
- `src/tools/handoff/voice-id-resolver.ts`
- `src/agents/multi-agent/orchestrator.ts`
