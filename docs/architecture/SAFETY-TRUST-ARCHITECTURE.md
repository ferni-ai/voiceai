# Safety & Trust Architecture

> **User safety is non-negotiable. Trust enforcement makes AI human.**

This document explains how crisis detection, safety guards, and trust enforcement work in the voice agent pipeline.

## Overview

The safety and trust systems operate at multiple points in the pipeline:

```
User Speech → STT → Turn Processor → LLM → TTS → Voice Output
                    ↑                  ↑
                    │                  │
         Pre-response Safety    (Limited post-response)
         Crisis Detection       Streaming architecture
         Trust Context Injection makes this difficult
```

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
| `guardPreResponse()` | Decide if LLM should be overridden |
| `guardPostResponse()` | Check response for dismissive language (for non-streaming) |
| `applyGuardResult()` | Apply modifications to response (for non-streaming) |

### `src/agents/trust/trust-enforcer.ts`

| Function | Purpose |
|----------|---------|
| `enforceTrustContext()` | Check if response properly addresses trust signals |
| `buildRegenerationPrompt()` | Build prompt for regenerating blocked responses |

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

### `src/agents/voice-agent/response-processor.ts`

**Note:** This module is EXPORTED but NOT CALLED in the main production flow.

It contains trust enforcement and crisis guard logic that would work for non-streaming scenarios (text chat, buffered responses). It's documented for:
- Future use in non-streaming modes
- Testing and validation
- Reference implementation

## Testing Strategy

### Unit Tests (`safety-integration.test.ts`)

- Crisis detection patterns work correctly
- Pre-response guard blocks appropriately
- Trust enforcement identifies issues
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
- `design-system/brand/BETTER-THAN-HUMAN.md` - Trust system philosophy
- `docs/TRUST-SYSTEMS.md` - Detailed trust system documentation

