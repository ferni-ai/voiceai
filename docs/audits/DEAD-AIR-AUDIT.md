# Dead Air Audit - Ferni Voice AI

## Executive Summary

After a comprehensive audit of the voice agent pipeline, I've identified **9 potential dead air scenarios** where Ferni can pause unexpectedly, leaving users in awkward silence. This document categorizes each issue by severity and proposes fixes.

### ✅ Implemented Fixes (December 9, 2025)

| Fix                                          | Location                | Status  |
| -------------------------------------------- | ----------------------- | ------- |
| Reduce thinking music delay (2000ms → 800ms) | `dj-session.service.ts` | ✅ Done |
| Add turn processing timeout with fallback    | `voice-agent.ts`        | ✅ Done |
| Add early silence detection (2.5s)           | `voice-agent.ts`        | ✅ Done |
| Add graceful error recovery                  | `voice-agent.ts`        | ✅ Done |
| Add processing timeout constants             | `constants.ts`          | ✅ Done |

---

## 🔴 Critical Issues (Causes Extended Dead Air)

### 1. No LLM Response Timeout

**Location:** `src/agents/voice-agent.ts` → `onUserTurnCompletedV2`

**Problem:** The turn processing and LLM response generation have no timeout. If Gemini is slow or hangs, the user experiences indefinite dead air.

**Evidence:**

```typescript
// Line 1437 - No timeout wrapping this async call
const result = await processTurn(turnContext);
```

**Impact:** Can cause 5-30+ seconds of silence if LLM is slow or network issues occur.

**Fix:**

```typescript
// Add timeout wrapper with fallback response
const TURN_PROCESSING_TIMEOUT_MS = 3000;

const result = await Promise.race([
  processTurn(turnContext),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Turn processing timeout')), TURN_PROCESSING_TIMEOUT_MS)
  ),
]).catch(async (error) => {
  this.logger.warn({ error: String(error) }, 'Turn processing timeout - using fallback');
  // Say something to fill the gap
  session.say('Hmm, let me think about that...', { allowInterruptions: true });
  // Retry or return minimal result
  return null;
});
```

---

### 2. Thinking Music Delay Too Long

**Location:** `src/services/dj-session.service.ts` → `THINKING_MUSIC_CONFIG`

**Problem:** Thinking music only starts after **2 seconds** of silence during processing. For responses that take 2-4 seconds, there's dead air before music starts, and by the time music starts, the response might arrive creating choppy audio.

**Evidence:**

```typescript
const THINKING_MUSIC_CONFIG = {
  /** How long to wait before starting thinking music */
  delayBeforeStartMs: 2000,  // TOO LONG!
  ...
};
```

**Impact:** 0-2 seconds of complete silence during every LLM processing phase.

**Fix:** Reduce delay to 800ms and add verbal filler:

```typescript
const THINKING_MUSIC_CONFIG = {
  delayBeforeStartMs: 800, // Start sooner
  volume: 0.08,
  maxDurationMs: 15000,
};

// Also add verbal filler before music
// In voice-agent.ts when user stops speaking:
if (!agentRespondedQuickly) {
  session.say(getThinkingFiller(personaId), { allowInterruptions: true });
}
```

---

### 3. Turn Processing Pipeline Too Slow

**Location:** `src/agents/processors/turn-processor.ts`

**Problem:** The `processTurn` function performs ~15 different context building operations sequentially, including async operations. Total processing time can be 500-2000ms before the LLM even starts generating.

**Evidence:**

```typescript
// processTurn does all of this BEFORE sending to LLM:
// 1. analyzeMessage
// 2. updateConversationState
// 3. checkEasterEggs (async import)
// 4. buildEmotionalState
// 5. buildResponseGuidance
// 6. onUserMessage (identity, async)
// 7. buildIdentityContext
// 8. buildHumanizingContextForTurn
// 9. processBundleRuntime
// 10. buildContextInjections (many async operations inside)
// ... and more
```

**Impact:** 500-2000ms delay added to every response, perceived as dead air.

**Fix:**

1. Pre-warm expensive imports during session start
2. Parallelize independent context builders
3. Move non-critical context building to background after initial response
4. Add early verbal acknowledgment:

```typescript
// At start of processTurn, immediately send acknowledgment for long messages
if (userText.length > 100 || analysisResult.emotional.intensity > 0.7) {
  session.say(getQuickAcknowledgment(personaId), { allowInterruptions: true });
}
```

---

## 🟠 High Priority Issues

### 4. Silence Handling Gap (4-10 seconds)

**Location:** `src/agents/voice-agent.ts` lines 2456-2512

**Problem:** There's a silence handling gap:

- Medium silence backchannels only fire at 4+ seconds
- Meaningful silence responses only start at 10+ seconds
- Nothing fills 0-4 seconds if the agent doesn't respond

**Evidence:**

```typescript
const MEDIUM_SILENCE_THRESHOLD_SEC = 4; // Nothing before this!
...
const intervals = [10, 22, 38]; // Meaningful responses only at 10+ seconds
```

**Impact:** If LLM response fails silently, 0-10 seconds of dead air before any recovery.

**Fix:** Add early silence detection at 2-3 seconds:

```typescript
// Add a "processing acknowledgment" at 2-3 seconds
const EARLY_SILENCE_THRESHOLD_SEC = 2.5;

if (
  silenceDurationSec >= EARLY_SILENCE_THRESHOLD_SEC &&
  silenceDurationSec < MEDIUM_SILENCE_THRESHOLD_SEC &&
  !conversationManager.isAgentSpeaking() &&
  !agentResponsePending
) {
  // Quick acknowledgment that we're still here
  session.say('Mm-hmm...', { allowInterruptions: true });
}
```

---

### 5. Empty/Null LLM Response Handling

**Location:** `src/agents/voice-agent.ts`

**Problem:** If the LLM returns an empty response or the response generation fails silently, there's no fallback. The system just waits.

**Evidence:** No explicit check for empty LLM responses after generation.

**Impact:** Complete dead air until silence handling kicks in (10+ seconds).

**Fix:** Add response validation and fallback:

```typescript
// After LLM generates response
session.on(voice.AgentSessionEventTypes.AgentOutput, (event) => {
  if (!event.text || event.text.trim().length === 0) {
    logger.warn('Empty LLM response - using fallback');
    session.say(getGracefulRecoveryPhrase(personaId), { allowInterruptions: true });
  }
});
```

---

### 6. Adaptive Endpointing Over-Extension

**Location:** `src/conversation/adaptive-endpointing.ts`

**Problem:** In heavy emotional contexts, endpointing delays can extend to **3000ms max**. Combined with processing time, this creates 3-5 second gaps that feel like dead air.

**Evidence:**

```typescript
// Maximum wait can be 3 seconds!
maxDelay = Math.max(minDelay + 200, Math.min(maxDelay, 3000));

// Plus adjustments stack up:
// Heavy topic: +600ms max
// Crisis emotion: +800ms max
// Incomplete thought: +700ms max
// Slow speaker: +300ms max
// = Potential 2400ms ADDED to maxDelay
```

**Impact:** 3+ seconds waiting for user to finish, perceived as dead air.

**Fix:** Cap total adjustments and provide feedback:

```typescript
// Cap total adjustments
const MAX_TOTAL_ADJUSTMENT = 800;
const totalAdjustment = Math.min(
  adjustments.reduce((sum, a) => sum + a.maxAdd, 0),
  MAX_TOTAL_ADJUSTMENT
);

// During long waits, provide subtle presence
if (maxDelay > 2000) {
  // Schedule soft presence indicator at 1.5 seconds
  setTimeout(() => {
    if (stillWaitingForUser) {
      sendPresenceSignal(); // Subtle audio cue that we're listening
    }
  }, 1500);
}
```

---

## 🟡 Medium Priority Issues

### 7. Handoff Transition Gaps

**Location:** `src/agents/shared/handoff-handler.ts`, `src/agents/shared/constants.ts`

**Problem:** During persona handoffs, there can be dead air while the new persona initializes.

**Evidence:**

```typescript
export const HANDOFF_DELAYS = {
  USER_INITIATED: 200,
  FIRST_MEETING: 400,
  RETURNING_TO_COACH: 300,
  STANDARD: 350,
};
```

These are short, but the actual handoff involves:

- Generating persona greeting (async)
- Relationship stage lookup
- Voice switching
- TTS initialization

**Impact:** 500ms-2s gaps during handoffs.

**Fix:** Pre-load persona assets and use verbal bridges:

```typescript
// Before handoff completes, say transition phrase
session.say('Let me get ${newPersona.name} for you...', { allowInterruptions: false });
// Then do the handoff
```

---

### 8. Tool Execution Silence

**Location:** `src/agents/voice-agent.ts` lines 2135-2228

**Problem:** When tools execute (calendar, search, etc.), there's no verbal feedback during execution. Long-running tools create dead air.

**Evidence:**

```typescript
session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
  // Only logging, no verbal feedback during execution
  logger.info({ event }, '🔧 FUNCTION TOOLS EXECUTED');
});
```

**Impact:** 1-10+ seconds of silence during tool calls.

**Fix:** Add tool-specific verbal fillers:

```typescript
// Before tool executes (would need new event or hook)
const toolFillers = {
  calendar: 'Let me check your calendar...',
  search: 'Looking that up...',
  weather: 'Checking the weather...',
  default: 'Give me just a moment...',
};
```

---

### 9. DJ Booth Initialization Failure

**Location:** `src/agents/voice-agent.ts` lines 3113-3156

**Problem:** If DJ Booth fails to initialize (which can happen), thinking music won't play, removing a key dead air mitigation.

**Evidence:**

```typescript
} catch (djError) {
  diag.warn('🎧 DJ intro failed (non-fatal)', { error: String(djError) });
  // No fallback - thinking music won't be available
}
```

**Impact:** Loss of thinking music fallback for entire session.

**Fix:** Create lightweight fallback that doesn't depend on DJ Booth:

```typescript
// Fallback thinking music without DJ Booth
if (!_djBooth) {
  // Use simple verbal fillers instead
  setupVerbalFillerFallback(session, personaId);
}
```

---

## Quick Wins ✅ IMPLEMENTED

### 1. ✅ Reduce Thinking Music Delay

```typescript
// src/services/dj-session.service.ts - DONE
const THINKING_MUSIC_CONFIG = {
  delayBeforeStartMs: 800, // Was 2000
  maxDurationMs: 15000, // Was 30000
  fadeOutDurationMs: 1000, // Was 1500
};
```

### 2. ✅ Add Quick Acknowledgments

```typescript
// src/agents/voice-agent.ts - DONE
// Uses getThinkingFiller() when processing takes >2.5s
```

### 3. ✅ Add Early Silence Detection

```typescript
// src/agents/shared/constants.ts - DONE
EARLY_ACKNOWLEDGMENT_SECONDS: 2.5,
TURN_PROCESSING_SOFT_TIMEOUT: 2500,
TURN_PROCESSING_HARD_TIMEOUT: 5000,
```

### 4. ✅ Add LLM Response Timeout + Graceful Recovery

```typescript
// src/agents/voice-agent.ts - DONE
// Wrapped turn processing in Promise.race with soft/hard timeouts
// On error: speaks graceful recovery message via getGracefulErrorResponse()
```

---

## Metrics to Track

Add these metrics to measure dead air:

1. **Time-to-first-byte (TTFB)**: Time from user speech end to first agent audio
2. **Processing time**: Time spent in `processTurn()`
3. **LLM latency**: Time for Gemini to respond
4. **Silence duration**: Track any silence >1.5 seconds
5. **Recovery rate**: How often fallbacks trigger

---

## Recommended Implementation Order

1. **Day 1**: Quick wins (reduce delays, add acknowledgments)
2. **Day 2**: LLM timeout with fallback responses
3. **Day 3**: Early silence detection (2.5s)
4. **Week 2**: Turn processing optimization
5. **Week 2**: Tool execution feedback

---

## Testing Checklist

After implementing fixes:

- [ ] No silence >2 seconds during normal conversation
- [ ] Heavy emotional topics still get appropriate space
- [ ] Tool calls have verbal feedback
- [ ] LLM timeouts trigger graceful recovery
- [ ] Handoffs feel smooth
- [ ] Thinking music starts quickly on slow responses

---

## Appendix: Timing Constants (Updated)

| Setting                     | Location              | Previous | New Value   | Status |
| --------------------------- | --------------------- | -------- | ----------- | ------ |
| Min Endpointing Delay       | voice-agent.ts        | 400ms    | 400ms       | ✓      |
| Max Endpointing Delay       | voice-agent.ts        | 1200ms   | 1200ms      | ✓      |
| Thinking Music Delay        | dj-session.service.ts | 2000ms   | **800ms**   | ✅     |
| Thinking Music Max Duration | dj-session.service.ts | 30000ms  | **15000ms** | ✅     |
| Early Acknowledgment        | constants.ts          | N/A      | **2.5s**    | ✅ NEW |
| Soft Processing Timeout     | constants.ts          | N/A      | **2500ms**  | ✅ NEW |
| Hard Processing Timeout     | constants.ts          | N/A      | **5000ms**  | ✅ NEW |
| Medium Silence Threshold    | voice-agent.ts        | 4s       | 4s          | ✓      |
| Meaningful Silence Start    | voice-agent.ts        | 10s      | 10s         | ✓      |
| Silence Response Interval   | constants.ts          | 10s      | 10s         | ✓      |
| Backchannel Trigger         | voice-agent.ts        | 3500ms   | 3500ms      | ✓      |
| Backchannel Min Interval    | voice-agent.ts        | 5000ms   | 5000ms      | ✓      |

---

_Audit completed: December 9, 2025_
_Fixes implemented: December 9, 2025_
_Auditor: AI Pair Programming Assistant_
