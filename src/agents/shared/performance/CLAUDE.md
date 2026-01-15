# Performance Optimizations

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains performance optimizations for voice agent operations. Our goal is real-time voice interactions with < 200ms response latency.

---

## Quick Reference

| What | Where |
|------|-------|
| Parallel Execution | `parallel-executor.ts` |
| TTS Caching | `cache-aware-tts.ts` |
| Speculative Loading | `speculative-preloading.ts` |
| Pre-STT Transform | `pre-stt-transform.ts` |
| Streaming TTS | `streaming-tts-transform.ts` |
| Performance Guide | `PERFORMANCE-GUIDE.md` |

---

## Optimization Categories

### 1. Parallel Execution (`parallel-executor.ts`)

Execute independent operations concurrently:

```typescript
import { ParallelExecutor } from './parallel-executor.js';

const executor = new ParallelExecutor();
const results = await executor.execute([
  () => loadUserProfile(userId),
  () => fetchRecentMessages(userId),
  () => getWeatherData(location),
]);
```

### 2. TTS Caching (`cache-aware-tts.ts`)

Cache common TTS responses to reduce latency:

```typescript
import { CacheAwareTTS } from './cache-aware-tts.js';

const tts = new CacheAwareTTS(baseTTS, {
  cacheCommonPhrases: true,
  maxCacheSize: 100,
});
```

### 3. Speculative Preloading (`speculative-preloading.ts`)

Preload likely-needed resources:

```typescript
import { speculativePreload } from './speculative-preloading.js';

// Preload tools likely to be needed
await speculativePreload({
  userId,
  recentTopics: ['career', 'habits'],
});
```

### 4. Pre-STT Transform (`pre-stt-transform.ts`)

Audio preprocessing before speech-to-text:

- Noise suppression
- Automatic gain control
- Bandwidth extension

See `PRE-STT-TRANSFORM.md` for details.

### 5. Greeting Audio Prewarm (`greeting-audio-prewarm.ts`)

Pre-generate greeting audio during session init:

```typescript
import { prewarmGreeting } from './greeting-audio-prewarm.js';

// Start prewarming immediately on connect
const greetingPromise = prewarmGreeting(persona, userName);

// Use when ready
const greetingAudio = await greetingPromise;
```

### 6. Streaming TTS (`streaming-tts-transform.ts`)

Stream TTS output as it's generated:

```typescript
import { createStreamingTTS } from './streaming-tts-transform.js';

const stream = createStreamingTTS(tts, {
  chunkSize: 1024,
  onChunk: (chunk) => sendToClient(chunk),
});
```

---

## Firestore Optimizations

### Batch Operations (`batch-firestore.ts`)

Batch multiple Firestore operations:

```typescript
import { BatchFirestore } from './batch-firestore.js';

const batch = new BatchFirestore();
batch.set(ref1, data1);
batch.update(ref2, data2);
await batch.commit();
```

### Connection Pool (`firestore-pool.ts`)

Reuse Firestore connections:

```typescript
import { getFirestoreConnection } from './firestore-pool.js';

const db = getFirestoreConnection();
```

---

## Key Metrics

| Operation | Target | Current |
|-----------|--------|---------|
| First response | < 200ms | ~180ms |
| Tool execution | < 500ms | ~400ms |
| TTS latency | < 100ms | ~80ms |
| STT latency | < 150ms | ~120ms |

---

## Files

| File | Purpose |
|------|---------|
| `adaptive-timing.ts` | Dynamic timing adjustments |
| `batch-analytics.ts` | Batched analytics |
| `batch-firestore.ts` | Firestore batching |
| `cache-aware-tts.ts` | TTS caching |
| `firestore-pool.ts` | Connection pooling |
| `greeting-audio-prewarm.ts` | Greeting prewarming |
| `integration.ts` | Integration utilities |
| `optimized-audio-processing.ts` | Audio optimization |
| `parallel-executor.ts` | Parallel execution |
| `parallel-turn-executor.ts` | Turn-level parallelism |
| `post-tts-transform.ts` | Post-TTS processing |
| `pre-stt-transform.ts` | Pre-STT processing |
| `predictive-tool-preload.ts` | Tool preloading |
| `response-streaming.ts` | Response streaming |
| `session-optimizations.ts` | Session-level opts |
| `speculative-preloading.ts` | Speculative loading |
| `streaming-tts-transform.ts` | Streaming TTS |
| `websocket-keepalive.ts` | WebSocket management |

---

## Rules

### Do ✅
- Measure before optimizing
- Use parallel execution for independent ops
- Cache frequently-used data
- Stream responses when possible
- Profile slow operations

### Don't ❌
- Optimize prematurely
- Block the main thread
- Skip error handling for speed
- Ignore memory usage
- Cache user-specific data indefinitely

---

## Reference Docs

- Full Guide: `PERFORMANCE-GUIDE.md`
- Pre-STT: `PRE-STT-TRANSFORM.md`
- Status: `PERFORMANCE-OPTIMIZATIONS-STATUS.md`
- Architecture: `docs/architecture/PRE-STT-AUDIO-ENHANCEMENT.md`

---

*Last updated: January 2026*
