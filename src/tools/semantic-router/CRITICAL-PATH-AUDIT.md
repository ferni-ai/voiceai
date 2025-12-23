# Semantic Router - Critical Path Audit & Speaking Overlap Analysis

> **Audit Date:** December 2024  
> **Status:** 🟡 Several issues requiring attention

---

## Executive Summary

This audit identifies **critical paths** where failures would most impact user experience, and **speaking overlap issues** that can make interactions feel non-human. The semantic router is architecturally sound but has several race conditions and timing issues in the voice integration layer.

---

## Critical Paths (Failure Impact Analysis)

### 🔴 CRITICAL: Dual Speaking Path Race Condition

**Location:** `tool-call-sanitizer.ts` lines 1476-1565

**The Problem:**
When a JSON function call is detected and executed, TWO different speaking mechanisms can fire:

```
                    ┌─────────────────────────────────────┐
                    │  JSON Function Call Detected        │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌─────────────────────┐         ┌─────────────────────┐
        │ speakDirectly=true  │         │ speakDirectly=false │
        │ session.say()       │         │ safeGenerateReply() │
        └─────────────────────┘         └─────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                        🔴 BOTH CAN FIRE SIMULTANEOUSLY!
```

**Risk:** If the `speakDirectly` check and tool result processing have any async timing issues, both paths could speak, causing overlapping audio.

**Evidence:**
```typescript
// Line 1489-1505: Direct speech path
if (execResult.speakDirectly) {
  session.say(resultText, { allowInterruptions: true });
  return; // ← Should prevent second path, but async timing could race
}

// Line 1514-1537: safeGenerateReply path (can still fire if return didn't execute)
if (session) {
  await safeGenerateReply(session, { ... });
}
```

**Fix Required:** Add explicit mutex lock for tool result speaking.

---

### 🔴 CRITICAL: Stream Injection Race Condition

**Location:** `tool-call-sanitizer.ts` lines 1476, 1656

**The Problem:**
Tool execution happens async inside a TransformStream. If the tool takes >150ms (the buffer threshold), the stream may start emitting new content while the tool result is still being processed.

```
Time →   0ms         100ms        150ms        200ms        300ms
         │            │            │            │            │
Stream:  [buffer JSON...]         [emit buffer] [new chunk...]
         │            │            │            │            │
Tool:    [execute...] [.........] [done] [speak result]
                                          │
                                          └─ 🔴 OVERLAP with stream!
```

**Current "Fix":** `suppressChunksRemaining = 5` tries to suppress 5 chunks after JSON, but:
- Chunk timing is unpredictable
- Slow tools (news, weather) take 1-3 seconds
- Fast tools complete before suppression ends, stream resumes

**Fix Required:** Use state machine instead of chunk counting.

---

### 🔴 CRITICAL: Music Fallback Fire-and-Forget

**Location:** `tool-call-sanitizer.ts` lines 1336-1377, 1766-1768

**The Problem:**
```typescript
// Fire-and-forget - no coordination with main execution path
void tryMusicFallback(musicQuery).catch((e) => { ... });
```

If BOTH the music fallback AND the JSON executor run, you get:
1. Two music play requests (duplicate playback)
2. Two spoken acknowledgments

**Evidence:** The `musicFallbackInFlight` flag only prevents concurrent fallbacks, not fallback + main path overlap.

**Fix Required:** Coordinate fallback with main execution path using shared state.

---

### 🟡 HIGH: JSON Fragment Accumulation Timeout

**Location:** `tool-call-sanitizer.ts` lines 1427-1596

**The Problem:**
When Gemini sends fragmented JSON like:
```
Chunk 1: {"
Chunk 2: fn":"playMusic","args":{"query":"jazz"}}
```

The accumulator buffers up to 500 chars. If the JSON is malformed or never completes:
```typescript
if (jsonAccumulator.length > MAX_JSON_ACCUMULATOR_SIZE) {
  // Emit what we accumulated (it wasn't JSON after all)
  controller.enqueue(jsonAccumulator);  // 🔴 Emits partial tool call text!
}
```

**Risk:** User hears partial JSON like `{"fn":"playMu` spoken aloud.

**Fix Required:** Sanitize accumulated content before emitting.

---

### 🟡 HIGH: generateReply Mutex Doesn't Cover Tool Results

**Location:** `safe-generate-reply.ts` lines 143-167

**The Problem:**
The mutex in `safeGenerateReply` prevents concurrent `generateReply` calls, but tool result speaking uses BOTH:
- `session.say()` (bypasses mutex)
- `safeGenerateReply()` (uses mutex)

```typescript
// Direct speech (NO mutex)
session.say(resultText, { allowInterruptions: true });

// Via generateReply (HAS mutex)
await safeGenerateReply(session, { ... });
```

**Risk:** If a tool result uses `say()` while another part of the system uses `generateReply()`, they overlap.

**Fix Required:** Unified speech mutex across all speaking paths.

---

## Speaking Overlap Issues (Non-Human Interactions)

### 🔴 Echo Prevention Window Too Short

**Location:** `session-state-handler.ts` line 278

**The Problem:**
```typescript
const ECHO_GRACE_PERIOD_MS = 800;
```

800ms is too short for:
- Long agent responses (can be 3-5 seconds)
- Reverberant environments
- Network latency jitter

**Result:** User's mic picks up agent audio, VAD thinks user is speaking, triggers backchannel → agent interrupts itself.

**Fix:** Dynamic echo window based on last utterance length + room acoustics estimate.

---

### 🟡 Random Acknowledgment Patterns

**Location:** `tool-call-sanitizer.ts` lines 1227-1270

**The Problem:**
```typescript
const newsAcks = [
  'Hold on, let me grab that for you.',
  'One sec, pulling up the latest.',
  "Let me check what's happening out there.",
  'Hang on, grabbing some headlines.',
  'Give me just a moment to look that up.',
];
return newsAcks[Math.floor(Math.random() * newsAcks.length)];
```

Real humans have consistent verbal patterns. Random selection makes Ferni feel inconsistent.

**Fix:** Use persona-specific patterns with weighted selection based on user preference learning.

---

### 🟡 Clarification Question Cascade

**Location:** `uncertainty.ts` lines 315-355

**The Problem:**
The uncertainty system can generate MULTIPLE clarifying questions:
```typescript
if (needsClarification) {
  questions.push(this.generateClarifyingQuestion(...));
  
  if (match.extractedArgs && Object.keys(match.extractedArgs).length === 0) {
    questions.push(this.generateArgClarification(match));  // Second question!
  }
}
```

**Result:** Agent might say: "Would you like me to play music, or did you mean check the weather? What would you like to listen to?"

Two questions in rapid succession feels robotic.

**Fix:** Return only ONE question, prioritized by relevance.

---

### 🟡 Abrupt Timeout Fallbacks

**Location:** `tool-call-sanitizer.ts` lines 1534-1537

**The Problem:**
```typescript
// Fallback message if LLM response times out
fallbackMessage: isMusicTool ? "Here's some music for you." : "Got it!",
```

When a 5-second timeout fires after a complex query like "What's the market doing with tech stocks?", hearing just "Got it!" is jarring.

**Fix:** Generate context-aware fallbacks: "Still working on that market summary..."

---

### 🟡 Aggressive Guidance Pattern Detection

**Location:** `tool-call-sanitizer.ts` lines 684-845

**The Problem:**
The leakage detection patterns are very aggressive:
```typescript
/\[[A-Z][A-Z\s_-]+[A-Z]\]/  // Any [ALL_CAPS_LABEL] anywhere
```

This could catch legitimate user content like:
- "Check out [IMPORTANT] news"
- "My project uses [API_KEY] environment variable"

**Current Mitigation:** Case-sensitive check, but still risky.

**Fix:** Only check at message start OR after `\n`, not inline.

---

## Semantic Router Critical Path Analysis

### Path 1: High-Confidence Direct Execution

```
User Input → routeUserInput() → confidence > 0.92 → executeMatchedTool()
     ↓
  SUCCESS: <20ms latency, bypasses LLM entirely ✅

  FAILURE POINTS:
  1. Tool not found in registry → returns "Tool not found" error
  2. Tool execution throws → falls back to LLM (good degradation)
  3. Tool returns non-speakable result → JSON might leak to TTS
```

**Risk Level:** 🟢 LOW - Good error handling, graceful degradation

---

### Path 2: Medium-Confidence Hint Path

```
User Input → routeUserInput() → confidence 0.6-0.85 → hint to LLM
     ↓
  LLM gets: "[TOOL HINT] Consider using: playMusic (confidence: 72%)"
     ↓
  FAILURE POINTS:
  1. LLM ignores hint → tool never executes
  2. LLM reads hint aloud → "[TOOL HINT]" spoken to user ← 🔴 CRITICAL
  3. LLM uses tool but wrong args → misrouted action
```

**Risk Level:** 🟡 MEDIUM - Hint leakage is possible

**Evidence:** Line 251-276 in `voice-integration.ts`:
```typescript
function generateLLMHint(type: string, action: RouterAction): string {
  // These hints could leak if LLM doesn't process them correctly
  return `[TOOL HINT] Consider using: ${action.toolId}`;
}
```

---

### Path 3: Clarification Flow

```
User Input → confidence < 0.6 OR multiple close matches → needsClarification
     ↓
  Generate clarifying question → inject into LLM context
     ↓
  FAILURE POINTS:
  1. Multiple questions generated → cascade effect
  2. Question doesn't match user context → confused user
  3. Clarification loop → user asks same thing, gets same question
```

**Risk Level:** 🟡 MEDIUM - Clarification loops feel robotic

---

### Path 4: JSON Fallback Path

```
User Input → low semantic confidence → LLM generates JSON
     ↓
  Sanitizer detects: {"fn":"playMusic","args":{"query":"jazz"}}
     ↓
  executeJsonFunctionCall() → tool executes
     ↓
  FAILURE POINTS:
  1. JSON fragmented across chunks → accumulator timeout
  2. Tool slow → stream resumes before result
  3. speakDirectly race condition → dual speech
  4. Suppression chunk count wrong → trailing "Ok so..." spoken
```

**Risk Level:** 🔴 HIGH - Multiple failure modes, timing-sensitive

---

## Recommended Fixes (Priority Order)

### P0: Fix Dual Speaking Path
```typescript
// Add speech mutex at module level
let speechInProgress = false;
let speechQueue: Array<{text: string, options: SpeakOptions}> = [];

async function safeSpeakResult(session, text, options) {
  if (speechInProgress) {
    speechQueue.push({text, options});
    return;
  }
  speechInProgress = true;
  try {
    await session.say(text, options);
  } finally {
    speechInProgress = false;
    // Process queue
  }
}
```

### P0: Fix Stream/Tool Execution Race
```typescript
// Replace chunk counting with state machine
enum StreamState {
  NORMAL,
  ACCUMULATING_JSON,
  EXECUTING_TOOL,
  SUPPRESSED_UNTIL_SENTENCE_BOUNDARY,
}

let state = StreamState.NORMAL;
let toolExecutionPromise: Promise<void> | null = null;

// In transform:
if (state === StreamState.EXECUTING_TOOL) {
  // Buffer everything until tool completes
  pendingBuffer += chunk;
  return;
}
```

### P1: Dynamic Echo Window
```typescript
const calculateEchoWindow = (lastUtteranceMs: number) => {
  // Base window + utterance-proportional addition
  const baseWindow = 500;
  const utteranceFactor = Math.min(lastUtteranceMs * 0.3, 2000);
  return baseWindow + utteranceFactor;
};
```

### P1: Single Clarification Question
```typescript
assessClarificationNeed(): { needsClarification: boolean; question: string | null } {
  // Return only the highest-priority question
  if (uncertainty.aleatoric > 0.5) {
    return { needsClarification: true, question: this.generateDisambiguation() };
  }
  if (missingRequiredArgs) {
    return { needsClarification: true, question: this.generateArgQuestion() };
  }
  return { needsClarification: false, question: null };
}
```

### P2: Persona-Consistent Acknowledgments
```typescript
// In persona bundle config
export const ferniAcknowledgments = {
  fetching: "Let me check on that.", // Ferni's consistent phrase
  thinking: "Hmm, give me a moment.",
  working: "Working on it...",
};

// Use consistently, not randomly
getAcknowledgment(type: string, personaId: string): string {
  return personaAcknowledgments[personaId][type];
}
```

---

## Testing Recommendations

### 1. Speaking Overlap Test
```typescript
test('should not produce overlapping speech when tool executes during stream', async () => {
  const speechEvents: number[] = [];
  mockSession.say = () => { speechEvents.push(Date.now()); };
  
  // Trigger JSON tool call
  await processChunk('{"fn":"slowTool","args":{}}');
  
  // Wait for tool execution
  await new Promise(r => setTimeout(r, 2000));
  
  // Check speech events don't overlap (min 200ms apart)
  for (let i = 1; i < speechEvents.length; i++) {
    expect(speechEvents[i] - speechEvents[i-1]).toBeGreaterThan(200);
  }
});
```

### 2. Clarification Cascade Test
```typescript
test('should return at most one clarifying question', async () => {
  const result = await routeUserInput('do something', {
    // Ambiguous input
  });
  
  const questions = result.calibrated?.clarifyingQuestions ?? [];
  expect(questions.length).toBeLessThanOrEqual(1);
});
```

### 3. Echo Prevention Test
```typescript
test('should not trigger backchannel during agent speech playback', async () => {
  // Start agent speaking
  simulateAgentSpeaking(3000); // 3 second utterance
  
  // After 800ms, simulate audio picked up by mic
  await sleep(850);
  simulateUserAudio();
  
  // Should NOT trigger backchannel
  expect(backchannelTriggered).toBe(false);
});
```

---

## Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Speech overlap incidents | 0/day | >1/hour |
| Tool hint leakage to TTS | 0/day | >0 |
| Clarification loops | <5% of sessions | >10% |
| Echo-triggered backchannels | <1% | >5% |
| JSON accumulator timeouts | <1% | >5% |
| Dual path race conditions | 0/day | >0 |

---

## Conclusion

The semantic router architecture is sound for tool selection. The critical issues are in the **voice integration layer** where:

1. **Multiple speaking paths** can race and overlap
2. **Async tool execution** isn't properly coordinated with stream output
3. **Timing assumptions** (chunk counts, echo windows) are too rigid

Fixing these requires a **unified speech coordinator** that serializes all output to the user, regardless of source (tool result, LLM response, backchannel, acknowledgment).

---

_Last updated: December 2024_
_Audit by: Voice Agent Team_

