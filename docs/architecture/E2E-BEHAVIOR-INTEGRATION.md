# E2E Behavior System Integration

## Architecture Review - December 2024

This document reviews the end-to-end integration of the Bidirectional Behavior System and identifies gaps in the critical path.

---

## 🏗️ Current Architecture

### Critical Path Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VOICE AGENT (Backend)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User speaks → Audio Analysis → turn-handler.ts                             │
│                                      │                                      │
│                    ┌─────────────────┼─────────────────┐                    │
│                    ▼                 ▼                 ▼                    │
│            TurnProcessor    behavior-event-    emotion-event-               │
│                             dispatcher.ts      dispatcher.ts                │
│                    │                 │                 │                    │
│                    │     [SYSTEM_EVENT]        humanization_signal          │
│                    │         ▼                       ▼                      │
│                    ▼    LLM Context         sendDataMessage()               │
│             LLM Inference       │                    │                      │
│                    │            │                    │                      │
│                    ▼            ▼                    │                      │
│          LLM Response   LLM may call:               │                      │
│                         - shiftMode()               │                      │
│                         - processing()              │                      │
│                         - holdSpace()               │                      │
│                         - expressPresence()         │                      │
│                         - adjustPacing()            │                      │
│                                │                    │                      │
│                                ▼                    │                      │
│                    behavior/index.ts                │                      │
│                    (tool execution)                 │                      │
│                                │                    │                      │
│                                ▼                    ▼                      │
│                    ❌ GAP: NOT CALLING    ✅ Sends to frontend              │
│                    emitBehaviorSignal()                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (apps/web)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    data-message-handlers.ts                                 │
│                              │                                              │
│          ┌───────────────────┼───────────────────┐                         │
│          ▼                   ▼                   ▼                         │
│   behavior_signal      humanization        mood/emotion                    │
│          │                signal                                           │
│          ▼                                                                 │
│   behavior-signal.service.ts                                               │
│          │                                                                 │
│          ├── ferni:behavior-mode-change                                    │
│          ├── ferni:behavior-pacing-change                                  │
│          ├── ferni:behavior-expression                                     │
│          ├── ferni:behavior-hold-space                                     │
│          └── ferni:eq-* (Ferni EQ events)                                  │
│                    │                                                        │
│                    ▼                                                        │
│          better-than-human.ui.ts                                           │
│          avatar-feedback.ui.ts                                             │
│          waveform.ui.ts                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Integration Status

### ✅ Working

| Component | File | Status |
|-----------|------|--------|
| Behavior Event Detection | `behavior-event-dispatcher.ts` | ✅ Detects events |
| Event Injection to LLM | `turn-handler.ts` | ✅ Injects [SYSTEM_EVENT] |
| Behavior Tools Definition | `tools/domains/behavior/index.ts` | ✅ Tools defined |
| Frontend Signal Service | `behavior-signal.service.ts` | ✅ Ready to receive |
| Frontend Message Handler | `data-message-handlers.ts` | ✅ Routes signals |
| Better Than Human UI | `better-than-human.ui.ts` | ✅ Handles events |
| ProcessingIntelligence | `processing-intelligence.ts` | ✅ Context-aware phrases |

### ❌ Gaps Identified

| Gap | Impact | Priority |
|-----|--------|----------|
| **Behavior tools don't emit to frontend** | LLM calls tool but avatar doesn't react | 🔴 HIGH |
| **AliveOrchestrator disconnected** | Music/game features not integrated | 🟡 MEDIUM |
| **Advanced humanization JSONs unused** | Rich persona behaviors not loaded | 🟡 MEDIUM |
| **No automatic behavior dispatch from events** | Detected events don't trigger avatar | 🔴 HIGH |

---

## 🔧 Gap Analysis & Fixes

### Gap 1: Behavior Tools Don't Emit to Frontend

**Problem:** When LLM calls `shiftMode()`, `processing()`, etc., the tool executes but doesn't send a signal to the frontend. The avatar never knows to change its expression.

**Location:** `src/tools/domains/behavior/index.ts`

**Current Flow:**
```
LLM calls shiftMode({mode: "presence"}) 
  → tool executes 
  → returns {success: true, ssml: "..."}
  → ❌ Frontend never notified
```

**Required Fix:**
```typescript
// In behavior tools, after execution:
const signal = createModeShiftSignal(mode, reason);

// Need to emit to frontend
if (ctx.sendDataMessage) {
  await emitBehaviorSignal(signal, ctx.sendDataMessage);
}
```

**Challenge:** Tool context (`ctx`) doesn't have `sendDataMessage`. Need to wire it through.

---

### Gap 2: Detected Events Don't Auto-Dispatch to Frontend

**Problem:** `dispatchBehaviorEvents()` in turn-handler.ts detects events and injects them into LLM context, but doesn't send suggested responses to frontend for immediate visual feedback.

**Location:** `src/agents/voice-agent/turn-handler.ts` lines 648-660

**Current Flow:**
```
Voice tremor detected 
  → [SYSTEM_EVENT] injected to LLM 
  → LLM MAY respond with empathy
  → ❌ Avatar doesn't immediately show concern
```

**Required Fix:** After detecting events with suggested responses, emit signals to frontend:
```typescript
const behaviorEvents = dispatchBehaviorEvents(behaviorContext, injectMessage);

// NEW: Also emit to frontend for immediate visual feedback
for (const event of behaviorEvents) {
  if (event.suggestedResponse?.mode) {
    await sendDataMessage('behavior_signal', {
      type: 'mode_shift',
      mode: event.suggestedResponse.mode,
      reason: event.event,
    });
  }
}
```

---

### Gap 3: AliveOrchestrator Not Integrated

**Problem:** `AliveOrchestrator` handles "Ferni feels alive" features (music offers, personality insights, game milestones) but is completely separate from the behavior system.

**Location:** `src/services/alive-orchestrator.ts`

**Opportunity:** AliveOrchestrator's `AliveEvent` could trigger behavior modes:
- `voice_music_offer` → `shiftMode("exploration")`
- `game_milestone` → `shiftMode("celebration")`
- User emotion detected → behavior mode shift

---

### Gap 4: Advanced Humanization JSONs Unused

**Problem:** Rich persona-specific behavior patterns exist in `advanced-humanization.json` files but aren't being loaded or used.

**Files:**
- `src/personas/bundles/nayan-patel/content/behaviors/advanced-humanization.json`
- `src/personas/bundles/maya-santos/content/behaviors/advanced-humanization.json`
- `src/personas/bundles/alex-chen/content/behaviors/advanced-humanization.json`
- etc.

**Content includes:**
- Subtext responses (deflection, minimizing, testing waters)
- Emotional aftercare (holding, integrating, grounding)
- Hope injection (possibility anchors, reframing)
- Energy regulation (matching low, leading up)
- Micro affirmations (acknowledgments, validations)
- Paradoxical interventions

**Opportunity:** Wire these into the personality system to use when behavior modes shift.

---

## 📋 Integration Action Plan

### Phase 1: Close the Loop (High Priority)

1. **Wire `sendDataMessage` to behavior tool context**
   - Update `ToolContext` type to include optional `sendDataMessage`
   - Pass it from turn-handler when creating tools

2. **Emit behavior signals from behavior tools**
   - Update each tool (`shiftMode`, `processing`, etc.) to emit signals

3. **Auto-emit from detected events**
   - When `dispatchBehaviorEvents` finds events with suggested responses, emit to frontend

### Phase 2: Integrate Systems (Medium Priority)

4. **Connect AliveOrchestrator to behavior system**
   - On `AliveEvent`, emit appropriate behavior signals
   - Share voice analysis data between systems

5. **Load advanced humanization JSONs**
   - Create loader for advanced-humanization.json
   - Wire into personality context assembler

### Phase 3: Enhance (Lower Priority)

6. **Add behavior event listeners in frontend**
   - `better-than-human.ui.ts` should respond to all behavior events
   - Add visual feedback for each mode

7. **Test e2e flow**
   - Test: User shares vulnerability → system detects → LLM shifts mode → avatar shows empathy
   - Test: LLM calls processing() → frontend shows thinking animation

---

## 🧪 Testing Checklist

### Manual E2E Tests

- [ ] Share something heavy → Avatar shows "holding space" mode
- [ ] Stay silent for 15 seconds → Avatar shows "presence" mode  
- [ ] Voice tremor detected → Avatar shows concern
- [ ] Late night conversation → Pacing slows automatically
- [ ] LLM calls `processing()` → Avatar shows thinking animation
- [ ] LLM calls `shiftMode("celebration")` → Avatar shows joy

### Automated Tests

- [x] ProcessingIntelligence unit tests (16 tests)
- [x] Behavior event dispatcher tests (26 tests)
- [x] Behavior tools tests (23 tests)
- [ ] Integration test: Turn → Events → Frontend signal
- [ ] Integration test: Tool call → Frontend signal

---

## 📁 Key Files Reference

| Purpose | File |
|---------|------|
| Turn Processing | `src/agents/voice-agent/turn-handler.ts` |
| Behavior Detection | `src/agents/realtime/behavior-event-dispatcher.ts` |
| Behavior Tools | `src/tools/domains/behavior/index.ts` |
| Processing Phrases | `src/intelligence/processing-intelligence.ts` |
| Alive Features | `src/services/alive-orchestrator.ts` |
| Frontend Service | `apps/web/src/services/behavior-signal.service.ts` |
| Frontend Handler | `apps/web/src/app/data-message-handlers.ts` |
| EQ System | `apps/web/src/ui/better-than-human.ui.ts` |
| Advanced Behaviors | `src/personas/bundles/*/content/behaviors/advanced-humanization.json` |

---

## Next Steps

1. **Implement Gap 1 fix** - Wire sendDataMessage to tool context
2. **Implement Gap 2 fix** - Auto-emit from detected events
3. **Test e2e** - Verify signals flow from backend to frontend avatar
4. **Document** - Update BIDIRECTIONAL-BEHAVIOR-SYSTEM.md with findings

