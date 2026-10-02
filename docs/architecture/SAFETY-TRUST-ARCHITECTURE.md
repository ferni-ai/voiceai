# Safety & Trust Architecture

> **User safety is non-negotiable. Trust enforcement makes AI human.**

This document explains how crisis detection, safety guards, and trust enforcement work in the voice agent pipeline.

## Overview

The safety and trust systems operate at multiple points in the pipeline:

```
User Speech → STT → Turn Processor → LLM → TTS → Voice Output
                    ↑
                    │
         Pre-response Safety
         Crisis Detection
         Trust Context Injection
```

Nothing inspects or rewrites the reply after the LLM generates it.

## Key Architectural Decision: Pre-Response vs Post-Response

### Why Pre-Response is Primary

The LiveKit SDK uses **streaming responses** that flow directly from LLM to TTS:

```typescript
// In ferni-agent.ts ttsNode()
const filteredText = text.pipeThrough(sanitizerWithFallback);
return super.ttsNode(filteredText, modelSettings);
```

This streaming architecture makes traditional post-response validation difficult because:
1. Response text arrives in chunks
2. We can't easily buffer the entire response before speech
3. Blocking would introduce unacceptable latency

### The Solution: Strong Pre-Response Guidance

Instead of trying to validate after the LLM generates, we:

1. **Detect crisis/trust signals BEFORE the LLM runs** (`turn-processor.ts`)
2. **Inject high-priority context** that guides the LLM's response
3. **Override the LLM entirely** for severe crisis situations

## Crisis Detection Flow

### Step 1: Detection (turn-processor.ts)

```typescript
const crisisResult = detectCrisis(userText, voiceEmotionContext);
const preResponseGuard = guardPreResponse(userText, voiceEmotionContext);
```

Crisis is detected based on:
- Explicit crisis language ("I want to end my life", "no point in living")
- Implicit distress signals ("everything is falling apart", "can't cope")
- Voice emotion (distressed, high intensity)

### Step 2: Response Decision (turn-handler.ts)

```typescript
if (result.crisis?.shouldOverrideLLM && result.crisis.suggestedResponse) {
  // SEVERE: Override LLM with pre-written crisis response
  turnCtx.addMessage({
    role: 'system',
    content: `[CRITICAL SAFETY OVERRIDE]\n${result.crisis.suggestedResponse}`,
  });
} else if (result.crisis?.isCrisis) {
  // MODERATE: Add high-priority injection to guide LLM
  result.context.injections.unshift({
    category: 'crisis_response',
    content: `[CRITICAL - USER SAFETY]...\nYou are their lifeline right now.`,
    priority: 100,
  });
}
```

### Step 3: Frontend Notification

```typescript
await sendDataMessage('crisis_detected', {
  severity: result.crisis.severity,
  indicators: result.crisis.indicators,
});
```

## Trust Enforcement Flow

### Pre-Response: Context Injections

Trust context (emotional mismatches, growth reflections, celebrations) is built in `buildTrustSystemsInjections()` and injected before the LLM generates:

```typescript
// Emotional mismatch detected
injections.push({
  category: 'unsaid',
  content: `[🎧 UNSAID SIGNAL: EMOTIONAL_MISMATCH]
What I noticed: "User says fine but voice suggests otherwise"
Suggested phrase: "I notice something in your voice..."`,
  priority: 85,
});
```

### Post-Response: Monitoring Only

Because of streaming, we can't easily modify responses after LLM generation. Instead:

1. **Trust context summary is emitted as events** to the frontend
2. **Frontend can adapt avatar expressions** based on signals
3. **Metrics are logged** for monitoring and ML training

```typescript
// In turn-handler.ts
if (result.trustContext?.hasEmotionalMismatch) {
  await sendDataMessage('trust_signal', {
    type: 'emotional_mismatch_detected',
    avatarHint: 'attentive',
  });
}
```

## Module Responsibilities

### `src/agents/safety/crisis-guard.ts`

| Function | Purpose |
|----------|---------|
| `detectCrisis()` | Analyze user text + voice for crisis indicators |
| `guardPreResponse()` | Replace the reply with a pre-written one (988 resources) at severity >= 0.85 |

Below 0.85 a detected crisis reaches the LLM only as injected context. No
post-response guard guarantees crisis resources in that band. A post-response
guard and a trust enforcer existed for a response processor that never ran on
calls; both were removed.

### `src/agents/processors/turn-processor.ts`

| Output | Purpose |
|--------|---------|
| `crisis` | Crisis detection result (severity, indicators, suggested response) |
| `trustContext` | Trust context summary for monitoring/events |

### `src/agents/voice-agent/turn-handler.ts`

| Section | Purpose |
|---------|---------|
| Crisis handling | Override LLM or inject high-priority context |
| Trust monitoring | Emit events to frontend, log for metrics |

## Testing Strategy

### Unit Tests (`safety-integration.test.ts`)

- Crisis detection patterns work correctly
- Pre-response guard blocks appropriately
- Trust context summary shape is correct

### E2E Tests

- Crisis flow produces correct structure for turn-handler
- Moderate vs severe crisis handling differs
- Voice emotion amplifies detection
- Trust context flows through pipeline

## Frontend Integration

The frontend receives these events to adapt the UI/avatar:

| Event | Avatar Hint | UI Behavior |
|-------|-------------|-------------|
| `crisis_detected` | - | Show subtle support indicator |
| `trust_signal.emotional_mismatch` | `attentive` | More focused expression |
| `trust_signal.growth_reflection` | `thoughtful` | Remembering expression |
| `trust_signal.celebration` | `joyful` | Prepare celebration animation |

## Performance Considerations

1. **Crisis detection is fast** (<5ms) - simple regex patterns
2. **Trust context building is async** - runs in parallel with other processing
3. **No blocking in hot path** - events are fire-and-forget
4. **Pre-response beats post-response** - no latency added for validation

## Related Documentation

- `docs/architecture/PROCESSING-TIMELINE.md` - Full turn processing timeline
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - Trust system philosophy
- `docs/TRUST-SYSTEMS.md` - Detailed trust system documentation

