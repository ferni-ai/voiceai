# Voice Agent Performance Optimization Guide

> **Target Latency**: < 500ms time-to-first-audio for voice interactions

This guide covers the performance optimizations implemented in the Ferni voice agent to ensure responsive, human-like conversations.

---

## Architecture Overview

```
User Speech → STT → Turn Processing → Context Building → LLM → TTS → Audio
                    ↓
              Performance Optimizations Applied:
              - Speculative TTS pre-generation
              - Tool response caching
              - Memory deduplication
              - Parallel tool execution
              - Turn profiling
```

---

## 1. Turn Profiler

**Location**: `src/agents/shared/performance/turn-profiler.ts`

Tracks latency for every turn with detailed breakdowns:

| Metric | Target | Description |
|--------|--------|-------------|
| `totalTurnMs` | < 500ms | Full turn processing time |
| `timeToFirstAudioMs` | < 400ms | User stops speaking → audio starts |
| `analysisMs` | < 50ms | Message analysis |
| `contextBuildingMs` | < 100ms | Context injection building |
| `llmTtftMs` | < 200ms | LLM time to first token |
| `ttsTtfbMs` | < 150ms | TTS time to first byte |

### Performance Tiers

| Tier | Total Turn Time |
|------|-----------------|
| Excellent | < 300ms |
| Good | < 500ms |
| Acceptable | < 800ms |
| Slow | < 1500ms |
| Critical | ≥ 1500ms |

### Usage

Profiling is automatically integrated into `turn-handler.ts`:

```typescript
// Profiling happens automatically
startTurnProfiling(sessionId, turnNumber);
markTurnCheckpoint(sessionId, turnNumber, 'analysisComplete');
markTurnCheckpoint(sessionId, turnNumber, 'contextBuildComplete');
const metrics = completeTurnProfiling(sessionId, turnNumber);
```

### API Endpoint

```bash
GET /api/performance/turns
```

---

## 2. Tool Response Caching

**Location**: `src/agents/shared/performance/tool-response-cache.ts`

Caches responses from read-only tools to reduce latency for repeated queries.

### Cached Tools & TTLs

| Tool | TTL | Rationale |
|------|-----|-----------|
| `getweather` | 30s | Weather updates slowly |
| `getcurrenttime` | 1s | Useful for rapid queries |
| `getnews` | 60s | News doesn't change per-second |
| `getmarketsummary` | 15s | Markets move, but not that fast |
| `getcalendartoday` | 30s | Rare intra-session changes |
| `gethomestatus` | 10s | Sensor data |
| `getrelationshipsummary` | 2min | Stable within session |

### Cache Invalidation

Write operations automatically invalidate related caches:

```typescript
// addtask invalidates gettasks
// createcalendarevent invalidates getcalendartoday, getschedule
```

### API Endpoint

```bash
GET /api/performance/tool-cache
```

Returns:
```json
{
  "hits": 42,
  "misses": 15,
  "hitRatePercent": 73.7,
  "estimatedTimeSavedMs": 6300
}
```

---

## 3. Speculative TTS Pre-generation

**Location**: `src/agents/shared/performance/speculative-tts.ts`

Pre-generates likely response audio before the LLM completes.

### How It Works

1. After turn analysis, we know the user's emotion and intent
2. We predict likely response starters based on context
3. We pre-generate TTS for those phrases in the background
4. When the LLM outputs a matching phrase, audio is already ready

### Response Starters by Context

| Context | Pre-generated Phrases |
|---------|----------------------|
| Empathetic | "I hear you.", "That sounds really hard." |
| Supportive | "You're doing great.", "That takes courage." |
| Celebrating | "That's wonderful!", "Amazing!" |
| Acknowledging | "Right.", "I see.", "Got it." |

### Integration

Triggered automatically in `turn-handler.ts` after turn analysis:

```typescript
speculateTTS(sessionId, personaId, {
  emotion: result.emotional?.primary,
  intent: result.analysis?.analysis?.intent?.primary,
  distressLevel: result.emotional?.distressLevel,
});
```

### API Endpoint

```bash
GET /api/performance/tts
```

---

## 4. Tool Execution Reliability

**Location**: `src/agents/shared/tool-execution-reliability.ts`

Ensures tools execute reliably with retry logic and circuit breakers.

### Retry Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `maxRetries` | 2 | Maximum retry attempts |
| `initialDelayMs` | 100ms | First retry delay |
| `maxDelayMs` | 2000ms | Maximum delay (with jitter) |
| `backoffMultiplier` | 2 | Exponential backoff factor |

### Non-Retryable Tools

Side-effect tools are never retried:
- `rememberaboutuser`, `updatememory`, `forgetmemory`
- `sendmessage`, `sendemail`
- `createcalendarevent`, `addtask`
- `playmusic`

### Circuit Breaker

Prevents cascading failures for external API tools:

| State | Behavior |
|-------|----------|
| Closed | Normal operation |
| Open | All calls fail fast (use fallback) |
| Half-Open | Allow test request |

Tools with circuit breaker: `getweather`, `getnews`, `getmarketsummary`, `getquote`, `getcalendartoday`

### Fallback Responses

When tools fail, graceful fallbacks are provided:

```typescript
// Weather fallback
"I couldn't get the current weather right now. Try again in a moment?"

// Calendar fallback
"I couldn't access your calendar right now. Want me to try again?"
```

### API Endpoint

```bash
GET /api/performance/reliability
```

Returns circuit breaker states and error metrics.

---

## 5. Memory Optimization

**Location**: `src/agents/shared/performance/session-optimizations.ts`

### Pre-warming

At session start, we pre-compute embeddings for likely topics:
- Recent conversation topics
- Open threads and pending follow-ups
- Key user commitments

### Speculative Prefetch

While the user is still speaking, we start building context:

```typescript
// In transcript-handler.ts
if (event.transcript.length > 20) {
  startSpeculativePrefetch(sessionId, event.transcript, async (text) => {
    return getRAGContext(text, { topK: 3, userId, minScore: 0.3 });
  });
}
```

### Memory Deduplication

Prevents redundant memory lookups across context builders:

```typescript
const memoryCache = getMemoryCache(userId);
const cached = memoryCache.get(topic);
if (cached) return cached;
```

---

## 6. Monitoring Dashboard

### Combined Dashboard

```bash
GET /api/performance/voice-dashboard
```

Returns all metrics in one call:

```json
{
  "summary": {
    "avgTurnMs": 342,
    "slowTurnPercentage": 5.2,
    "toolCacheHitRate": "73.7%",
    "ttsCacheHitRate": "45.2%",
    "totalEstimatedSavingsMs": 8500,
    "toolSuccessRate": "99.1%",
    "openCircuits": 0
  },
  "turns": { ... },
  "toolCache": { ... },
  "speculativeTts": { ... },
  "reliability": { ... }
}
```

### Individual Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/performance/turns` | Turn profiler metrics |
| `GET /api/performance/tool-cache` | Tool caching metrics |
| `GET /api/performance/tts` | Speculative TTS metrics |
| `GET /api/performance/reliability` | Retry/circuit breaker metrics |
| `GET /api/performance/memory` | Memory usage |
| `GET /api/performance/tools` | Tool loading times |

---

## Performance Checklist

### Before Production Deploy

- [ ] Check `GET /api/performance/voice-dashboard`
- [ ] Verify `avgTurnMs < 500`
- [ ] Verify `slowTurnPercentage < 10%`
- [ ] Verify no open circuit breakers
- [ ] Check tool cache is warming up (hit rate > 50% after few turns)

### Troubleshooting Slow Turns

1. **Check bottleneck**: Turn profiler shows which phase is slow
2. **Context building slow?**: Reduce context injection count/size
3. **LLM slow?**: Check prompt size, model load
4. **TTS slow?**: Verify speculative TTS is working
5. **Memory slow?**: Check embedding cache hit rate

### Adding New Tools

When adding a new tool to `json-function-executor.ts`:

1. **Is it read-only?** Add to `TTL_BY_TOOL` in `tool-response-cache.ts`
2. **Has side effects?** Add to `NON_RETRYABLE_TOOLS` in `tool-execution-reliability.ts`
3. **Calls external API?** Consider adding to `CIRCUIT_BREAKER_TOOLS`
4. **Can fail?** Add fallback response in `getFallbackResponse()`

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_PROFILING` | `false` (prod) | Enable turn profiling |
| `DEBUG_INJECTIONS` | `false` | Log filtered injections |

### Runtime Configuration

Tool cache, circuit breaker, and retry configs can be adjusted:

```typescript
// tool-response-cache.ts
const TTL_BY_TOOL = { ... };

// tool-execution-reliability.ts
const DEFAULT_RETRY_CONFIG = { maxRetries: 2, ... };
const DEFAULT_CIRCUIT_CONFIG = { failureThreshold: 5, ... };
```

---

## Related Documentation

- [Function Calling System](./FUNCTION-CALLING-SYSTEM.md) - How tools are invoked
- [Memory Management](./MEMORY-MANAGEMENT.md) - Memory architecture
- [Clean Architecture](./CLEAN-ARCHITECTURE.md) - Layer boundaries

---

*Last updated: December 2024*

