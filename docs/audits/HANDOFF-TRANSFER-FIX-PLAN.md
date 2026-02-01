# Handoff/Transfer System Fix Plan

> **Analysis Date:** December 21, 2025
> **Severity:** Critical
> **Impact:** Voice and UI transfers failing, identity confusion, state desync

---

## Executive Summary

The handoff system has **6 major issue categories** with **72+ documented FIX BUG comments** across 28 files. The root causes are:

1. **Dual state systems** (global vs session-scoped) that aren't synchronized
2. **Race conditions** in event ordering
3. **Complex voice ID extraction** with silent failure modes
4. **No transactional guarantees** - partial failures leave system in broken state

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (apps/web/)                                            │
│  handoff.service.ts → Sends handoff_request, handles responses  │
│  app.ts → Callback handlers for UI updates                      │
│  team.ui.ts → Team roster visual transitions                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Data Channel (WebRTC)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ VOICE AGENT (src/agents/)                                       │
│  data-channel-handler.ts → Receives handoff_request             │
│  handoff-handler.ts → Executes voice switch, sends events       │
│  voice-agent-entry.ts → VoiceAgent reference management         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ HANDOFF CORE (src/tools/handoff/)                              │
│  executor.ts → Main handoff execution logic                     │
│  state.ts → GLOBAL state (PROBLEM - shared across sessions)     │
│  session-state.ts → Session-scoped state (partial adoption)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Issue Details

### 🔴 ISSUE 1: State Desynchronization (CRITICAL)

**Files:**
- `src/tools/handoff/state.ts` (global state)
- `src/tools/handoff/session-state.ts` (session state)
- `src/tools/handoff/executor.ts` (updates both inconsistently)
- `src/agents/shared/handoff-handler.ts` (updates session only)

**Problem:** Two state systems exist and aren't kept in sync:

```typescript
// executor.ts updates BOTH:
if (sessionState) {
  setSessionCurrentAgent(sessionState, canonicalTargetId);  // Session
}
setCurrentAgent(canonicalTargetId);  // Global

// But handoff-handler.ts only updates session:
services.handoffState.currentAgent = persona.id;  // Session-scoped only
// Global state NOT updated here - DESYNC!
```

**Symptoms:**
- Cross-session contamination (User A's handoff affects User B)
- `getCurrentAgent()` returns wrong persona after handoffs
- Identity confusion in LLM context

**Fix:**
```typescript
// NEW: src/tools/handoff/handoff-state-manager.ts
export class HandoffStateManager {
  private static instances = new Map<string, HandoffStateManager>();
  
  static getForSession(sessionId: string): HandoffStateManager {
    if (!this.instances.has(sessionId)) {
      this.instances.set(sessionId, new HandoffStateManager(sessionId));
    }
    return this.instances.get(sessionId)!;
  }
  
  setCurrentAgent(agent: AgentId): void {
    // Single source of truth - no global state
    this.currentAgent = agent;
    this.events.emit('agentChanged', { agent, sessionId: this.sessionId });
  }
}

// Remove: Global state in state.ts
// Migrate: All consumers to use HandoffStateManager.getForSession()
```

---

### 🔴 ISSUE 2: Event Ordering Race Conditions (HIGH)

**Files:**
- `apps/web/src/services/handoff.service.ts` (lines 423-467)
- `src/agents/shared/handoff-handler.ts` (multiple sends)

**Problem:** Events arrive out of order:

Expected: `handoff_started` → `soft_open_complete` → `handoff_complete`

Reality: `soft_open_complete` sometimes arrives BEFORE `handoff_started`

```typescript
// Frontend workaround (handoff.service.ts:428)
if (this._handoffPhase !== 'started') {
  log.warn('Received soft_open_complete before handoff_started - queueing...');
  this._pendingSoftOpenCallback = pendingCallback;
  // 5 second timeout as fallback
}
```

**Fix:**
```typescript
// 1. Add sequence numbers to ALL handoff events
interface HandoffEvent {
  seq: number;  // Monotonically increasing per session
  handoffId: string;  // Correlation ID
  type: string;
  timestamp: number;
}

// 2. Frontend should reorder based on seq, not arrival time
class HandoffEventBuffer {
  private buffer: Map<number, HandoffEvent> = new Map();
  private lastProcessed: number = -1;
  
  receive(event: HandoffEvent): HandoffEvent[] {
    this.buffer.set(event.seq, event);
    return this.drainInOrder();
  }
  
  private drainInOrder(): HandoffEvent[] {
    const events: HandoffEvent[] = [];
    while (this.buffer.has(this.lastProcessed + 1)) {
      const next = this.buffer.get(this.lastProcessed + 1)!;
      this.buffer.delete(this.lastProcessed + 1);
      this.lastProcessed++;
      events.push(next);
    }
    return events;
  }
}

// 3. Backend should guarantee event ordering with promises
async function executeHandoff() {
  // Wait for each event to be acknowledged before sending next
  await sendEventWithAck('handoff_started');
  await speakBanterWithAck();
  await sendEventWithAck('soft_open_complete');
  await switchVoiceWithAck();
  await sendEventWithAck('handoff_complete');
}
```

---

### 🔴 ISSUE 3: Voice ID Resolution Failures (HIGH)

**Files:**
- `src/agents/shared/handoff-handler.ts` (lines 570-628)
- `src/tools/handoff/types.ts`

**Problem:** Voice ID extraction has 4 different paths:

```typescript
// Path 1: From event data (top-level)
voiceIdFromEvent = (data as { voiceId?: string }).voiceId;

// Path 2: From persona.voice.voiceId (PersonaConfig)
const personaVoiceId = persona.voice?.voiceId;

// Path 3: From persona.voiceId (HandoffPersona)
const personaVoiceId = persona.voiceId;

// Path 4: Lookup from registry (fallback)
voiceId = getVoiceId(canonicalTargetId);
```

If ALL fail: "User will hear wrong voice" - silent corruption!

**Fix:**
```typescript
// NEW: src/tools/handoff/voice-id-resolver.ts
export function resolveVoiceId(
  handoffData: HandoffEventPayload,
  fallbackRegistry = true
): { voiceId: string; source: string } | { error: string } {
  
  // Ordered resolution with logging
  const sources = [
    { name: 'event.voiceId', value: (handoffData as any).voiceId },
    { name: 'persona.voice.voiceId', value: handoffData.persona?.voice?.voiceId },
    { name: 'persona.voiceId', value: handoffData.persona?.voiceId },
  ];
  
  for (const { name, value } of sources) {
    if (value && typeof value === 'string') {
      log.debug({ source: name, voiceId: value }, 'Voice ID resolved');
      return { voiceId: value, source: name };
    }
  }
  
  // Registry fallback
  if (fallbackRegistry && handoffData.persona?.id) {
    try {
      const voiceId = getVoiceId(handoffData.persona.id);
      if (voiceId) {
        return { voiceId, source: 'registry' };
      }
    } catch (e) {
      // Fall through to error
    }
  }
  
  return { error: `No voice ID found for ${handoffData.persona?.id}` };
}

// USAGE in handoff-handler.ts:
const voiceResult = resolveVoiceId(data);
if ('error' in voiceResult) {
  // FAIL FAST - don't proceed with wrong voice
  throw new HandoffError(voiceResult.error, { 
    code: 'NO_VOICE_ID',
    fatal: true 
  });
}
```

---

### 🔴 ISSUE 4: Identity Confusion After Handoff (HIGH)

**Files:**
- `src/agents/shared/handoff-handler.ts` (lines 997-1084)
- `src/tools/handoff/state.ts` (cached context)

**Problem:** After handoff completes, the LLM sometimes has wrong identity:

```typescript
// Post-handoff validation often fails:
const isConsistent =
  validation.currentAgentTracker === persona.id &&
  validation.voiceAgentPersona === persona.id &&
  validation.llmInstructionsSet;

if (!isConsistent) {
  logger.warn('⚠️ HANDOFF IDENTITY MISMATCH - Attempting recovery...');
  // Recovery can fail too!
}
```

**Fix:**
```typescript
// 1. Pre-handoff: Verify all required data exists
async function validateHandoffPreconditions(targetId: string): Promise<Result<void, string>> {
  const persona = await getPersonaAsync(targetId);
  if (!persona) return err('Persona not found');
  if (!persona.systemPrompt) return err('Missing system prompt');
  if (!resolveVoiceId({ persona }).voiceId) return err('Missing voice ID');
  return ok(undefined);
}

// 2. Atomic handoff with rollback
class HandoffTransaction {
  private rollbackActions: Array<() => Promise<void>> = [];
  
  async execute<T>(action: () => Promise<T>, rollback: () => Promise<void>): Promise<T> {
    this.rollbackActions.push(rollback);
    return action();
  }
  
  async rollback(): Promise<void> {
    // Execute rollbacks in reverse order
    for (const action of this.rollbackActions.reverse()) {
      await action();
    }
  }
}

// 3. Use transaction pattern
async function executeHandoff(target: string) {
  const tx = new HandoffTransaction();
  
  try {
    // Save current state for rollback
    const previousAgent = getCurrentAgent();
    const previousInstructions = voiceAgent.instructions;
    
    // Step 1: Update state (with rollback)
    await tx.execute(
      () => setCurrentAgent(target),
      () => setCurrentAgent(previousAgent)
    );
    
    // Step 2: Switch voice (with rollback)
    await tx.execute(
      () => switchVoice(target),
      () => switchVoice(previousAgent)
    );
    
    // Step 3: Update LLM (with rollback)
    await tx.execute(
      () => voiceAgent.setPersona(newPersona),
      () => voiceAgent.setInstructions(previousInstructions)
    );
    
    // Verify consistency
    if (!validateIdentityConsistency(target)) {
      throw new Error('Post-handoff validation failed');
    }
    
    return { success: true };
    
  } catch (error) {
    await tx.rollback();
    return { success: false, error };
  }
}
```

---

### 🟡 ISSUE 5: Timeout Configuration Chaos (MEDIUM)

**Problem:** Multiple timeouts at different layers aren't coordinated:

| Timeout | Value | Location |
|---------|-------|----------|
| `HANDOFF_TIMEOUT_MS` | 8000ms | `session-state.ts` |
| `BANTER_TIMEOUT_MS` | 5000ms | `handoff-handler.ts` |
| `PENDING_SOFT_OPEN_TIMEOUT_MS` | 5000ms | `handoff.service.ts` |
| Voice switch retry delay | 100ms | `handoff-handler.ts` |
| Frontend handoff timeout | Env var | `handoff.service.ts` |

**Fix:**
```typescript
// NEW: src/config/handoff-timing.ts (centralize ALL timeouts)
export const HANDOFF_TIMING = {
  // Overall handoff timeout
  TOTAL_TIMEOUT_MS: 10000,
  
  // Phase timeouts (must sum to less than TOTAL_TIMEOUT_MS)
  SOFT_OPEN_TIMEOUT_MS: 3000,
  VOICE_SWITCH_TIMEOUT_MS: 2000,
  GREETING_TIMEOUT_MS: 3000,
  
  // Retry configuration
  VOICE_SWITCH_RETRY_DELAY_MS: 100,
  VOICE_SWITCH_MAX_RETRIES: 2,
  
  // Debounce
  DEBOUNCE_MS: 800,
  
  // Rate limiting
  MAX_HANDOFFS_PER_MINUTE: 15,
} as const;

// Both frontend and backend import from same source
```

---

### 🟡 ISSUE 6: Rate Limiting Asymmetry (MEDIUM)

**Problem:** Frontend and backend have separate, uncoordinated rate limiting.

**Fix:**
```typescript
// Backend should be source of truth for rate limiting
// Frontend should just debounce rapid clicks

// Backend response includes rate limit info:
{
  type: 'handoff_acknowledged',
  success: false,
  error: 'rate_limited',
  retryAfterMs: 350,  // Tell frontend when to retry
}

// Frontend honors backend rate limit
if (response.error === 'rate_limited') {
  showCooldownUI(response.retryAfterMs);
  setTimeout(() => enableHandoff(), response.retryAfterMs);
}
```

---

## Implementation Priority

### Phase 1: Stop the Bleeding (1-2 days)
1. **Add pre-handoff validation** - Fail fast if voice ID missing
2. **Fix voice ID resolution** - Single extraction point
3. **Add handoff tracing** - Connect frontend/backend metrics

### Phase 2: State Unification (3-4 days)
1. **Create HandoffStateManager** - Session-scoped only
2. **Migrate all consumers** - Remove global state
3. **Add state change events** - For debugging

### Phase 3: Reliability (3-4 days)
1. **Implement event sequencing** - Guaranteed order
2. **Add transactional pattern** - Atomic commit/rollback
3. **Centralize timeouts** - Single config source

### Phase 4: Testing & Monitoring (2-3 days)
1. **E2E handoff tests** - All flows
2. **Chaos testing** - Network delays, failures
3. **Dashboard** - Real-time handoff health

---

## Files to Modify

### High Priority
| File | Changes |
|------|---------|
| `src/tools/handoff/executor.ts` | Pre-validation, single voice ID source |
| `src/agents/shared/handoff-handler.ts` | Transaction pattern, better recovery |
| `src/tools/handoff/state.ts` | Deprecate global state |
| `apps/web/src/services/handoff.service.ts` | Event buffering, honor backend rate limits |

### Medium Priority
| File | Changes |
|------|---------|
| `src/tools/handoff/session-state.ts` | Promote to primary state source |
| `src/config/handoff-timing.ts` | Centralize all timeouts |
| `src/services/handoff-metrics.ts` | (removed - metrics now handled elsewhere) |

### New Files
| File | Purpose |
|------|---------|
| `src/tools/handoff/voice-id-resolver.ts` | Single voice ID extraction |
| `src/tools/handoff/handoff-transaction.ts` | Atomic handoff pattern |
| `src/tools/handoff/event-sequencer.ts` | Guaranteed event ordering |
| `apps/web/src/services/handoff-event-buffer.ts` | Frontend event reordering |

---

## Testing Strategy

### Unit Tests
```typescript
// src/tools/handoff/__tests__/voice-id-resolver.test.ts
describe('VoiceIdResolver', () => {
  it('should resolve from event.voiceId first');
  it('should fallback to persona.voice.voiceId');
  it('should fallback to persona.voiceId');
  it('should fallback to registry');
  it('should return error if all sources fail');
});
```

### Integration Tests
```typescript
// src/tests/handoff-flow.test.ts
describe('Handoff Flow', () => {
  it('should complete ferni → peter handoff');
  it('should handle out-of-order events');
  it('should rollback on voice switch failure');
  it('should handle concurrent handoff requests');
  it('should recover from LLM instruction update failure');
});
```

### E2E Tests
```typescript
// e2e/handoff.spec.ts
describe('Handoff E2E', () => {
  it('should switch persona via UI click');
  it('should switch persona via voice command');
  it('should handle rapid persona switches');
  it('should recover from network interruption during handoff');
});
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Handoff success rate | Unknown | >99% |
| Avg handoff duration | Unknown | <2s |
| Identity consistency post-handoff | ~90%? | 100% |
| Voice ID resolution failures | Happening | 0 |
| Cross-session contamination | Happening | 0 |

---

## References

- `docs/architecture/AGENT-TRANSFER-BUGS-GAPS.md` - Previous audit
- `src/services/handoff-metrics.ts` - Backend metrics (removed)
- `apps/web/src/services/handoff-diagnostics.service.ts` - Frontend diagnostics
- `src/config/handoff-timing.ts` - Timing constants


