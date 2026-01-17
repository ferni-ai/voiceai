# Ferni Data Persistence Audit - December 2024

> What gets saved, when, and what's missing?

## Executive Summary

Ferni has extensive data extraction capabilities, but there's a **critical gap between extraction and persistence**. Many systems extract data but either:
- Only persist at session end (risk of data loss on disconnect)
- Store in memory but never persist to Firestore
- Are implemented but not integrated into the voice agent flow

---

## 🟢 FULLY WORKING: Real-Time Persistence

These systems save data **during** the conversation (not just at session end):

| Data Type | When Saved | Where Stored | Integration Point |
|-----------|------------|--------------|-------------------|
| **Contact Info (phone/email)** | Immediately on detection | Firestore `bogle_users/{userId}/onboarding` | `identity-orchestrator.ts` |
| **Realtime Conversation Turns** | Every turn | Firestore `conversations/{convId}/turns` | `realtime-memory.ts` |
| **Trust System Data** | Batched (30s debounce) | Firestore `trust_profiles/{system}` | `unified-persistence.ts` |
| **Reflection Moments** | On detection | In-memory (persisted at session end) | `turn-processor.ts:1955` |

### Code Evidence

```typescript
// Contact info saved immediately (identity-orchestrator.ts:241-246)
await completeOnboarding(session.userId, {
  phone: contactDetected.phone,
  email: contactDetected.email,
  preferredMethod: contactDetected.preferredMethod,
  timezone: contactDetected.timezone,
});
```

```typescript
// Realtime turns saved during conversation (realtime-memory.ts)
await saveConversationTurn(userId, conversationId, turn);
```

---

## 🟡 SESSION END ONLY: Persisted at Disconnect

These systems only save data when the session ends. **Data is lost if the user disconnects unexpectedly.**

| Data Type | What's Extracted | Persisted To | Risk Level |
|-----------|-----------------|--------------|------------|
| **Conversation Summary** | LLM-generated summary | `userProfile.lastConversationSummary` | 🔴 High - lost on crash |
| **Key Moments** | Breakthroughs, milestones | `userProfile.keyMoments` | 🔴 High |
| **Emotional Patterns** | Session emotions | `userProfile.emotionalPatterns` | 🟡 Medium |
| **Small Details** | Names, places, amounts | `userData.extractedDetails` | 🔴 High - only in memory! |
| **Cross-Session Threads** | Open topics | `userProfile.openThreads` | 🟡 Medium |
| **Handoff State** | Last persona, context | `userProfile.customData.lastHandoff` | 🟡 Medium |
| **Humanizing State** | Stories told, mood | `userProfile.humanizingState` | 🟡 Medium |
| **Personal Journey** | Milestones, growth | `userProfile.personalJourney` | 🟡 Medium |
| **Human Memory Signals** | Dates, values, dreams | `userProfile.humanMemory` | 🔴 High |

### Code Evidence (end-session.ts)

```typescript
// This all runs at session end - see handleEndSession()
profile = await persistHandoffState(profile, services.handoffState);
profile = await persistCrossSessionThreads(profile, services.crossSessionThreader);
profile = await persistEmotionalMemory(profile, services.emotionalMemory);
profile = await persistIntelligenceState(profile, userId);
profile = await persistPersonalJourney(profile, userId, summary);
profile = await extractHumanMemorySignals(profile, userId, personaId, turns, summary);
```

---

## 🟢 NOW INTEGRATED (Dec 28, 2024)

These systems have been **integrated into the main voice agent flow**:

### 1. **Social Graph / Relationship Network** ✅ FIXED

**Location:** `src/services/social-graph/index.ts`, `src/services/superhuman/relationship-network.ts`

**What it does:**
- Extracts people mentioned in conversation
- Tracks relationship types (mom, friend, boss)
- Calculates social graph metrics

**Status:** ✅ Now called from `turn-processor.ts` on every turn!

```typescript
// turn-processor.ts:1470-1495
// 1. SOCIAL GRAPH: Extract and record names/relationships mentioned
safeFireAndForget(
  async () => {
    const extractedNames = extractNames(userText);
    for (const { name, context } of extractedNames) {
      recordMention(services.userId!, name, context, sentiment, topics, emotionalWeight);
    }
  },
  { context: 'social-graph-extraction' }
);
```

**Persistence:** Graph persists to Firestore via `persistGraphToFirestore()` on session end and every 3 turns via auto-save.

---

### 2. **Contact Relationship Service**

**Location:** `src/services/contacts/contact-relationship-service.ts`

**What it does:**
- Rich contact tracking with topics, sentiment
- Discussion history per contact
- Follow-up suggestions

**Problem:** The rich `ContactRelationship` interface is never populated during conversation. Only basic contact info (phone/email) is saved.

**Missing integration:**
- No extraction of relationship context during turns
- No topic tracking per contact
- No sentiment tracking per contact

---

### 3. **Data Capture Router** ✅ FIXED

**Location:** `src/intelligence/data-capture/index.ts`

**What it does:**
- Unified entity extraction (contacts, dates, places, preferences)
- Intent classification (save vs reference)
- Routing to appropriate storage

**Status:** ✅ Now integrated into `turn-processor.ts`!

```typescript
// turn-processor.ts:1497-1514
// 2. DATA CAPTURE ROUTER: Extract contacts, commitments, etc.
safeFireAndForget(
  async () => {
    const captureResult = await processDataCapture({
      transcript: userText,
      userId: services.userId!,
      sessionId: services.sessionId,
    });
  },
  { context: 'data-capture-routing' }
);
```

---

### 4. **Outreach/Commitment Extraction**

**Location:** `src/services/outreach/conversation-extractor.ts`

**What it does:**
- Extracts commitments ("I'll call my mom tomorrow")
- Extracts events, wins, struggles
- Creates proactive outreach triggers

**Status:** Partially integrated via `publishOutreachExtraction()` in turn-processor, but runs async in a worker. Results may not make it back to the profile.

---

### 5. **Pattern Detection**

**Location:** `src/intelligence/coaching-patterns.ts`

**What it does:**
- Detects behavioral patterns
- Tracks people mentioned
- Records coaching observations

**Problem:** `recordPattern()` exists but is not systematically called.

---

## 🟡 PARTIALLY FIXED: Critical Gaps

### 1. Small Details - Now Auto-Saved ✅ FIXED

**File:** `src/intelligence/context-builders/personal.ts`

```typescript
// Extracted and stored in session memory
const extractedDetails = extractSmallDetails(userText);
userData.extractedDetails = [...(userData.extractedDetails || []), ...simpleDetails]
  .slice(-20);
```

**Fix Applied:** Now auto-saves to Firestore every 3 turns via `triggerAutoSave()` in `turn-processor.ts`:

```typescript
// turn-processor.ts:1516-1523
// 3. PERIODIC AUTO-SAVE: Persist extracted details and social graph every 3 turns
const extractedDetails = (userData as Record<string, unknown>).extractedDetails;
if (extractedDetails) {
  triggerAutoSave(services.userId, turnCount, extractedDetails);
} else {
  triggerAutoSave(services.userId, turnCount);
}
```

**New Service:** `src/services/realtime-persistence.ts` handles periodic saves with rate limiting.

---

### 2. User Learning Engine - In Memory Only

**File:** `src/intelligence/user-learning-engine/engine.ts`

The `UserLearningEngine` extracts:
- Small details
- Emotional patterns  
- Topics discussed
- Key moments
- Explicit insights

**But these are stored in instance variables:**

```typescript
private sessionInsights: LearningInsight[] = [];
private sessionSmallDetails: SmallDetail[] = [];
private sessionEmotions: EmotionalPattern[] = [];
private topicsDiscussed: string[] = [];
private sessionKeyMoments: KeyMoment[] = [];
```

**Only persisted at session end via `finalizeSession()`**. If session crashes, all lost.

---

### 3. Relationship/Social Graph - Now Integrated ✅ FIXED

**Location:** `src/services/social-graph/index.ts`

The `extractNames()` function can detect:
- "my friend Sarah"
- "[name] is my [relationship]"
- "talking to [name]"
- "called [name]"

**Status:** ✅ Now integrated! See `turn-processor.ts:1470-1495`

**New Features Added:**
- `persistGraphToFirestore(userId, graph)` - saves graph to Firestore
- `loadGraphFromFirestore(userId)` - loads on session start
- Auto-save every 3 turns via `triggerAutoSave()`

---

### 4. Periodic Auto-Save for Critical Data - Now Implemented ✅ FIXED

**New Service:** `src/services/realtime-persistence.ts`

Features:
- `triggerAutoSave(userId, turnCount, extractedDetails)` - called every 3 turns
- `persistExtractedDetails()` - saves extracted details to Firestore
- `persistSocialGraph()` - saves social graph to Firestore
- Rate limiting to avoid over-saving (30 second minimum between saves)
- Cleanup on session end via `clearRateLimits()`

```typescript
// Called from turn-processor.ts:1516-1523
triggerAutoSave(services.userId, turnCount, extractedDetails);
```

**Final persistence** also added to `end-session.ts:276-287` to ensure no data loss.

---

## ✅ IMPLEMENTATION SUMMARY (Dec 28, 2024)

### Fixes Implemented

| Fix | File | Status |
|-----|------|--------|
| Social Graph Integration | `turn-processor.ts:1470-1495` | ✅ Done |
| Data Capture Router | `turn-processor.ts:1497-1514` | ✅ Done |
| Periodic Auto-Save | `turn-processor.ts:1516-1523` | ✅ Done |
| Real-time Persistence Service | `src/services/realtime-persistence.ts` | ✅ New |
| Social Graph Persistence | `src/services/social-graph/index.ts` | ✅ Enhanced |
| Session Start Graph Loading | `src/services/session-manager.ts:285-293` | ✅ Done |
| Session End Final Save | `src/services/session-manager/end-session.ts:276-287` | ✅ Done |

### New Service: `src/services/realtime-persistence.ts`

This new service provides:
- `persistExtractedDetails()` - saves details to Firestore
- `persistSocialGraph()` - saves social graph to Firestore
- `triggerAutoSave()` - called every 3 turns
- `shouldAutoSave()` - check if it's time to save
- `clearRateLimits()` - cleanup on session end
- Rate limiting (30s minimum between saves) to avoid Firestore cost spikes

### Testing

To verify the implementation:
1. Start a conversation and mention a few names/people
2. Check logs for `📇 Recorded person mention` and `🎯 Data captured`
3. After 3 turns, check for `🔄 Triggered auto-save`
4. End session and check for `📇 Final social graph persistence`

---

## 📋 REMAINING RECOMMENDATIONS

### ~~Medium Priority~~ ✅ DONE

1. ~~**Integrate social graph extraction**~~ ✅ Implemented in `turn-processor.ts:1470-1495`

2. ~~**Call data capture router**~~ ✅ Implemented in `turn-processor.ts:1497-1514`

### Medium Term (Still TODO)

3. **Add real-time persistence for learning engine**
   - Save key moments immediately (currently only at session end)
   - Save high-confidence insights immediately
   - Don't wait for session end

4. **Integrate contact relationship tracking**
   - When names are mentioned with context, update contact relationships
   - Track topics discussed per contact
   - Build discussion history
   - Connect `social-graph` extraction with `contact-relationship-service`

### Long Term (Future Improvements)

5. **Create unified extraction pipeline**
   - Single pass extraction for all entity types
   - Unified routing to appropriate storage
   - Real-time persistence with batching

6. **Add data loss monitoring**
   - Track what's extracted vs persisted
   - Alert on session crashes with unsaved data
   - Implement crash recovery

---

## Testing Status

| System | Unit Tests | Integration Tests | E2E Tests |
|--------|------------|-------------------|-----------|
| Contact Detection | ✅ | ⚠️ Partial | ❌ |
| Realtime Memory | ✅ | ✅ | ⚠️ |
| Social Graph | ✅ | ❌ | ❌ |
| Data Capture Router | ✅ | ❌ | ❌ |
| Session End Persistence | ⚠️ | ⚠️ | ❌ |
| Learning Engine | ✅ | ⚠️ | ❌ |
| Human Memory | ✅ | ⚠️ | ❌ |

---

## Files to Review

| File | Purpose | Status |
|------|---------|--------|
| `src/services/social-graph/index.ts` | Relationship network | 🔴 Not integrated |
| `src/intelligence/data-capture/index.ts` | Entity extraction | 🔴 Not integrated |
| `src/services/contacts/contact-relationship-service.ts` | Rich contacts | 🔴 Not integrated |
| `src/intelligence/user-learning-engine/engine.ts` | Learning extraction | 🟡 No real-time save |
| `src/agents/processors/turn-processor.ts` | Main flow | Integration point |
| `src/services/session-manager/end-session.ts` | Session end | All persistence here |

---

## Quick Validation

Run these to check if systems are working:

```bash
# Check if social graph has any data
firebase firestore:get bogle_users/YOUR_USER_ID/social_graph

# Check if extracted details are persisted
firebase firestore:get bogle_users/YOUR_USER_ID | grep extractedDetails

# Check realtime memory
firebase firestore:get bogle_users/YOUR_USER_ID/conversations

# Check contact relationships
firebase firestore:get bogle_users/YOUR_USER_ID/contact_relationships
```

---

*Created: December 28, 2024*
*Status: Initial Audit*
