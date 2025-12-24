# Future Optimizations Roadmap

> **Target**: "Better than Human" performance at massive scale.

This document outlines all planned performance optimizations for the Ferni voice agent, organized by priority and implementation complexity.

---

## Summary of Completed Optimizations (December 2024)

| Optimization | Impact | Status |
|--------------|--------|--------|
| Adaptive timing system | 50% faster filler injection | ✅ Completed |
| Reduced static timeouts | Faster fallback responses | ✅ Completed |
| Memory query limits | Predictable latency | ✅ Completed |
| Persona insights cache | ~1s saved on handoff | ✅ Completed |
| Firestore composite indexes | Faster queries | ✅ Ready to deploy |
| Semantic tool presence | Emotion-aware tool feedback | ✅ Completed |
| Tool timing context injection | Natural LLM framing | ✅ Completed |
| Speculative persona preloading | ~1-2s saved on handoffs | ✅ Completed |
| Batched embedding generation | 2-3x faster bulk embedding | ✅ Already implemented |
| Semantic memory cache | 60-70% cache hit rate | ✅ Completed |
| Edge caching for static content | 50-100ms saved per request | ✅ Completed |
| Firestore connection pooling | 100-200ms cold start savings | ✅ Completed |
| Predictive cache warming | 80%+ cache hit rate | ✅ Completed |
| Speculative TTS Generation | 200-400ms saved on common responses | ✅ Completed |
| Context Builder Prioritization | 20-30% reduction in context build time | ✅ Completed |
| Tiered Memory Storage | 10x faster retrieval for hot data | ✅ Completed |

---

## Phase 1: Core Performance (Q1 2025)

### 1.1 Speculative Persona Preloading

**Impact**: ~1-2s saved on handoffs
**Complexity**: Medium
**Priority**: High

Predict handoff before user requests it based on conversation patterns:

```typescript
// Detect handoff likelihood from conversation
if (detectedIntent === 'financial_question' && currentPersona !== 'peter') {
  // Preload Peter's persona bundle and insights cache
  await preloadPersonaInsights(sessionId, 'peter', userId, buildFn);
}
```

**Implementation**:
- Train intent classifier for handoff prediction
- Preload persona bundles on high-confidence predictions
- Background cache warming

---

### 1.2 Edge Caching for Static Content ✅ COMPLETED

**Impact**: 50-100ms saved per request
**Complexity**: Low
**Priority**: High
**Status**: ✅ Completed (December 2024)

Cache persona bundles and static content at CDN layer:

| Content Type | TTL | Cache Location | Status |
|--------------|-----|----------------|--------|
| Persona bundles | 24h | Cloud CDN | ✅ Headers added (`brand-routes.ts`) |
| Agent registry | 1h | Cloud CDN | ✅ Headers added (`agents.ts`) |
| User memory | No | Server only | N/A (user-specific) |
| Design tokens | 1h | Cloud CDN | ✅ Already implemented |
| Brand rules | 1h | Cloud CDN | ✅ Headers added (`brand-routes.ts`) |
| Commands | 1h | Cloud CDN | ✅ Headers added (`commands-routes.ts`) |
| Voice profiles | N/A | Internal | N/A (no public API) |
| Tool schemas | N/A | Internal | N/A (loaded from registry) |

**Implementation**:
- ✅ Added `sendJSONEdgeCached()` helper in `src/api/helpers.ts`
- ✅ Added public cache headers to persona bundle endpoints (`brand-routes.ts`)
- ✅ Added public cache headers to command endpoints (`commands-routes.ts`)
- ✅ Added public cache headers to agent endpoints (`agents.ts`)
- ⏳ Cloud CDN deployment is infrastructure configuration (outside code scope)

---

### 1.3 Batched Embedding Generation

**Impact**: 2-3x faster memory retrieval
**Complexity**: Medium
**Priority**: High

Generate multiple embeddings in one API call:

```typescript
// Before: N sequential calls
for (const memory of memories) {
  memory.embedding = await generateEmbedding(memory.content);
}

// After: 1 batched call
const embeddings = await generateEmbeddingsBatch(memories.map(m => m.content));
memories.forEach((m, i) => m.embedding = embeddings[i]);
```

**Implementation**:
- Batch up to 100 texts per API call
- Add request queuing with 50ms debounce
- Fallback to sequential on batch failure

---

### 1.4 Connection Pooling ✅ COMPLETED

**Impact**: 100-200ms saved on cold starts
**Complexity**: Medium
**Priority**: Medium
**Status**: ✅ Completed (December 2024)

Reuse Firestore connections across requests:

```typescript
// Connection pool configuration (in firestore-store.ts)
const poolingDefaults = {
  minChannels: 2,      // Keep warm connections ready
  maxIdleChannels: 10, // Allow burst capacity
};
```

**Implementation**:
- ✅ Added connection pooling config to `FirestoreConfig` interface
- ✅ Applied `minChannels` and `maxIdleChannels` settings in `doInitialize()`
- ✅ Firestore SDK handles channel management internally

---

## Phase 2: Intelligent Caching (Q1-Q2 2025)

### 2.1 Semantic Memory Cache

**Impact**: 60-70% cache hit rate
**Complexity**: High
**Priority**: High

Cache memory query results with semantic similarity matching:

```typescript
// Before: Always query Firestore
const memories = await queryMemories(userId, query);

// After: Check semantic cache first
const cached = semanticCache.findSimilar(userId, query, threshold: 0.85);
if (cached) {
  return cached.memories; // ~5ms
}
const memories = await queryMemories(userId, query); // ~200ms
semanticCache.store(userId, query, memories);
```

**Implementation**:
- Store query embeddings with results
- Use cosine similarity for cache lookup
- TTL of 5 minutes, evict LRU

---

### 2.2 Predictive Cache Warming ✅ COMPLETED

**Impact**: 80%+ cache hit rate for anticipated queries
**Complexity**: High
**Priority**: Medium
**Status**: ✅ Completed (December 2024)

Predict what the user will ask and pre-warm caches:

| Signal | Prediction | Pre-warm | Status |
|--------|------------|----------|--------|
| Morning session | "How did I sleep?" | Sleep data | ✅ Implemented |
| Monday morning | "What's my week look like?" | Calendar | ✅ Implemented |
| Post-handoff to Peter | "How are my stocks?" | Portfolio | ✅ Implemented |
| Friday evening | "How was my week?" | Weekly summary | ✅ Implemented |
| Sunday evening | "What's coming up?" | Week ahead | ✅ Implemented |

**Implementation**:
- ✅ Built prediction model in `src/memory/predictive-cache-warming.ts`
- ✅ Time-based predictions (morning, afternoon, evening, night)
- ✅ Day-based predictions (Monday planning, Friday reflection, Sunday prep)
- ✅ Handoff-based predictions (persona-specific queries)
- ✅ Confidence thresholds with boosting for returning users
- ✅ Integrated into session init (Phase 8 background loading)
- ✅ 27 unit tests covering all prediction scenarios

---

### 2.3 Tiered Memory Storage ✅ COMPLETED

**Impact**: 10x faster retrieval for hot data
**Complexity**: Medium
**Priority**: Medium
**Status**: ✅ Completed (December 2024)

Store frequently accessed memories in faster storage:

| Tier | Storage | Latency | Capacity |
|------|---------|---------|----------|
| Hot | Redis | 1-5ms | 1MB/user |
| Warm | Firestore | 50-100ms | 100MB/user |
| Cold | Cloud Storage | 200-500ms | Unlimited (future) |

**Implementation**:
- ✅ Created `tiered-memory-storage.ts` with hot/warm tier logic
- ✅ Access tracking with promotion threshold (5 accesses in 24h → promote)
- ✅ Demotion logic (7 days without access → demote from hot tier)
- ✅ `getMemoryTiered()` - Check hot tier (Redis) first, fall back to warm (Firestore)
- ✅ `getMemoriesTiered()` - Batch retrieval with hot tier optimization
- ✅ Metrics tracking (hit rates, latencies, promotions/demotions)
- ✅ Integrated into memory module exports

**Key Files**:
- `src/memory/tiered-memory-storage.ts` - Main tiered storage logic
- `src/memory/redis-cache.ts` - Hot tier storage (Redis)
- `src/memory/index.ts` - Exports for tiered storage

---

## Phase 3: Voice Pipeline Optimization (Q2 2025)

### 3.1 Streaming LLM Responses

**Impact**: 500-1000ms perceived latency reduction
**Complexity**: High
**Priority**: High

Stream LLM tokens directly to TTS without waiting for full response:

```
Current:
User → LLM (2s) → TTS (500ms) → Audio
                              ↑
                         First audio at 2.5s

Streaming:
User → LLM [token1] → TTS → Audio [word1]
          [token2] → TTS → Audio [word2]
          ...
                              ↑
                         First audio at 300ms
```

**Implementation**:
- Use OpenAI/Gemini streaming mode
- Buffer tokens until sentence boundary
- Stream to Cartesia as sentences complete

---

### 3.2 Speculative TTS Generation

**Impact**: 200-400ms saved on common responses
**Complexity**: Medium
**Priority**: Medium

Pre-generate audio for predicted responses:

| Trigger | Predicted Response | Pre-generate |
|---------|-------------------|--------------|
| User says "How are you?" | "I'm doing well..." | ✅ |
| Tool starts executing | Acknowledgment filler | ✅ |
| Handoff initiated | Goodbye phrase | ✅ |

**Implementation**:
- Identify high-frequency response patterns
- Background TTS generation on prediction
- Cache audio with 5-minute TTL

---

### 3.3 Voice Emotion-Aware Audio Caching

**Impact**: 50-100ms saved per utterance
**Complexity**: Low
**Priority**: Low

Cache TTS output keyed by text + emotion:

```typescript
const cacheKey = `${text}:${emotion}:${personaId}`;
const cached = audioCache.get(cacheKey);
if (cached) {
  return cached; // Skip TTS call
}
```

**Implementation**:
- LRU cache with 100MB limit per persona
- Hash-based key generation
- Warm cache on session start

---

## Phase 4: Scale Optimizations (Q2-Q3 2025)

### 4.1 Session State Sharding

**Impact**: Linear horizontal scaling
**Complexity**: High
**Priority**: High (for scale)

Shard session state across multiple Redis instances:

```
Session ID → Hash → Shard 0/1/2/N
                    ↓
              Dedicated Redis
```

**Implementation**:
- Consistent hashing for shard selection
- Cross-shard coordination for team features
- Automatic rebalancing on shard add/remove

---

### 4.2 Geographic Distribution

**Impact**: 50-100ms latency reduction globally
**Complexity**: High
**Priority**: Medium

Deploy voice agents in multiple regions:

| Region | Location | Coverage |
|--------|----------|----------|
| us-central1 | Iowa | Americas |
| europe-west1 | Belgium | EMEA |
| asia-east1 | Taiwan | APAC |

**Implementation**:
- Multi-region GKE deployment
- GeoDNS routing
- Cross-region session handoff

---

### 4.3 Auto-scaling Intelligence

**Impact**: Cost optimization + reliability
**Complexity**: Medium
**Priority**: Medium

Predict load and pre-scale:

```
Time of day → Historical pattern → Pre-scale
Monday 9am     → +50% load         → Add instances at 8:45am
```

**Implementation**:
- Train time-series model on historical load
- Predictive autoscaler configuration
- Cost-aware scaling limits

---

## Phase 5: Context Intelligence (Q3-Q4 2025)

### 5.1 Context Builder Prioritization ✅ COMPLETED

**Impact**: 20-30% reduction in context build time
**Complexity**: Medium
**Priority**: Medium
**Status**: ✅ Completed (December 2024)

Only run context builders relevant to current intent:

```typescript
// After category filtering (~20-30 builders), prioritize by intent/topic
const prioritizationResult = prioritizeBuilders(buildersToRun, input);
buildersToRun = prioritizationResult.selectedBuilders; // ~10-15 builders
```

**Implementation**:
- ✅ Created `builder-prioritization.ts` with intent/topic→builder mapping
- ✅ Core builders always run (crisis, persona-identity, intent, topics, etc.)
- ✅ Non-core builders scored by intent match (+0.4), topic match (+0.3), persona match (+0.3)
- ✅ Threshold filtering (default 0.3) skips low-relevance builders
- ✅ Integrated into main context builder orchestrator (`index.ts`)
- ✅ Metrics tracking for monitoring skip rates

**Key Files**:
- `src/intelligence/context-builders/builder-prioritization.ts` - Prioritization logic
- `src/intelligence/context-builders/index.ts` - Integration point
- `src/intelligence/context-builders/fast-conditional-loading.ts` - Category-level (phase 1)

---

### 5.2 Incremental Context Updates

**Impact**: 50-70% reduction in context build time
**Complexity**: High
**Priority**: Medium

Only rebuild changed context between turns:

```typescript
// Track what changed since last turn
const changes = detectContextChanges(previousContext, currentInput);

// Only rebuild affected parts
const updatedContext = await updateContext(previousContext, changes);
```

**Implementation**:
- Context diffing algorithm
- Builder dependency graph
- Cache invalidation rules

---

### 5.3 Context Compression

**Impact**: Longer conversations without quality loss
**Complexity**: Medium
**Priority**: Low

Compress context while preserving semantic meaning:

| Technique | Compression | Quality Impact |
|-----------|-------------|----------------|
| Summary compression | 5x | Low |
| Importance ranking | 3x | Very Low |
| Temporal decay | 2x | Very Low |

**Implementation**:
- LLM-based summarization for old context
- Importance scoring for memories
- Gradual compression over conversation length

---

## Monitoring & Validation

### Key Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| P50 response latency | < 1s | > 1.5s |
| P95 response latency | < 2s | > 3s |
| Cache hit rate | > 70% | < 50% |
| Context build time | < 300ms | > 500ms |
| Memory query time | < 100ms | > 200ms |

### A/B Testing Framework

```typescript
// Feature flag for optimization testing
if (featureFlags.enableOptimization('streaming_llm')) {
  return streamingLLMResponse(input);
} else {
  return standardLLMResponse(input);
}
```

### Performance Dashboard

Monitor optimizations at: `/api/observability/performance`

---

## Implementation Priority Matrix

| Priority | Optimization | Impact | Effort | Timeline |
|----------|--------------|--------|--------|----------|
| P0 | Streaming LLM | Very High | High | Q1 2025 |
| P0 | Speculative preloading | High | Medium | Q1 2025 |
| P0 | Semantic memory cache | High | High | Q1 2025 |
| P1 | Edge caching | Medium | Low | Q1 2025 |
| P1 | Batched embeddings | High | Medium | Q1 2025 |
| P1 | Speculative TTS | Medium | Medium | Q2 2025 |
| P2 | Context prioritization | Medium | Medium | Q2 2025 |
| P2 | Connection pooling | Medium | Medium | Q2 2025 |
| P3 | Geographic distribution | High | Very High | Q3 2025 |
| P3 | Session sharding | High | Very High | Q3 2025 |

---

## Quick Reference

### When to Optimize What

| Symptom | Check First | Optimization |
|---------|-------------|--------------|
| Slow first response | Context build time | Builder prioritization |
| Slow tool responses | API latency | Caching, batching |
| Slow handoffs | Persona loading | Speculative preloading |
| High latency globally | Network path | Geographic distribution |
| Inconsistent latency | Cache misses | Semantic caching |

### Files to Know

| Purpose | File |
|---------|------|
| Adaptive timing | `src/agents/shared/performance/adaptive-timing.ts` |
| Memory limits | `src/memory/performance-limits.ts` |
| Persona cache | `src/intelligence/context-builders/persona-insights-cache.ts` |
| Semantic presence | `src/tools/execution/semantic-tool-presence.ts` |
| Tool timing | `src/intelligence/context-builders/tool-timing-context.ts` |
| Firestore indexes | `firestore.indexes.performance.json` |

---

*Last updated: December 2024*
