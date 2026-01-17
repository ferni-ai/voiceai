# E2E Integration Gaps - December 31, 2024

## Executive Summary

We've created comprehensive data layer infrastructure, but much of it is **not yet integrated** into the live voice agent flow. This document tracks what's created vs what's wired E2E.

---

## 🔴 NOT INTEGRATED (High Priority)

### 1. Session Lifecycle Hooks
**Created:** `src/services/session/session-lifecycle-hooks.ts`
**Status:** ❌ Not wired to voice agent

**Needs Integration In:**
- `src/agents/voice-agent/session-init-handler.ts` → call `onSessionStart()`
- `src/agents/voice-agent/turn-handler.ts` → call `onSessionHeartbeat()` periodically
- Session end handler → call `onSessionEnd()` with session data

**What This Enables:**
- Outreach suppression during sessions
- User presence tracking
- Correction context loading at session start
- Persona affinity updates at session end

---

### 2. User Corrections Memory
**Created:** `src/services/superhuman/user-corrections.ts`
**Status:** ❌ Not wired to turn handler

**Needs Integration In:**
- `src/agents/voice-agent/turn-handler.ts` → call `autoRecordCorrection()` after each user turn
- Session start → call `buildCorrectionContext()` and inject into LLM

**What This Enables:**
- "Never make the same mistake twice"
- Learning from user corrections
- Implicit preference detection

**Note:** Semantic router has its own correction system at `src/tools/semantic-router/learning/correction-store.ts` - may need to consolidate.

---

### 3. Persona Affinity Tracking
**Created:** `src/services/superhuman/persona-affinity.ts`
**Status:** ❌ Not wired to handoff logic

**Needs Integration In:**
- `src/tools/handoff/executor.ts` → call `recordHandoff()` after handoffs
- Session end → call `updateAffinityAfterSession()`
- Handoff decisions → call `shouldSuggestHandoff()` and `recommendPersona()`

**What This Enables:**
- Smart persona routing based on user-persona history
- Learning which personas work best for which topics
- Proactive handoff suggestions

---

### 4. Outreach History Tracking
**Created:** `src/services/outreach/outreach-history.ts`
**Status:** ❌ Not wired to outreach orchestrator

**Needs Integration In:**
- `src/services/outreach/outreach-orchestrator.ts` → call `recordOutreachAttempt()` on send
- `src/services/outreach/unified-outreach.ts` → check `shouldOutreach()` before sending
- Response handling → call `recordOutreachResponse()`

**What This Enables:**
- Learning optimal outreach patterns
- Channel effectiveness tracking
- User preference learning

---

### 5. Redis Real-Time Cache Methods
**Created in:** `src/memory/redis-cache.ts`
**Status:** ❌ Only called from session-lifecycle-hooks (which isn't integrated)

| Method | Should Be Called In |
|--------|---------------------|
| `setEmotionalState()` | Turn handler (after emotion detection) |
| `setVoiceBiomarker()` | Voice agent (after prosody analysis) |
| `setUserPresence()` | Session start/heartbeat |
| `suppressOutreach()` | Session end, after outreach sent |
| `isOutreachSuppressed()` | Before any outreach |
| `setPersonaAffinityCache()` | After affinity updates |

---

### 6. New Domain Hooks (Not Being Called)
**Created:** 8 new hook files

| Hook File | Status | Should Be Called From |
|-----------|--------|----------------------|
| `location-hooks.ts` | ❌ Not called | When user mentions favorite places |
| `pets-hooks.ts` | ❌ Not called | When user mentions pets |
| `property-hooks.ts` | ❌ Not called | Vehicle/home maintenance tools |
| `legal-hooks.ts` | ❌ Not called | Insurance/legal tools |
| `crisis-hooks.ts` | ❌ Not called | Crisis support tools |
| `learning-hooks.ts` | ❌ Not called | User corrections service |
| `outreach-history-hooks.ts` | ❌ Not called | Outreach history service |
| `persona-hooks.ts` | ❌ Not called | Persona affinity service |

**Note:** The hooks in `outreach-history.ts`, `user-corrections.ts`, and `persona-affinity.ts` DO call their respective hooks. But those services aren't integrated yet.

---

## 🟡 PARTIALLY INTEGRATED

### 1. Superhuman Services → Outreach Bridge
**Status:** ✅ Created, ⚠️ Hooks wired, ❌ Not tested in production

The bridge functions exist and are called from superhuman services, but:
- No E2E test with real Firestore
- Outreach orchestrator may not be fully processing the insights

### 2. Apple Health Sync
**Status:** ✅ Created, ✅ Tests pass, ⚠️ Needs iOS app integration testing

The backend is ready, but needs real device testing.

---

## ✅ FULLY INTEGRATED

| Feature | Status |
|---------|--------|
| Superhuman Session Priming | ✅ Context builder registered and loading |
| Trust System Hooks | ✅ Called from trust services |
| Better Than Human Hooks | ✅ Called from BTH services |
| Health Hooks | ✅ Called from Apple Health sync |
| Life Stage Hooks | ✅ Called from life stage tools |

---

## 🧪 MISSING TESTS

### E2E Tests Needed

1. **session-lifecycle-e2e.test.ts**
   - Session start sets presence
   - Session end clears presence + suppresses outreach
   - Correction context injected at start

2. **user-corrections-e2e.test.ts**
   - Auto-detect corrections from conversation
   - Corrections indexed to semantic memory
   - Correction context built for LLM

3. **persona-affinity-e2e.test.ts**
   - Affinity updates after session
   - Handoff preferences learned
   - Routing recommendations work

4. **outreach-history-e2e.test.ts**
   - Attempts recorded and indexed
   - Responses tracked
   - Should-outreach logic works

5. **redis-realtime-e2e.test.ts**
   - Presence tracking works
   - Emotional state caching works
   - Outreach suppression works

6. **new-domain-hooks-e2e.test.ts**
   - Location hooks index correctly
   - Pet hooks index correctly
   - Property hooks index correctly
   - etc.

---

## 📋 INTEGRATION PRIORITY

### Phase 1: Session Integration (Critical Path)
1. Wire `session-lifecycle-hooks` into voice agent
2. Add correction context to session start
3. Update persona affinity at session end

### Phase 2: Outreach Intelligence
1. Wire `outreach-history` into orchestrator
2. Check suppression before sending
3. Record responses

### Phase 3: Domain Tools
1. Create tools that call new domain hooks
2. Or detect from conversation and auto-capture

### Phase 4: Testing
1. Write E2E tests for all new services
2. Integration tests with Firestore emulator
3. Production smoke tests

---

## Files to Modify for Integration

| File | Changes Needed |
|------|----------------|
| `src/agents/voice-agent/session-init-handler.ts` | Import and call `sessionLifecycle.onStart()` |
| `src/agents/voice-agent/turn-handler.ts` | Call `autoRecordCorrection()`, periodic `onHeartbeat()` |
| `src/agents/voice-agent/session-end-handler.ts` | Call `sessionLifecycle.onEnd()` |
| `src/tools/handoff/executor.ts` | Call `personaAffinity.recordHandoff()` |
| `src/services/outreach/outreach-orchestrator.ts` | Call `outreachHistory.recordAttempt()` |
| `src/services/outreach/unified-outreach.ts` | Check `isUserAvailableForOutreach()` |

---

*Generated: December 31, 2024*
