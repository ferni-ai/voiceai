# Performance Optimizations for "Better than Human" Latency

> **Target**: Sub-second response times for natural, human-like conversation flow.

This document describes the performance optimizations implemented to achieve "Better than Human" response latency in the Ferni voice agent.

---

## Summary of Changes

| Optimization | Before | After | Impact |
|--------------|--------|-------|--------|
| Turn processing soft timeout | 4000ms | 2000ms (adaptive) | 50% faster filler injection |
| Turn processing hard timeout | 12000ms | 8000ms (adaptive) | Faster fallback |
| Progressive acknowledgment | 2000ms | 1500ms | Earlier "Checking..." |
| Tool hard timeout | 10000ms | 6000ms | Faster cache fallback |
| Memory query limits | Unbounded | 20-50 items | Predictable latency |
| Persona insights cache | None | 3-min TTL | ~1s saved on handoff |

---

## 1. Adaptive Timing System

**File**: `src/agents/shared/performance/adaptive-timing.ts`

Instead of static timeouts, the system now learns from actual session performance:

```typescript
import {
  getAdaptiveTimeouts,
  shouldInjectFiller,
  recordTurnLatency,
} from './performance/adaptive-timing.js';

// Get timeouts based on session's actual performance
const timeouts = getAdaptiveTimeouts(sessionId);
// timeouts.fillerTimeoutMs - when to inject thinking filler
// timeouts.hardTimeoutMs - when to give up on rich context
// timeouts.strategy - 'instant' | 'natural' | 'with-filler' | 'fallback'

// Check if filler should be injected (respects cooldown)
if (shouldInjectFiller(sessionId, elapsedMs)) {
  // Inject filler
}
```

### Latency Targets

| Tier | Threshold | User Experience |
|------|-----------|-----------------|
| `instant` | < 500ms | Feels like magic |
| `natural` | < 1000ms | Like talking to a human |
| `acceptable` | < 2000ms | Slight pause, still good |
| `needs-filler` | < 2500ms | Say "Let me think..." |
| `fallback` | > 2500ms | Skip rich context |

---

## 2. Memory Query Limits

**File**: `src/memory/performance-limits.ts`

All memory queries now have explicit limits to prevent unbounded fetches:

```typescript
import { QUERY_LIMITS, MEMORY_TIMEOUTS } from './performance-limits.js';

// Query limits
QUERY_LIMITS.ASSOCIATIVE_TRIGGERS  // 50
QUERY_LIMITS.BEHAVIORAL_PATTERNS   // 20
QUERY_LIMITS.EMOTIONAL_THREADS     // 30
QUERY_LIMITS.RAG_SEARCH            // 15

// Timeouts
MEMORY_TIMEOUTS.SINGLE_QUERY       // 2000ms
MEMORY_TIMEOUTS.PARALLEL_QUERY     // 3000ms
```

### Updated Query Pattern

```typescript
// Before (unbounded, slow)
const snapshot = await userDoc.collection('memories').get();

// After (limited, fast)
const snapshot = await userDoc
  .collection('memories')
  .orderBy('updatedAt', 'desc')
  .limit(QUERY_LIMITS.ASSOCIATIVE_TRIGGERS)
  .get();
```

---

## 3. Persona Insights Cache

**File**: `src/intelligence/context-builders/persona-insights-cache.ts`

Caches persona intelligence to eliminate redundant computation on handoffs:

```typescript
import {
  getCachedPersonaInsights,
  cachePersonaInsights,
  preloadPersonaInsights,
} from './persona-insights-cache.js';

// On handoff - check cache first
const cached = getCachedPersonaInsights(sessionId, personaId, userId);
if (cached) {
  // Use cached insights (< 1ms)
} else {
  // Build fresh insights (~1-2s)
  const insights = await buildPersonaInsights(personaId, userId);
  cachePersonaInsights(sessionId, insights);
}

// Preload when handoff is likely
await preloadPersonaInsights(sessionId, 'peter', userId, buildFn);
```

### Cache Strategy

| Metric | Value |
|--------|-------|
| TTL (fresh) | 3 minutes |
| TTL (stale but usable) | 10 minutes |
| Background refresh threshold | 2 minutes |
| Max entries per session | 10 |

---

## 4. Firestore Indexes

**File**: `firestore.indexes.performance.json`

Composite indexes for common query patterns:

```json
{
  "collectionGroup": "associative_memory",
  "fields": [
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

---

## 5. Static Timeout Reductions

**File**: `src/agents/shared/constants.ts`

| Constant | Before | After | Reason |
|----------|--------|-------|--------|
| `TURN_PROCESSING_SOFT_TIMEOUT` | 4000ms | 2000ms | Faster filler injection |
| `TURN_PROCESSING_HARD_TIMEOUT` | 12000ms | 8000ms | Faster fallback |
| `PROGRESSIVE_SILENT_WINDOW` | 1500ms | 1000ms | Snappier feel |
| `PROGRESSIVE_ACKNOWLEDGMENT_AT` | 2000ms | 1500ms | Earlier feedback |
| `PROGRESSIVE_UPDATE_AT` | 5000ms | 3500ms | Faster reassurance |
| `TOOL_HARD_TIMEOUT` | 10000ms | 6000ms | Fail fast, use cache |

---

## 6. Turn Handler Integration

**File**: `src/agents/voice-agent/turn-handler.ts`

The turn handler now uses adaptive timing:

```typescript
// Start profiling
startTurnProfile(sessionId, turnNumber);

// Get adaptive timeouts
const timeouts = getAdaptiveTimeouts(sessionId);

// Check for filler injection every 200ms (responsive)
const interval = setInterval(() => {
  if (shouldInjectFiller(sessionId, elapsed)) {
    injectFiller();
  }
}, 200);

// Record latency for future adaptation
completeTurnProfile(sessionId, turnNumber);
```

---

## Monitoring

### Performance Dashboard

```typescript
import {
  getAdaptiveTimingSummary,
  getPerformanceSummary,
} from './agents/shared/performance/index.js';

// Session-level stats
const sessionStats = getAdaptiveTimingSummary(sessionId);
// { avgLatencyMs, p95LatencyMs, turnCount, strategy }

// Global stats
const globalStats = await getPerformanceSummary();
// { turnProfiling, batchWrites, audioProcessing }
```

### Log Signatures

```bash
# Fast turn (< 1s)
🎯 Turn completed: 847ms (strategy: natural)

# Adaptive filler
🗣️ Spoke adaptive thinking filler (elapsed: 1823ms, threshold: 1650ms)

# Slow turn warning
⚠️ Slow turn detected: 3245ms (bottleneck: memory_retrieval, 45%)
```

---

## Deployment Checklist

1. ✅ Deploy code changes
2. ✅ Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
3. ✅ Monitor latency metrics in production
4. ✅ Tune thresholds based on real data

---

## 7. Semantic Tool Presence ("Better than Human")

**Files**:
- `src/tools/execution/semantic-tool-presence.ts`
- `src/intelligence/context-builders/tool-timing-context.ts`

Emotion-aware tool feedback that makes tool execution feel natural, not robotic:

```typescript
import {
  startToolPresence,
  stopToolPresence,
  selectPresenceFeedback,
} from './tools/execution/index.js';

// Start tracking when tool begins
startToolPresence({
  toolName: 'calendar',
  sessionId,
  userId,
  personaId: 'ferni',
  startTime: Date.now(),
  userEmotion: 'anxious', // Detected from voice
}, (feedback) => {
  if (feedback.shouldSpeak) {
    session.say(feedback.text); // "Take a breath... I got this..."
  }
});

// Stop tracking when tool completes
const timing = stopToolPresence(sessionId, 'calendar');
// timing.framingHint: "Brief acknowledgment, then results."
```

### Emotion-Aware Feedback

| User Emotion | Initial Feedback | Still Here | Completion |
|--------------|------------------|------------|------------|
| Anxious | "Take a breath..." | "I'm here..." | "Okay..." |
| Excited | "Ooh, let me see!" | "Oh!" | "Check this out..." |
| Curious | "Hmm..." | "Okay..." | "Ah..." |
| Sad | "..." | "I'm here..." | "..." |
| Tired | "..." | "..." | "Here..." |

### Tool Timing Context Injection

The LLM receives context about how long tools took, enabling natural acknowledgment:

```
## Recent Tool Timing (frame response naturally)
- calendar took 4s - acknowledge the wait naturally, then share what you found.
```

---

## Future Optimizations

See `FUTURE-OPTIMIZATIONS.md` for the complete optimization roadmap including:

1. **Speculative persona preloading**: Predict handoff before user requests it
2. **Edge caching for static content**: Cache persona bundles at CDN layer
3. **Batched embedding generation**: Generate multiple embeddings in one call
4. **Connection pooling**: Reuse Firestore connections across requests
5. **Streaming LLM responses**: First audio in 300ms instead of 2.5s
6. **Semantic memory cache**: 60-70% cache hit rate
7. **Geographic distribution**: Multi-region deployment

---

*Last updated: December 2024*
