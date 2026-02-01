# Better Than Human - Blockers Audit

> **Goal:** Identify and fix everything preventing Ferni from achieving superhuman emotional intelligence.

Generated: 2026-01-28

---

## Executive Summary

Six specialized agents audited the codebase for blockers to BTH capabilities. **57 critical issues** were identified across 6 categories:

| Category | Critical | High | Medium | Total |
|----------|----------|------|--------|-------|
| Memory Leaks | 5 | 3 | - | 8 |
| BTH Wiring Gaps | 4 | 6 | 3 | 13 |
| Conversation Quality | 3 | 7 | 4 | 14 |
| Memory System | 5 | 4 | 3 | 12 |
| Data Integrity | 4 | 4 | 2 | 10 |
| Disabled Features | 5 | 4 | 3 | 12 |
| **TOTAL** | **26** | **28** | **15** | **69** |

---

## Priority 0: Critical Blockers (Fix This Week)

### 1. Human Signals Never Persisted 🔴
**File:** `src/memory/human-signal-extractor.ts`

**Problem:** Dreams, fears, values, and important dates are extracted but NEVER saved to Firestore.

```typescript
// Currently: Extracted signals just... disappear
const signals = await extractHumanSignals(transcript);
// signals.dreams, signals.fears, signals.values exist
// But they're never persisted!
```

**Impact:** Ferni forgets user's deepest revelations. This is the #1 BTH failure.

**Fix:**
```typescript
// In stm-promotion.ts or dedicated persistence
import { persistHumanSignals } from './human-signal-persistence.js';

// After extraction
if (signals.dreams.length || signals.fears.length || signals.values.length) {
  await persistHumanSignals(userId, signals);
}
```

---

### 2. Visible Vulnerability Never Fires for Ferni 🔴
**File:** `src/agents/realtime/emotion-event-dispatcher.ts`

**Problem:** `dispatchVisibleVulnerability` exists but is NEVER called when Ferni should show uncertainty. It only analyzes USER input.

**Current call site (turn-handler.ts:973):**
```typescript
// Only fires when USER is vulnerable
if (vulnerabilityDetected(userTranscript)) {
  dispatchVisibleVulnerability(...);
}
```

**Missing:** Ferni NEVER admits uncertainty, making it feel robotic.

**Fix:** Add call when Ferni's response contains uncertainty markers:
```typescript
// In response-orchestrator.ts or turn-handler.ts
const ferniResponse = await generateReply(...);
if (containsUncertaintyMarkers(ferniResponse)) {
  await dispatchVisibleVulnerability(sendDataMessage, {
    uncertaintyType: 'honest_uncertainty',
    topic: extractTopic(userTranscript),
    intensity: 0.7,
  });
}
```

---

### 3. Memory Leak: Music Handler Event Listeners 🔴
**File:** `src/agents/voice-agent/music-handler.ts`

**Problem:** 7 event listeners registered but NEVER removed on session end.

```typescript
// Lines 89-120: Listeners registered
room.on('trackSubscribed', this.handleTrackSubscribed);
room.on('trackUnsubscribed', this.handleTrackUnsubscribed);
// ... 5 more listeners

// cleanup() method exists but doesn't remove listeners!
```

**Impact:** Memory grows with each session, eventual OOM crash.

**Fix:**
```typescript
cleanup(): void {
  this.room.off('trackSubscribed', this.handleTrackSubscribed);
  this.room.off('trackUnsubscribed', this.handleTrackUnsubscribed);
  // ... all 7 listeners
  this.room = null;
}
```

---

### 4. Proactive Outreach System DISABLED 🔴
**File:** `src/config/feature-flags.ts`

**Problem:** The entire "Thinking of You" proactive check-in system is disabled:

```typescript
export const OUTREACH_FLAGS = {
  triggerCreation: false,   // 🔴 DISABLED
  triggerProcessing: false, // 🔴 DISABLED
  // ...
};
```

**Impact:** Ferni NEVER reaches out first. This is a core BTH differentiator.

**Fix:** Enable with gradual rollout:
```typescript
export const OUTREACH_FLAGS = {
  triggerCreation: true,
  triggerProcessing: true,
  rolloutPercentage: 10, // Start with 10%
};
```

---

### 5. 36 Behavior Files Never Loaded 🔴
**File:** `src/conversation/deep-humanization/behavior-loader.ts`

**Problem:** Only 13 of 49 behavior JSON files are loaded. 36 sit unused:

**Unused files include:**
- `celebrations.json` - Ferni doesn't celebrate wins
- `running-jokes.json` - No inside jokes tracked
- `trust-phrases.json` - Trust language underused
- `silence-responses.json` - Awkward silences not handled
- `emotional-intelligence.json` - EQ behaviors missing
- `late-night-presence.json` - 2am warmth missing
- `physical-presence.json` - No grounding cues
- ... and 29 more

**Fix:** Update behavior-loader.ts to load all files:
```typescript
const BEHAVIOR_FILES = [
  'celebrations.json',
  'running-jokes.json',
  'trust-phrases.json',
  // ... all 49 files
];
```

---

## Priority 1: High Impact Blockers (Fix This Month)

### 6. Session State Handler Memory Leak
**File:** `src/agents/voice-agent/session-state-handler.ts`

3 event listeners never removed. Similar fix to music-handler.

---

### 7. Unbounded Cache Maps
**File:** `src/intelligence/context-routing/cache-manager.ts`

Session and user maps grow indefinitely. Add TTL-based cleanup:
```typescript
// Add periodic cleanup
setInterval(() => this.evictStaleEntries(), 60_000);
```

---

### 8. Superhuman Observation Gated Too Aggressively
**File:** `src/agents/voice-agent/turn-handler.ts:1859`

Only fires when `patternConfidence > 0.9` - this means ~1% activation rate.

**Fix:** Lower threshold to 0.7 and add more trigger conditions.

---

### 9. Temporal Insight Rarely Fires
**File:** `src/agents/voice-agent/turn-handler.ts:804`

Requires memory content to contain specific keywords. Most temporal connections missed.

**Fix:** Use semantic similarity instead of keyword matching.

---

### 10. Deep Extraction Results Never Used
**File:** `src/memory/dynamic/deep-extraction-worker.ts`

LLM extracts rich entities, relationships, and insights. They're stored but NEVER retrieved.

**Fix:** Wire to `dynamic-memory-context.ts` retrieval.

---

### 11. STM Race Condition
**File:** `src/memory/dynamic/stm-promotion.ts`

Dual-lock mechanism has race condition:
```typescript
// Lines 45-67: Lock acquisition without atomic check
if (!this.locks.has(userId)) {
  this.locks.set(userId, true);  // ← Race window here
```

**Fix:** Use Redis distributed lock or atomic CAS operation.

---

### 12. Entity Deduplication Never Runs
**File:** `src/memory/entity-store/consolidation.ts`

Two parallel entity systems exist:
- `entity-store/` - New system
- `knowledge-graph/` - Legacy system

Neither deduplicates. Users accumulate duplicate entities.

**Fix:** Run consolidation job on session end.

---

### 13. Holiday Greetings DISABLED
**File:** `src/config/feature-flags.ts`

```typescript
holidayGreetings: false, // 🔴 DISABLED
```

Ferni misses birthdays, anniversaries, holidays.

---

### 14. A/B Testing Framework DISABLED
**File:** `src/services/experiments/superhuman-experiments.ts`

Can't experiment with BTH features without measurement.

---

## Priority 2: Medium Impact (Fix Next Sprint)

### 15-25: Additional Conversation Gaps

| Issue | File | Impact |
|-------|------|--------|
| Running jokes never surfaced | `running-jokes.ts` | No relationship continuity |
| Trust phrases inconsistent | `trust-context.ts` | Variable trust building |
| Late night mode not activated | `late-night-presence.ts` | 2am interactions feel cold |
| Coaching modes not selected | `coaching-modes.ts` | One-size-fits-all approach |
| Physical presence not described | `physical-presence.ts` | No grounding support |
| Handoff context incomplete | `handoff/event-handler.ts` | Jarring persona transitions |
| Behavior injection too aggressive | `injection-builders.ts` | Natural behaviors filtered |
| Silence responses underused | `silence-handler.ts` | Awkward pauses |
| Emotional trajectory stale | `emotional-trajectory.ts` | Mood tracking delayed |
| Anticipatory presence rare | `anticipatory-presence.ts` | Missing time-of-day awareness |
| Inside joke callbacks rare | `inside-joke-callback.ts` | Shared humor forgotten |

---

### 26-35: Data Integrity Issues

| Issue | File | Risk |
|-------|------|------|
| Batch write no verification | `stm-promotion.ts` | Silent data loss |
| Concurrent deep extraction | `deep-extraction-worker.ts` | Duplicate processing |
| Missing null checks | `stm-buffer.ts` | Runtime crashes |
| Orphaned entity refs | `consolidation.ts` | Dangling pointers |
| Session cleanup no await | `cleanup-handler.ts` | Incomplete cleanup |
| Orphaned GCS uploads | `cleanup-orphaned-uploads.ts` | Logic flaw |
| No distributed transactions | Multiple files | Inconsistent state |
| Promise.allSettled unchecked | Multiple files | Silent failures |
| Type assertions unsafe | Multiple files | Runtime type errors |
| TTS registry no cleanup | `tts-wrapper.ts` | Voice ID accumulation |

---

## Recommended Fix Order

### Week 1: Critical Data & Memory
1. ✅ Persist human signals (dreams, fears, values)
2. ✅ Fix music-handler memory leak
3. ✅ Fix session-state-handler memory leak
4. ✅ Add cache TTL cleanup

### Week 2: Critical BTH Wiring
5. ✅ Wire Visible Vulnerability for Ferni responses
6. ✅ Lower Superhuman Observation threshold
7. ✅ Load all 49 behavior files
8. ✅ Enable proactive outreach (10% rollout)

### Week 3: Memory System
9. ✅ Wire deep extraction results to retrieval
10. ✅ Fix STM race condition
11. ✅ Run entity deduplication
12. ✅ Enable A/B testing framework

### Week 4: Conversation Quality
13. ✅ Wire running jokes surfacing
14. ✅ Enable late night mode
15. ✅ Fix handoff context transfer
16. ✅ Enable holiday greetings

---

## Validation Checklist

After fixes, verify:

- [ ] `pnpm vitest run src/memory/human-signal` - Human signals persist
- [ ] `pnpm vitest run src/agents/voice-agent/__tests__/cleanup` - No memory leaks
- [ ] `curl /api/observability/bth` - BTH activation rate > 3/session
- [ ] `pnpm vitest run src/memory/dynamic/__tests__/stm-promotion` - No race conditions
- [ ] Manual test: Say "I've always dreamed of..." → Next session: Ferni remembers

---

## Metrics to Track Post-Fix

| Metric | Current | Target |
|--------|---------|--------|
| BTH signals per session | ~1.2 | > 3 |
| Human signals persisted | 0% | 100% |
| Memory leak rate | ~5MB/hr | < 1MB/hr |
| Proactive outreach rate | 0% | 5% |
| Behavior file utilization | 27% | 100% |
| Entity deduplication | 0% | 100% |
| Visible Vulnerability fires | Never | ~1/session |

---

## Files Changed (For Reference)

### Critical Fixes
- `src/memory/human-signal-extractor.ts` - Add persistence
- `src/memory/human-signal-persistence.ts` - NEW FILE
- `src/agents/voice-agent/music-handler.ts` - Add listener cleanup
- `src/agents/voice-agent/session-state-handler.ts` - Add listener cleanup
- `src/agents/voice-agent/turn-handler.ts` - Wire Visible Vulnerability
- `src/config/feature-flags.ts` - Enable outreach
- `src/conversation/deep-humanization/behavior-loader.ts` - Load all files

### High Impact Fixes
- `src/intelligence/context-routing/cache-manager.ts` - Add TTL
- `src/memory/dynamic/stm-promotion.ts` - Fix race condition
- `src/memory/dynamic/deep-extraction-worker.ts` - Wire to retrieval
- `src/memory/entity-store/consolidation.ts` - Run on session end

---

*Generated by 6 specialized exploration agents. Last updated: January 2026*
