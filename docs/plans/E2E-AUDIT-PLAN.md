# E2E Voice Agent Audit Plan

> **Status:** Active Investigation
> **Date:** 2025-12-16
> **Priority:** Critical - Production Issues Reported

## Executive Summary

User testing revealed multiple production failures:
1. Music playback initially worked, then started failing
2. Maya handoff failed (voice didn't switch, no intro)
3. Transfer back to Ferni failed
4. Subsequent music requests failing

**Root Cause:** Test harness does NOT replicate production conditions. Tests pass but production fails.

---

## Critical Bugs Found (Prioritized)

### 🔴 P0 - CRITICAL (Fix Immediately)

#### BUG-001: Maya's `onEnter()` Never Actually Speaks
**File:** `src/agents/personas/maya-agent.ts:220-224`
```typescript
async onEnter(): Promise<void> {
  this.session.generateReply({  // ❌ This generates text, doesn't speak!
    instructions: "Introduce yourself briefly as Maya...",
  });
}
```
**Impact:** Maya's greeting is never spoken through TTS
**Fix:** Use `session.say()` OR remove `onEnter()` and let handoff handler speak

---

#### BUG-002: Two Conflicting Greeting Systems
**Files:**
- `src/agents/personas/maya-agent.ts:220-224` (onEnter)
- `src/agents/shared/handoff-handler.ts:636` (handler says greeting)

**Problem:** Both systems try to generate greetings but don't coordinate
**Impact:** Greeting either never plays, plays twice, or plays in wrong voice
**Fix:** Choose ONE system - either onEnter OR handoff handler, not both

---

#### BUG-003: Voice Switch Not Confirmed Before Speaking
**File:** `src/agents/shared/handoff-handler.ts:415-636`
```typescript
voiceManager.switchVoice(persona.id);  // Line 417
// NO WAIT/CONFIRMATION HERE!
session.say(finalGreeting);  // Line 636 - might speak in old voice!
```
**Impact:** Greeting might speak in Ferni's voice instead of Maya's
**Fix:** Add confirmation check after voice switch:
```typescript
await voiceManager.switchVoice(persona.id);
// Wait for voice confirmation
await new Promise(r => setTimeout(r, 200));
```

---

#### BUG-004: Music Timer Race Conditions
**File:** `src/audio/music-player.ts:656-742`
**Problem:** `trackEndHandled` flag is set/reset in conflicting order:
1. `stop()` sets `trackEndHandled = true` (line 1600)
2. Download happens (async, takes time)
3. `playFromUrl()` sets `trackEndHandled = false` (line 742)
4. Old backup timer might fire during this window

**Impact:** Second song fails because state is corrupted
**Fix:** Clear ALL timers and reset state atomically at start of `playFromUrl()`

---

#### BUG-005: Global State vs Session-Scoped State Conflict
**File:** `src/tools/handoff/state.ts:80`
```typescript
let currentAgent: AgentId = 'ferni';  // ❌ GLOBAL - shared across ALL sessions!
```
**Impact:** Concurrent sessions interfere with each other's agent identity
**Fix:** Use only session-scoped state from `session-state.ts`

---

### 🟠 P1 - HIGH (Fix This Week)

#### BUG-006: Test/Production Temperature Mismatch
**Files:**
- Test: `src/tests/e2e/gemini-integration/harness.ts:314` → `0.3`
- Production: `src/agents/voice-agent-entry.ts:428` → `0.8`

**Impact:** Tests pass but production is 2.67x more random
**Fix:** Run tests at 0.8 temperature OR lower production to 0.4

---

#### BUG-007: Test Has 14 Tools, Production Has 40+
**Files:**
- Test: `harness.ts:137-259` (14 tools)
- Production: `ferni-agent.ts:382-409` (40+ tools)

**Impact:** Model behavior completely different with different tool counts
**Fix:** Add ALL production tools to test harness

---

#### BUG-008: userData.recentMessages Never Cleared
**File:** `src/tools/handoff/handoff-factory.ts:464-468`
**Problem:** After handoff, old messages from previous persona persist
**Impact:** New persona sees stale conversation history
**Fix:** Clear `userData.recentMessages` after handoff completes

---

#### BUG-009: Meeting Count Shared Across Sessions
**File:** `src/tools/handoff/state.ts:528-539`
```typescript
perPersonaMeetingCount.set(personaId, newCount);  // ❌ GLOBAL Map!
```
**Impact:** Two concurrent sessions increment same meeting count
**Fix:** Make `perPersonaMeetingCount` per-session

---

#### BUG-010: Duration Mismatch (Hint vs Actual)
**File:** `src/audio/music-player.ts:1289-1320`
**Problem:** iTunes API hints 30s, actual audio might be 28s
**Impact:** Backup timer fires at wrong time, state gets corrupted
**Fix:** Always use ffprobe actual duration, ignore hints

---

### 🟡 P2 - MEDIUM (Fix Next Sprint)

#### BUG-011: `waitForPlayout()` May Never Resolve
**File:** `src/audio/music-player.ts:841-854`
**Impact:** Track state never clears if promise hangs
**Fix:** Add timeout wrapper around `waitForPlayout()`

---

#### BUG-012: Test Uses REST API, Production Uses Streaming
**Files:**
- Test: `harness.ts:377` → `generateContent()`
- Production: `voice-agent-entry.ts:425` → `RealtimeModel()`

**Impact:** Tool call timing/order differs completely
**Fix:** Create separate streaming E2E test suite

---

#### BUG-013: Cached Agent Context Not Invalidated
**File:** `src/tools/handoff/state.ts:606-626`
**Impact:** After Maya→Ferni, Ferni might get minimal context
**Fix:** Force cache invalidation on every handoff

---

#### BUG-014: Session History Unbounded Growth
**File:** `src/audio/music-player.ts:476-488`
**Impact:** Memory leak over long sessions
**Fix:** Limit `sessionHistory` array to last 50 entries

---

---

## Holistic Fix Plan

### Phase 1: Stop the Bleeding (1-2 days)
| Task | Bug | File | Effort |
|------|-----|------|--------|
| Fix Maya onEnter | BUG-001 | maya-agent.ts | 30min |
| Choose single greeting system | BUG-002 | handoff-handler.ts | 1hr |
| Add voice switch confirmation | BUG-003 | handoff-handler.ts | 1hr |
| Fix music timer race | BUG-004 | music-player.ts | 2hr |

### Phase 2: State Management Overhaul (3-5 days)
| Task | Bug | File | Effort |
|------|-----|------|--------|
| Migrate to session-scoped state | BUG-005 | state.ts + session-state.ts | 4hr |
| Clear userData on handoff | BUG-008 | handoff-factory.ts | 1hr |
| Make meeting counts per-session | BUG-009 | state.ts | 2hr |
| Invalidate cache on handoff | BUG-013 | state.ts | 1hr |

### Phase 3: Test-Production Parity (5-7 days)
| Task | Bug | File | Effort |
|------|-----|------|--------|
| Match temperature | BUG-006 | harness.ts | 30min |
| Add all 40+ tools to test | BUG-007 | harness.ts | 4hr |
| Create streaming test harness | BUG-012 | New file | 8hr |
| Add production system prompt | - | harness.ts | 1hr |

### Phase 4: Audio Reliability (3-4 days)
| Task | Bug | File | Effort |
|------|-----|------|--------|
| Use actual duration only | BUG-010 | music-player.ts | 2hr |
| Add waitForPlayout timeout | BUG-011 | music-player.ts | 1hr |
| Limit session history | BUG-014 | music-player.ts | 30min |
| Add comprehensive audio E2E tests | - | New file | 4hr |

---

## E2E Test Strategy

### Current Tests (Insufficient)
```
src/tests/e2e/gemini-integration/
├── harness.ts           # REST API, 14 tools, 0.3 temp
├── gemini-e2e.test.ts   # Basic tool calling
└── scenarios/           # 30+ scenarios but wrong config
```

### Required Tests (New)

#### 1. Production-Parity Tests
```typescript
// New: production-parity.test.ts
describe('Production Parity', () => {
  const harness = new GeminiTestHarness({
    temperature: 0.8,           // Match production
    tools: ALL_PRODUCTION_TOOLS, // All 40+ tools
    systemPrompt: REAL_FERNI_PROMPT,
  });

  it('calls handoffToMaya with budget question', async () => {
    const result = await harness.sendMessage('I need help with my budget');
    expect(result.toolCalls).toContainEqual({ name: 'handoffToMaya' });
  });
});
```

#### 2. Handoff Flow Tests
```typescript
// New: handoff-flow.test.ts
describe('Handoff Flow E2E', () => {
  it('Ferni → Maya → Ferni round trip', async () => {
    // 1. Start with Ferni
    // 2. Request handoff to Maya
    // 3. Verify Maya speaks in her voice
    // 4. Request handoff back to Ferni
    // 5. Verify Ferni speaks in his voice
    // 6. Verify state is clean
  });

  it('Voice actually switches during handoff', async () => {
    // Mock voiceManager.switchVoice()
    // Verify it's called BEFORE greeting
    // Verify greeting uses correct voice
  });
});
```

#### 3. Music Playback Tests
```typescript
// New: music-flow.test.ts
describe('Music Playback E2E', () => {
  it('plays 3 songs in sequence without failure', async () => {
    for (let i = 0; i < 3; i++) {
      await musicPlayer.playViaItunes('test song');
      await waitForTrackEnd();
      expect(musicPlayer.state.isPlaying).toBe(false);
    }
  });

  it('handles rapid play/stop cycles', async () => {
    // Stress test the timer cleanup
  });
});
```

#### 4. State Isolation Tests
```typescript
// New: state-isolation.test.ts
describe('Session State Isolation', () => {
  it('two concurrent sessions have independent state', async () => {
    const session1 = createSession();
    const session2 = createSession();

    await session1.handoff('maya');
    expect(session1.currentAgent).toBe('maya');
    expect(session2.currentAgent).toBe('ferni'); // Independent!
  });
});
```

---

## Monitoring & Observability

### Logs to Add
```typescript
// In handoff-handler.ts
log.info({
  fromAgent: currentAgent,
  toAgent: targetPersona.id,
  voiceSwitchSuccess: boolean,
  greetingSpoken: boolean,
  elapsedMs: number,
}, 'Handoff completed');

// In music-player.ts
log.info({
  track: trackName,
  actualDuration: ffprobeDuration,
  hintDuration: apiHint,
  timerSetFor: backupTimerMs,
}, 'Track playback started');
```

### Metrics to Track
| Metric | Threshold | Alert |
|--------|-----------|-------|
| Handoff success rate | > 99% | PagerDuty |
| Music play success rate | > 95% | Slack |
| Tool call rate at 0.8 temp | > 80% | Dashboard |
| Voice switch latency | < 500ms | Dashboard |

---

## Definition of Done

### Handoff System
- [ ] Maya speaks her greeting in her voice
- [ ] Voice switch completes before greeting
- [ ] Transfer back to Ferni works
- [ ] State is clean after round-trip

### Music System
- [ ] 5 consecutive songs play without failure
- [ ] Rapid play/stop doesn't corrupt state
- [ ] Timer race conditions eliminated

### Test Parity
- [ ] Tests run at 0.8 temperature
- [ ] Tests include all 40+ tools
- [ ] Tests use real system prompt
- [ ] 95% of tests pass at production config

### State Management
- [ ] No global state for agent identity
- [ ] Session isolation verified
- [ ] Meeting counts per-session

---

## Appendix: Files to Modify

### Critical Path Files
| File | Changes Needed |
|------|---------------|
| `src/agents/personas/maya-agent.ts` | Fix onEnter() |
| `src/agents/shared/handoff-handler.ts` | Voice switch confirmation |
| `src/audio/music-player.ts` | Timer race fixes |
| `src/tools/handoff/state.ts` | Session-scoped state |
| `src/tests/e2e/gemini-integration/harness.ts` | Production parity |

### New Files to Create
| File | Purpose |
|------|---------|
| `src/tests/e2e/handoff-flow.test.ts` | Handoff E2E tests |
| `src/tests/e2e/music-flow.test.ts` | Music E2E tests |
| `src/tests/e2e/state-isolation.test.ts` | State isolation tests |
| `src/tests/e2e/production-parity.test.ts` | Production config tests |
