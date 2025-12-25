# E2E Response Latency & Conversational Quality Audit

> **Audit Date**: December 25, 2024
> **Scope**: Full voice agent pipeline from user speech to audio response
> **Problem**: Ferni is often slow to respond and doesn't feel conversational

---

## Executive Summary

The voice agent has **sophisticated latency optimizations in place**, but several critical integration issues prevent them from working:

| Issue | Severity | Impact | Fix Effort |
|-------|----------|--------|------------|
| **Cache-aware TTS buffers entire stream** | CRITICAL | +200-500ms | Medium |
| **Context injection in critical path** | HIGH | +200-400ms | Medium |
| **Sentence buffering delays first audio** | HIGH | +50-200ms | Low |
| **No emotion context passed to TTS** | MEDIUM | Cache misses | Low |

**Estimated current TTFA (Time to First Audio)**: 800-1500ms
**Achievable TTFA with fixes**: 400-700ms

---

## Pipeline Architecture

```
User Speech → LiveKit WebRTC → STT → User Transcript
                                          ↓
                                   Turn Processing (200-400ms)
                                          ↓
                              ┌──────────────────────────────┐
                              │  23+ Context Builders Run     │
                              │  (Sequential blocking path)   │
                              └──────────────────────────────┘
                                          ↓
                                   LLM Inference (200-800ms)
                                          ↓
                               ┌───────────────────────────────┐
                               │  TTS Pipeline                  │
                               │  1. JSON Sanitizer (10-50ms)   │
                               │  2. Interrupt-aware (20ms)     │
                               │  3. Cost tracking (5ms)        │
                               │  4. Streaming chunks (20ms)    │
                               │  5. Cache-aware TTS ⚠️ BROKEN  │
                               │  6. Cartesia synthesis (60-150ms)
                               └───────────────────────────────┘
                                          ↓
                                   Audio → User
```

---

## Critical Issue #1: Cache-Aware TTS Defeats Streaming

**File**: `src/agents/shared/performance/cache-aware-tts.ts:378-393`

### The Problem

The `createCacheAwareTTSNode` function reads the **ENTIRE text stream** before checking the cache:

```typescript
// BROKEN: Reads ALL text before checking cache
let fullText = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
  fullText += value;  // ← Waits for ENTIRE LLM response!
}

// Only NOW checks cache
const cacheResult = await getTTSWithSpeculation(fullText.trim(), voiceId, emotion);
```

### Impact

- **Adds 200-500ms latency** (entire LLM generation time)
- Streaming TTS Transform (which chunks at 15-20 chars) is completely wasted
- User hears nothing until LLM finishes generating

### Fix

Stream-check the cache as chunks arrive instead of batch-collecting:

```typescript
// FIX: Check cache incrementally as sentences complete
async transform(chunk, controller) {
  buffer += chunk;

  // Check cache for complete phrases
  const sentenceEnd = buffer.match(/^(.+?[.!?])\s*(.*)$/);
  if (sentenceEnd && sentenceEnd[1].length >= 10) {
    const sentence = sentenceEnd[1].trim();

    // Try speculative cache for this sentence
    const cached = await getTTSWithSpeculation(sentence, voiceId, emotion);
    if (cached.cached) {
      // Emit cached audio directly, skip Cartesia!
      yield* splitIntoFrames(cached.audio);
      buffer = sentenceEnd[2];
      return;
    }

    // Cache miss - pass to default TTS
    controller.enqueue(sentence + ' ');
    buffer = sentenceEnd[2];
  }
}
```

---

## Critical Issue #2: Context Injection Blocks LLM Start

**File**: `src/agents/processors/injection-builders.ts` (1,627 lines)

### The Problem

**23+ context builders** run in the critical path before LLM can start generating:

| Builder | Latency | Operation |
|---------|---------|-----------|
| `buildIntegratedContext()` | 100-150ms | Behavioral system + memory lookups |
| `buildScientificCoachingInjections()` | 80-120ms | SessionDynamicsEngine + analysis |
| `buildTrustSystemsInjections()` | 100ms | File I/O for trust-phrases.json |
| `buildCrossPersonaInsightsInjection()` | 40-60ms | Firestore queries |
| `buildVisualMemoryInjections()` | 40-60ms | Firestore photo lookup |
| `buildUserHealthInjection()` | 50-80ms | Apple HealthKit API |

**Total blocking time**: 200-400ms

### Impact

LLM can't start generating until ALL injections complete, even non-critical ones.

### Fix Options

1. **Tiered injection loading**: Critical injections sync, others async
2. **Lazy injection**: Some injections mid-conversation only (not turn 1)
3. **Cached injections**: Health/visual memory cached 60s, not per-turn
4. **Hard timeout**: Drop non-critical injections after 150ms

```typescript
// Proposed: Tiered injection with hard timeout
const CRITICAL_INJECTIONS = ['safety', 'crisis', 'identity'];
const OPTIONAL_INJECTIONS = ['visual_memory', 'health', 'cross_persona'];

// Critical: await
const criticalInjections = await buildCriticalInjections(ctx);

// Optional: race against timeout
const optionalInjections = await Promise.race([
  buildOptionalInjections(ctx),
  new Promise(r => setTimeout(() => r([]), 150)) // 150ms hard cap
]);
```

---

## Critical Issue #3: Sentence Buffering Delays First Audio

**File**: `src/services/performance/speculative-tts.ts:475-506`

### The Problem

TTS waits for **complete sentences** before generating audio:

```typescript
// CURRENT: Waits for sentence boundary
const sentenceEnd = buffer.match(/[.!?]\s|,\s{2,}|\.{3,}|\n/);

if (sentenceEnd && buffer.length >= minChunkSize) {
  // Only NOW sends to TTS
}
```

### Impact

- First audio delayed 50-200ms waiting for first sentence to complete
- LLM outputs `"I" → "hear" → "you."` but audio waits for period

### Fix

Send first chunk after 2-3 tokens (8-12 chars), not sentence boundary:

```typescript
// FIX: Aggressive first chunk, sentence-based subsequent
const isFirstChunk = !hasSentFirstChunk;
const minSize = isFirstChunk ? 8 : 30;  // 8 chars first, 30 after

if (buffer.length >= minSize || (isFirstChunk && buffer.length > 3)) {
  // Send immediately
  yield this.getTTS(buffer, voiceId, emotion);
  buffer = '';
  hasSentFirstChunk = true;
}
```

---

## Critical Issue #4: Emotion Context Not Passed to TTS

**File**: `src/agents/shared/tts-wrapper.ts:133`

### The Problem

Emotion IS detected during turn processing and stored in `userData.currentEmotion`:

```typescript
// turn-handler.ts:553 - Emotion is detected and stored
(userData as Record<string, unknown>).currentEmotion = result.emotional.primary;
```

But the TTS wrapper extracts it correctly:

```typescript
// tts-wrapper.ts:279 - Emotion IS being extracted
emotion: userData?.currentEmotion as string | undefined,
```

### The Real Issue

The speculative TTS cache uses emotion-keyed lookups:
```typescript
// Cache key format: `${voiceId}:${emotion}:${text}`
const key = this.getCacheKey(text, voiceId, emotion);
```

But `speculateTTS()` in turn-handler.ts (line 271-279) runs BEFORE emotion is set:

```typescript
// turn-handler.ts:266-279
markTurnCheckpoint(services.sessionId, turnNumber, 'analysisComplete');

// ⚠️ speculateTTS runs here with result.emotional.primary
void speculateTTS(services.sessionId, persona.id, {
  emotion: result.emotional?.primary,  // ← This is correct
  ...
});

// BUT userData.currentEmotion is set LATER at line 553
```

The speculative cache IS getting the emotion, but there may be a disconnect in cache key formats.

---

## Issue #5: Turn Processing Time (Moderate)

**File**: `src/agents/voice-agent/turn-handler.ts`

### Current Flow

```
handleUserTurn() called at ~0ms
├── Slash command check: <5ms
├── startTurnProfiling(): <5ms
├── Start filler check interval (200ms checks)
│
├── processTurn() called: ~5ms
│   ├── analyzeMessage(): 30-80ms
│   ├── updateConversationState(): <5ms
│   ├── buildEmotionalState(): 20-100ms
│   ├── processConversationDynamics(): 20-50ms
│   ├── buildContextInjections(): 200-400ms ⚠️ SLOWEST
│   └── Advanced humanization: 80-150ms
│
├── Personality processing: 20-50ms
├── Context injection into LLM: <5ms
└── LLM starts generating: ~450-800ms from turn start
```

### The Filler System Is Working

The adaptive filler system at line 220-244 is well-designed:
- Checks every 200ms if processing exceeds threshold
- Injects "Let me think..." at 2.5s+ (configurable)
- Prevents dead air during slow processing

But the thresholds may be too conservative for conversational feel.

---

## Issue #6: OpenAI vs Gemini Latency

**File**: `.env` → `USE_OPENAI_REALTIME`

### Comparison

| Metric | OpenAI Realtime | Gemini Live |
|--------|-----------------|-------------|
| First token | 150-400ms | 200-600ms |
| Tool calling | Native (reliable) | JSON workaround (unreliable) |
| Function format | Protocol-level | Text extraction needed |
| Stability | Consistent | Variable |

### Recommendation

**Use OpenAI Realtime** (`USE_OPENAI_REALTIME=true`) for production. It's:
- 40-50% faster to first token
- More reliable tool calling
- No JSON sanitizer needed (skip 10-50ms)

---

## Latency Budget Analysis

### Current State (Estimated)

| Phase | Min | Typical | Max |
|-------|-----|---------|-----|
| Turn processing | 100ms | 300ms | 500ms |
| Context injections | 150ms | 300ms | 450ms |
| LLM first token | 150ms | 400ms | 800ms |
| Stream buffering (broken) | 200ms | 350ms | 500ms |
| TTS synthesis | 60ms | 100ms | 150ms |
| **Total TTFA** | **660ms** | **1450ms** | **2400ms** |

### Optimized State (Achievable)

| Phase | Min | Typical | Max |
|-------|-----|---------|-----|
| Turn processing | 50ms | 150ms | 250ms |
| Context injections (tiered) | 50ms | 100ms | 150ms |
| LLM first token | 150ms | 300ms | 500ms |
| Stream buffering (fixed) | 0ms | 20ms | 50ms |
| TTS synthesis (cached) | 0ms | 40ms | 100ms |
| **Total TTFA** | **250ms** | **610ms** | **1050ms** |

---

## Recommendations (Priority Order)

### P0 - Critical (Do This Week)

1. **Fix cache-aware TTS streaming** (`cache-aware-tts.ts`)
   - Stop reading entire stream before cache check
   - Implement incremental phrase checking
   - Expected gain: **150-350ms**

2. **Remove sentence buffering for first chunk** (`speculative-tts.ts`)
   - Send first TTS chunk after 8-12 chars
   - Keep sentence-based for subsequent chunks
   - Expected gain: **50-150ms**

### P1 - High Priority (This Sprint)

3. **Tier context injection builders** (`injection-builders.ts`)
   - Critical (sync): safety, crisis, identity
   - Optional (async/timeout): health, visual, cross-persona
   - Expected gain: **100-250ms**

4. **Switch to OpenAI Realtime for production**
   - Faster, more reliable tool calling
   - Disable JSON sanitizer
   - Expected gain: **50-150ms**

### P2 - Medium Priority (Next Sprint)

5. **Cache non-volatile injections** (60s TTL)
   - Health data, visual memories, team insights
   - These don't change turn-to-turn
   - Expected gain: **50-100ms**

6. **Reduce filler threshold** to feel more conversational
   - Current: 2.5s before filler
   - Suggest: 1.5-2s for faster perception
   - This is perception, not latency

### P3 - Lower Priority

7. **Parallel context builders** where independent
8. **Profile Firestore batch operations**
9. **Monitor Cartesia latency trends**

---

## Key Files to Modify

| Priority | File | Change |
|----------|------|--------|
| P0 | `src/agents/shared/performance/cache-aware-tts.ts` | Stream-check cache, don't batch |
| P0 | `src/services/performance/speculative-tts.ts` | Aggressive first chunk |
| P1 | `src/agents/processors/injection-builders.ts` | Tier into critical/optional |
| P1 | `.env` | `USE_OPENAI_REALTIME=true` |
| P2 | `src/agents/shared/performance/adaptive-timing.ts` | Lower filler thresholds |

---

## Testing Checklist

After implementing fixes:

- [ ] Measure TTFA with turn profiler (`getPerformanceMetrics()`)
- [ ] Verify cache hit rate increases (`getCacheAwareTTSMetrics()`)
- [ ] Monitor speculative TTS hit rate (`getSpeculativeTTSMetrics()`)
- [ ] User testing: Does it "feel" more conversational?
- [ ] A/B test filler thresholds

---

## Appendix: What's Working Well

The codebase has excellent infrastructure that just needs better integration:

- **Turn Profiling** (`turn-profiler.ts`) - Comprehensive metrics, just underutilized
- **Adaptive Timing** (`adaptive-timing.ts`) - Smart session-aware thresholds
- **Streaming TTS Transform** (`streaming-tts-transform.ts`) - Aggressive chunking ready
- **Speculative TTS Engine** (`speculative-tts.ts`) - Emotion-aware cache warming
- **Cache Warmup at Session Start** (`integration.ts:127-143`) - Pre-warms 5 emotions
- **Semantic Routing** (`semantic-router/`) - <20ms tool execution when matched

---

*Audit conducted December 2024*
