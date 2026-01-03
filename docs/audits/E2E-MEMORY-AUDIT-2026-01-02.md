# 🔴 E2E Memory System Audit - January 2, 2026

> **Status**: CRITICAL ISSUES FOUND
> **Auditor**: Claude
> **Scope**: Full conversation flow from speech to persistent memory

---

## Executive Summary

**Ferni's memory is severely broken.** After 322 conversations, Ferni has learned essentially nothing about the user. This audit discovered 4 critical bugs and 3 secondary issues in the end-to-end memory pipeline.

### Impact
- ❌ User turns are never persisted (only assistant turns)
- ❌ Learning engine never receives user data
- ❌ Summaries are empty ("Brief conversation")
- ❌ User identity was fragmented across 165 orphaned profiles
- ❌ No emotional patterns, key moments, or topics extracted

---

## 🔴 CRITICAL BUGS

### BUG-001: User Turns Never Recorded in Voice Agent
**Severity**: 🔴 CRITICAL  
**File**: `src/agents/voice-agent/transcript-handler.ts`

**Problem**: The voice agent processes user transcripts but **never calls `services.addTurn('user', transcript)`**. Only assistant turns are recorded.

**Evidence**:
```typescript
// Line 893-894 - ONLY assistant turns added:
if (services && typeof services.addTurn === 'function') {
  services.addTurn('assistant', cached.response);  // ✅ Assistant
}

// MISSING - nowhere in file:
// services.addTurn('user', event.transcript);  // ❌ Never called!
```

**Impact**:
- Turns persisted: 8 (all assistant) vs 322 conversations
- User speech is processed but never stored
- Learning engine never receives user content
- Summaries have no user data to analyze

**Fix Location**: `processFinalTranscript()` in `transcript-handler.ts` ~line 1065

**Fix**:
```typescript
// Add after thread recording section (~line 1143):
if (services && typeof services.addTurn === 'function' && event.transcript) {
  services.addTurn('user', event.transcript);
}
```

---

### BUG-002: Firebase Auth Token Not Sent with Token Request (FIXED)
**Severity**: 🔴 CRITICAL  
**File**: `apps/web/src/services/connection.service.ts`
**Status**: ✅ FIXED (earlier in this session)

**Problem**: Frontend was fetching LiveKit tokens without including the Firebase Auth Bearer token, causing user sessions to be anonymous.

**Evidence**:
```typescript
// Before fix - NO auth header:
response = await fetch(url, {
  headers: { Accept: 'application/json' }
});

// After fix - Auth header included:
const authToken = await getAuthToken();
if (authToken) {
  headers['Authorization'] = `Bearer ${authToken}`;
}
```

**Impact**:
- 165 orphaned profiles with device IDs instead of real user ID
- User's real profile had 0 conversations
- Identity fragmentation across sessions

---

### BUG-003: Learning Engine Chain Broken
**Severity**: 🔴 CRITICAL  
**Root Cause**: BUG-001

**Problem**: The learning engine is wired correctly but never receives user data because `addTurn('user')` is never called.

**Chain**:
```
User Speech → transcript-handler.ts → ❌ MISSING addTurn('user')
                                      ↓ (should be)
                                      session-manager.ts addTurn()
                                      ↓
                                      learningEngine.processUserTurn()
                                      ↓
                                      Extract: key moments, emotions, topics, details
```

**Evidence**:
- 0 voice sketches extracted
- 0 emotional patterns detected
- 0 key moments captured
- 0 topics recorded
- 0 social graph entries (except speech recognition errors)

---

### BUG-004: Summarization Gets Empty Turns Array
**Severity**: 🔴 CRITICAL  
**Root Cause**: BUG-001

**Problem**: At session end, `historyTracker.getSimpleTurns()` returns only assistant turns, so summarization has no user content to analyze.

**Evidence** (from `end-session.ts`):
```typescript
const turns = services.historyTracker.getSimpleTurns();
// Log shows: userTurnCount: 0, assistantTurnCount: 1

if (turns.length === 0) {
  log.warn('⚠️ No conversation turns to summarize - addTurn() was never called');
}
```

**Result**:
- All 144 summaries say "Brief conversation"
- No key points extracted
- No topics detected
- No emotional arc captured

---

## 🟡 SECONDARY ISSUES

### ISSUE-005: SSML in Persisted Turns
**Severity**: 🟡 MEDIUM  
**File**: `src/services/memory/realtime-memory.ts`

**Problem**: Assistant turns are persisted with raw SSML tags instead of clean text.

**Evidence**:
```
[assistant]: "<break time="200ms"/><break time="200ms"/>Hi! <break time="1..."
```

**Impact**: Memory retrieval returns SSML markup instead of readable text.

**Fix**: Strip SSML before persisting, or store both raw and clean versions.

---

### ISSUE-006: Speech Recognition Errors in Social Graph
**Severity**: 🟡 LOW  
**File**: Social graph extraction in `realtime-persistence.ts`

**Problem**: Speech recognition errors are captured as people in the relationship network.

**Evidence**:
```
People captured: "Here", "And", "Bought" (should be filtered)
```

**Fix**: Add name validation/filtering before adding to social graph.

---

### ISSUE-007: Orphaned Profile Cleanup
**Severity**: 🟡 LOW  

**Problem**: 165 orphaned profiles exist with device IDs instead of real user ID.

**Recommendation**: 
1. Create migration script to merge any valuable data to real profile
2. Delete empty orphaned profiles
3. Add monitoring for identity fragmentation

---

## 📊 Data Evidence

### Firestore Profile Analysis
| Metric | Expected | Actual |
|--------|----------|--------|
| Conversations | 322 | 322 (count only) |
| User turns persisted | ~300+ | 0 |
| Assistant turns persisted | ~300+ | 8 |
| Voice sketches | 1+ | 0 |
| Emotional patterns | Many | 0 |
| Key moments | Several | 0 |
| Topics | Many | 0 |
| Social graph | Populated | 3 (all errors) |

### Turn Flow Audit
```
✅ User speaks
✅ LiveKit captures audio
✅ STT transcribes speech
✅ transcript-handler receives transcript
✅ Various processing (data capture, thread recording, semantic routing)
❌ services.addTurn('user', transcript) - NEVER CALLED
❌ learningEngine.processUserTurn() - never receives data
❌ historyTracker - never gets user turns
❌ realtimeMemory.persistTurn() - never called for user turns
❌ summarization - no user content to summarize
❌ learning extraction - nothing to learn from
```

---

## 🔧 Fix Priority

### P0 (Do Now)
1. **BUG-001**: Add `services.addTurn('user', event.transcript)` to transcript-handler.ts

### P1 (This Sprint)
2. **ISSUE-005**: Strip SSML from persisted turns
3. **ISSUE-006**: Add name validation to social graph

### P2 (Backlog)
4. **ISSUE-007**: Clean up orphaned profiles
5. Add monitoring for:
   - Turn persistence success rate
   - User vs assistant turn counts
   - Learning engine extraction rates
   - Identity fragmentation detection

---

## ✅ Verification Steps After Fix

1. Start a voice session
2. Speak a few sentences including:
   - Your name ("I'm Seth")
   - A topic ("I'm thinking about my career")
   - An emotion ("I'm feeling a bit anxious")
3. End the session
4. Check Firestore:
   - `/bogle_users/{userId}/conversations/{convId}/turns` should have user turns
   - Profile should have updated `lastConversationSummary`
   - `emotionalPatterns`, `topics`, `keyMoments` should be populated

---

## Files Modified in This Session

1. ✅ `apps/web/src/services/connection.service.ts` - Auth token fix (BUG-002)

## Files Needing Modification

1. 🔴 `src/agents/voice-agent/transcript-handler.ts` - Add user turn recording (BUG-001)
