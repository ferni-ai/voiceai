# Memory Pipeline Audit - January 25, 2026

## Executive Summary

After 629 conversations with Seth, Ferni knows almost nothing. The "Better than Human" promise is **completely broken**.

## Database State (Actual Data)

| What We Promise | What We Have | Gap |
|----------------|--------------|-----|
| Perfect memory | **4 memories** | 99.9% missing |
| People/entities | **0 entities** | 100% missing |
| Fact extraction | **0 facts** | 100% missing |
| Emotional patterns | **0 patterns** | 100% missing |
| Key moments | **0 moments** | 100% missing |
| Goals tracked | **0 goals** | 100% missing |
| Life events | **0 events** | 100% missing |
| Habits | **0 habits** | 100% missing |
| Preferences | **0 preferences** | 100% missing |

### What We DO Have
- ✅ 629 conversations (basic records)
- ✅ 302 summaries (48% coverage)
- ✅ 4 memories (name, Beethoven preference)
- ✅ 4 commitments
- ✅ 1 relationship
- ✅ Basic profile (name, totalConversations)

---

## Root Causes Identified

### 🔴 CRITICAL BUG #1: Human Signal Extraction Never Ran

**File:** `src/agents/voice-agent/cleanup-handler.ts` lines 1707-1710

**Bug:**
```typescript
// BROKEN: Looks for turns in wrong place
const flow = conversationState?.flow as { turns?: ... };
const turns = flow?.turns || [];  // ALWAYS EMPTY!
```

**Impact:** After 629 conversations, ZERO human signals extracted (dates, values, dreams, fears, growth markers, inside jokes).

**Fix Applied:** Now uses `services.historyTracker.getSimpleTurns()` 

---

### 🔴 CRITICAL BUG #2: Conversation Count Not Incremented (Historical)

**Status:** Fixed by running `fix-conversation-counts.ts`

**Impact:** Users appeared as "new" every session despite having hundreds of conversations.

---

### 🟡 ISSUE #3: Entity Extraction Not Implemented

**Problem:** No entities (people, places, things) are being extracted from conversations.

**What Should Exist:**
- People mentioned (wife, boss, friends)
- Places (home, work, gym)
- Projects/activities
- Relationships between entities

**Current State:** The `entities` subcollection is completely empty.

---

### 🟡 ISSUE #4: Dynamic Memory Not Populated

**Problem:** L2 dynamic memory (Firestore) is empty.

**Expected Flow:**
```
User Speech → fastCapture() → STM Buffer (L1) → onSessionEnd() → Firestore (L2)
```

**Current State:** `dynamic_memory` subcollection is empty.

---

### 🟡 ISSUE #5: Topics Not Extracted

**Problem:** Conversation summaries exist but `mainTopics` is never populated.

**Evidence:**
```
With summary: 161 (26%)
With topics: 0 (0%)
With emotional arc: 0 (0%)
With key points: 0 (0%)
```

---

### 🟡 ISSUE #6: Key Moments Not Captured

**Problem:** `keyMoments` array on profile is always empty.

**Expected:** Significant moments from conversations should be persisted:
- Breakthroughs
- Emotional revelations  
- Goals set
- Wins celebrated

---

## What The Memory System SHOULD Do

### At Session Start
1. Load user profile ✅
2. Load recent memories for context ❌ (4 memories total)
3. Load entities for personalization ❌ (0 entities)
4. Load emotional patterns ❌ (0 patterns)
5. Generate greeting using all context ⚠️ (partial - no rich context)

### During Session
1. Track conversation turns ✅
2. Extract entities in real-time ❌
3. Update emotional state ⚠️ (limited)
4. Detect key moments ❌

### At Session End
1. Generate conversation summary ⚠️ (26% success rate)
2. Extract human signals ❌ (was broken, now fixed)
3. Save entities ❌
4. Update emotional patterns ❌
5. Persist key moments ❌
6. Increment totalConversations ✅ (now working)

---

## Immediate Fixes Required

### P0 - Critical (This Week)

1. **[DONE]** Fix human signal extraction path
2. **[TODO]** Backfill human signals from existing conversation history
3. **[TODO]** Fix topic/keyPoints extraction in summarization
4. **[TODO]** Implement entity extraction from turns

### P1 - High Priority (Next 2 Weeks)

5. **[TODO]** Enable dynamic memory (L2) population
6. **[TODO]** Fix emotional pattern tracking
7. **[TODO]** Implement key moment detection
8. **[TODO]** Add observability/monitoring for memory pipeline

### P2 - Important (This Month)

9. **[TODO]** Implement knowledge graph (entity relationships)
10. **[TODO]** Add memory quality scoring
11. **[TODO]** Create memory health dashboard

---

## Recommended Architecture Changes

### 1. Add Memory Pipeline Observability

Every memory operation should log:
- What was attempted
- What succeeded/failed
- What was stored where

### 2. Consolidate Memory Paths

Currently there are 2+ paths for human signal extraction:
- `session-manager.ts` → saves to `userProfile.humanMemory`
- `cleanup-handler.ts` → saves to `human_memory` subcollection

These should be unified.

### 3. Add Memory Validation Tests

E2E tests that verify:
- After conversation, entities are extracted
- After conversation, human signals are stored
- Memory retrieval returns relevant context

---

## Files Changed

1. `src/agents/voice-agent/cleanup-handler.ts` - Fixed human signal extraction

## Files That Need Changes

1. `src/memory/human-signal-extractor.ts` - May need enhanced extraction
2. `src/services/session-manager.ts` - Verify endSession flow
3. `src/memory/entity-extractor.ts` - Implement/fix entity extraction
4. `src/memory/dynamic/` - Enable L2 memory population

---

## Testing Plan

1. Have a conversation mentioning:
   - A person's name
   - An important date
   - A goal or dream
   - An emotion

2. Check Firestore for:
   - `human_memory/profile` document
   - `entities` subcollection
   - `memories` subcollection growth
   - `conversations` summary quality

---

## Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Summaries with topics | 0% | 90% |
| Summaries with emotional arc | 0% | 80% |
| Human signals per conversation | 0 | 2+ |
| Entities extracted | 0 | 5+ per user |
| Memory retrieval hit rate | Unknown | 80% |
