# Speech Coordination System - Integration Status

> **Status: ✅ INTEGRATED - Full pipeline wired in and tested**

## Completed Integration (Dec 2024)

| Task | Status | Location |
|------|--------|----------|
| Coordinator attached to session | ✅ Done | `voice-agent-entry.ts` |
| Cleanup on session end | ✅ Done | `cleanupHandlers` array |
| Session integration helper | ✅ Done | `session-integration.ts` |
| Adaptive echo window | ✅ Done | `transcript-handler.ts` |
| Persona-aware acknowledgments | ✅ Done | `tool-call-sanitizer.ts` |
| Echo detection recording | ✅ Done | `transcript-handler.ts` |
| Firestore persistence | ✅ Done | `acknowledgment-persistence.ts` |
| Unit tests | ✅ Done | `__tests__/*.test.ts` |
| Integration tests | ✅ Done | `__tests__/integration.test.ts` |

---

## Remaining Migration Tasks (Non-Blocking)

## Critical Missing Pieces

### 1. 🔴 Coordinator Never Attached to Session

**Problem:** We call `getSpeechCoordinator()` but never `attachSession(session)`.

```typescript
// session-state-handler.ts - BROKEN
const coordinator = getSpeechCoordinator();
coordinator.onSpeechEnded(...); // This does nothing without attachSession!
```

**Fix needed in `voice-agent.ts` or `session-state-handler.ts`:**
```typescript
const coordinator = getSpeechCoordinator();
coordinator.attachSession(session); // MISSING!

// On cleanup:
coordinator.detachSession();
```

---

### 2. 🔴 82 Direct `session.say()` Calls Bypass Coordinator

**Problem:** We created a priority queue but nothing uses it.

| File | Direct `session.say()` calls |
|------|------------------------------|
| `music-handler.ts` | 9 |
| `data-channel-handler.ts` | 14 |
| `session-state-handler.ts` | 5 |
| `tool-call-sanitizer.ts` | 5 |
| `safe-generate-reply.ts` | 5 |
| ... | 44 more |

**Should be:**
```typescript
// Instead of:
session.say(text, { allowInterruptions: true });

// Use:
await coordinator.requestSpeak({
  text,
  priority: SpeechPriority.RESPONSE,
  source: 'llm',
  allowInterruptions: true,
});
```

---

### 3. 🔴 Old Acknowledgments Still Used

**Problem:** `tool-call-sanitizer.ts` still uses hardcoded `getSlowToolAcknowledgment()`.

```typescript
// Still in tool-call-sanitizer.ts:
const ack = getSlowToolAcknowledgment(jsonCall.fn); // ← Hardcoded!
controller.enqueue(`${ack} `);
```

**Should use:**
```typescript
import { generateAcknowledgment, isSlowTool } from '../../speech/coordination';

if (isSlowTool(jsonCall.fn)) {
  const ack = generateAcknowledgment({ personaId, toolId: jsonCall.fn });
  await coordinator.speakAcknowledgment(ack);
}
```

---

### 4. 🔴 StreamStateMachine Not Wired In

**Problem:** We created the state machine but `createSanitizerWithMusicFallback()` still uses:
- `let suppressMode = false`
- `let waitForMoreContext = false`
- `let jsonAccumulatorActive = false`
- Manual chunk counting

**Should replace with:**
```typescript
import { createStreamStateMachine } from '../../speech/coordination';

const fsm = createStreamStateMachine();

// In transform():
const result = fsm.processChunk(chunk);
if (result.suppress) return;
if (result.executeTool) {
  fsm.toolStarted(toolId, executePromise);
}
if (result.emit) {
  controller.enqueue(result.emit);
}
```

---

### 5. 🔴 CoordinatedToolExecutor Never Called

**Problem:** We created wrapper but tool execution still goes through old path.

**Current flow (broken):**
```
tool-call-sanitizer.ts
  └─→ executeJsonFunctionCall()
       └─→ session.say() OR safeGenerateReply() // Race condition!
```

**Should be:**
```
tool-call-sanitizer.ts
  └─→ executeToolWithCoordination()
       └─→ coordinator.speakToolResult() // Single path
```

---

### 6. 🔴 Echo Detection Never Recorded

**Problem:** `recordEchoDetection()` exists but nothing calls it.

**Need to add in transcript-handler.ts or VAD:**
```typescript
// When we detect agent audio picked up as user speech
coordinator.recordEchoDetection(timeSinceAgentStopped);
```

---

### 7. 🟡 Preference Learning Not Persisted

**Problem:** `userPreferences` is an in-memory Map. Lost on restart.

```typescript
// persona-acknowledgments.ts
const userPreferences = new Map<string, UserAcknowledgmentPreferences>();
```

**Should persist to Firestore:**
```typescript
// On learn:
await saveAcknowledgmentPreferences(userId, prefs);

// On session start:
const prefs = await loadAcknowledgmentPreferences(userId);
```

---

### 8. 🟡 Persona Acknowledgments Don't Load from Bundles

**Problem:** We have `DEFAULT_ACKNOWLEDGMENTS` hardcoded, not loaded from persona bundles.

```typescript
// Currently:
const personaAcks = DEFAULT_ACKNOWLEDGMENTS[personaId] || DEFAULT_ACKNOWLEDGMENTS.ferni;

// Should load:
const bundleAcks = await loadPersonaBehavior(personaId, 'acknowledgments');
const personaAcks = bundleAcks || DEFAULT_ACKNOWLEDGMENTS[personaId];
```

---

### 9. 🟡 No Tests

| Test Type | Status |
|-----------|--------|
| Unit tests for SpeechCoordinator | ❌ Missing |
| Unit tests for StreamStateMachine | ❌ Missing |
| Unit tests for PersonaAcknowledgments | ❌ Missing |
| Integration tests | ❌ Missing |
| E2E voice test | ❌ Missing |

---

### 10. 🟡 No Cleanup on Session End

**Problem:** Coordinator singleton could hold stale references.

**Need in session cleanup:**
```typescript
// In session cleanup handler
coordinator.detachSession();
resetSpeechCoordinator(); // If creating per-session coordinators
```

---

## What Actually Works Right Now

| Component | Status |
|-----------|--------|
| Adaptive echo window calculation | ✅ Working (used in session-state-handler) |
| Echo window learning | ❌ No data fed to it |
| Speech priority queue | ❌ Nothing routes through it |
| Tool timing learning | ❌ Nothing records timings |
| Persona acknowledgments | ❌ Not called |
| Stream state machine | ❌ Not wired in |
| Tool execution wrapper | ❌ Not called |

---

## Required Integration Work

### Priority 1: Wire Up Coordinator

```typescript
// voice-agent.ts or session-state-handler.ts
const coordinator = getSpeechCoordinator();
coordinator.attachSession(session);

// Replace ALL session.say() with coordinator.requestSpeak()
```

### Priority 2: Replace Sanitizer Internals

```typescript
// tool-call-sanitizer.ts
// Replace boolean flags with StreamStateMachine
// Replace getSlowToolAcknowledgment with generateAcknowledgment
// Route tool results through coordinator
```

### Priority 3: Add Echo Detection Recording

```typescript
// transcript-handler.ts
// When we detect potential echo
coordinator.recordEchoDetection(delay);
```

### Priority 4: Tests

```bash
# Create test files
src/speech/coordination/__tests__/speech-coordinator.test.ts
src/speech/coordination/__tests__/stream-state-machine.test.ts
src/speech/coordination/__tests__/persona-acknowledgments.test.ts
```

### Priority 5: Persistence

```typescript
// Save/load user acknowledgment preferences to Firestore
// Load persona acknowledgments from bundles
```

---

## Time Estimate

| Task | Hours |
|------|-------|
| Wire coordinator + replace 82 session.say() | 4-6 |
| Replace sanitizer with state machine | 2-3 |
| Add echo detection recording | 1 |
| Persistence layer | 2 |
| Unit tests | 3-4 |
| Integration tests | 2-3 |
| E2E validation | 2 |
| **Total** | **16-21 hours** |

---

## Conclusion

We built the **architecture** but not the **integration**. The code is correct but isolated - it's like building a new engine and leaving it on the workbench instead of installing it in the car.

**Current state:** ~20% complete (architecture done, integration not started)

