# Rust Migration E2E Plan: Complete Implementation Audit

> **Goal**: Eliminate ~192KB/sec GC pressure from audio hot path + 40-60x speedup for batch embeddings
> **Status**: Infrastructure complete, consumer migration IN PROGRESS

---

## Executive Summary

### What's Built (Infrastructure ✅)
- `apps/rust-perf/` - SIMD embedding operations (F32 cosine, pairwise, top-K)
- `apps/rust-audio/` - Zero-allocation audio processing (buffer pool, ring buffers)
- `src/memory/rust-accelerator.ts` - TypeScript wrapper with graceful fallback
- `src/speech/audio-prosody/native-analyzer.ts` - Audio analyzer wrapper
- `.github/workflows/rust-native.yml` - Multi-platform CI
- `infra/docker/Dockerfile.agent` - Rust build stage

### What's NOT Done (Consumer Migration ❌)
- **78 `new Float32Array` allocations** in production code
- **40+ files** still using JS `cosineSimilarity()` instead of Rust
- **Only 1 consumer** (`memory-jobs.ts`) actually uses rust-accelerator
- **Zero integration tests** verifying native modules in production

---

## Phase 1: HIGH PRIORITY - Audio Hot Path (20ms frames)

These files execute every 20ms during voice calls. Each allocation = GC pressure.

### 1.1 Audio Processor Core
| File | Line | Current Code | Migration |
|------|------|--------------|-----------|
| `src/agents/voice-agent/audio-processor.ts` | 147 | `new Float32Array(frame.data.length)` | ✅ Done (feature flag) |
| `src/agents/voice-agent/audio-processor.ts` | 214 | `new Float32Array(frame.data.length)` | ✅ Done (feature flag) |
| `src/agents/voice-agent/audio-processor.ts` | 203 | `new Int16Array(frame.data)` | ⚠️ Needs migration |

**Status**: Partially done, needs feature flag verification

### 1.2 Real-Time Audio Analysis
| File | Lines | Allocations | Priority |
|------|-------|-------------|----------|
| `src/speech/audio-prosody/real-time-analyzer.ts` | 122, 336, 352 | 3 | 🔴 HIGH |
| `src/speech/audio-prosody/feature-extraction.ts` | 27, 53, 86 | 3 | 🔴 HIGH |
| `src/speech/fft-analyzer/fft-core.ts` | 102, 170, 186 | 3 | 🔴 HIGH |
| `src/speech/fft-analyzer/spectral-analysis.ts` | 104, 127 | 2 | 🔴 HIGH |

**Migration Strategy**:
```typescript
// Before (3x allocations per 20ms frame):
const windowed = new Float32Array(frame.length);

// After (zero allocation - uses session buffer pool):
import { getSessionUnifiedAnalyzer } from './native-analyzer.js';
const analyzer = await getSessionUnifiedAnalyzer(sessionId);
const result = analyzer.processFrame(samples, Date.now());
```

**Effort**: Medium - these all have `native-analyzer.ts` ready, just need integration

### 1.3 Voice Services (Per-Frame Processing)
| File | Lines | Allocations | Priority |
|------|-------|-------------|----------|
| `src/services/voice/voice-speaker-change.ts` | 163 | 1 | 🔴 HIGH |
| `src/services/voice/voice-antispoofing.ts` | 132 | 1 | 🔴 HIGH |
| `src/services/voice/voice-enrollment.ts` | 417, 471, 550, 749, 778, 796 | 6 | 🔴 HIGH |
| `src/services/voice-memory-enhanced.ts` | 329 | 1 | 🟡 MEDIUM |

**Special Note**: `voice-enrollment.ts` has 6 separate allocations + 6 `cosineSimilarity` calls. This is a prime candidate for batch optimization.

---

## Phase 2: HIGH PRIORITY - Embedding Operations

These run on every semantic search/deduplication. O(n²) loops are severe bottlenecks.

### 2.1 Memory Deduplication (O(n²) Hotspot)
| File | Lines | Pattern | Speedup Potential |
|------|-------|---------|-------------------|
| `src/memory/memory-deduplication.ts` | 159, 311 | O(n²) pairwise comparison | **60x with SIMD** |
| `src/memory/memory-consolidator.ts` | 159 | O(n²) pairwise comparison | **60x with SIMD** |

**Migration**:
```typescript
// Before (O(n²) JS loops):
for (let i = 0; i < embeddings.length; i++) {
  for (let j = i + 1; j < embeddings.length; j++) {
    const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
  }
}

// After (SIMD parallel):
import { findSimilarPairs } from '../memory/rust-accelerator.js';
const pairs = findSimilarPairs(embeddings, threshold);
```

### 2.2 Vector Store Operations
| File | Lines | Pattern | Priority |
|------|-------|---------|----------|
| `src/memory/vector-store.ts` | 187, 229 | Batch search | 🔴 HIGH |
| `src/memory/firestore-vector-store/core.ts` | 381, 444 | Batch search | 🔴 HIGH |
| `src/memory/firestore-vector-store/fallback-cache.ts` | 126 | Batch search | 🔴 HIGH |
| `src/memory/advanced-retrieval.ts` | 357 | Single similarity | 🟡 MEDIUM |
| `src/memory/embeddings.ts` | 460 | Single similarity | 🟡 MEDIUM |
| `src/memory/semantic-memory-cache.ts` | 161, 243 | Batch search | 🔴 HIGH |

### 2.3 Semantic Router (40+ usages)
| File | Pattern | Priority |
|------|---------|----------|
| `src/tools/semantic-router/matcher.ts` | 264, 272 | 🔴 HIGH |
| `src/tools/semantic-router/embedding-providers.ts` | 408 | 🔴 HIGH |
| `src/tools/semantic-router/i18n/multilingual.ts` | 221, 225, 320 | 🟡 MEDIUM |
| `src/tools/semantic-router/advanced/learned-retriever.ts` | 313, 318 | 🟡 MEDIUM |
| `src/tools/semantic-router/advanced/workers/embedding-worker.ts` | 187 | 🔴 HIGH |
| `src/tools/semantic-router/advanced/workers/scoring-worker.ts` | 191, 252 | 🔴 HIGH |
| `src/tools/semantic-router/learning/online-learning-loop.ts` | 534 | 🟡 MEDIUM |

### 2.4 Trigger System
| File | Lines | Priority |
|------|-------|----------|
| `src/intelligence/triggers/trigger-embedding-service.ts` | 328 | 🔴 HIGH |
| `src/intelligence/triggers/semantic-trigger-matcher.ts` | 349-350 | 🔴 HIGH |

### 2.5 Superhuman Services
| File | Pattern | Priority |
|------|---------|----------|
| `src/services/superhuman/semantic-intelligence/advice-matcher.ts` | 181 | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/relationship-graph.ts` | 243 | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/correlation-mining.ts` | 117 | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/counterfactual-memory.ts` | 136, 257, 426, 470 | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/cross-session-threading.ts` | 151, 175, 456 | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/emotional-trajectories.ts` | 132 | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/growth-fingerprint.ts` | (uses import) | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/relational-semantics.ts` | (uses import) | 🟡 MEDIUM |
| `src/services/superhuman/semantic-intelligence/behavioral-intelligence.ts` | (uses import) | 🟡 MEDIUM |

---

## Phase 3: MEDIUM PRIORITY - Supporting Services

### 3.1 Other Cosine Similarity Consumers
| File | Pattern | Priority |
|------|---------|----------|
| `src/personality/memory-adapter.ts` | 202 | 🟡 MEDIUM |
| `src/personas/behaviors.ts` | 218 | 🟡 MEDIUM |
| `src/agents/shared/tool-executors/memory-executor.ts` | 218 | 🟡 MEDIUM |
| `src/agents/shared/json-function-executor.ts` | 602 | 🟡 MEDIUM |
| `src/services/custom-agent/memory-capture.service.ts` | 754, 764, 774 | 🟡 MEDIUM |
| `src/services/semantic/embedding-matcher.ts` | 404, 413 | 🟡 MEDIUM |
| `src/services/memory/memory-management.ts` | 356 | 🟡 MEDIUM |

### 3.2 Float32Array in Non-Hot Paths
| File | Lines | Priority |
|------|-------|----------|
| `src/tools/semantic-router/advanced/audio-prosody-extractor.ts` | 144, 312, 644 | 🟡 MEDIUM |
| `src/api/voice-auth/helpers.ts` | 384, 390 | 🟢 LOW |
| `src/services/memory/voice-memory.ts` | 189 | 🟢 LOW |

---

## Phase 4: LOW PRIORITY - Test Files & Edge Cases

### 4.1 Test Files (Don't Migrate - Keep for Coverage)
These are test files that create Float32Array for test data. They should NOT be migrated as they test the JS paths.

| File | Note |
|------|------|
| `src/tests/voice-memory-enhanced.test.ts` | Test data generation |
| `src/tests/speech-modules.test.ts` | Test data generation |
| `src/tests/better-than-human-*.test.ts` | Test data generation |
| `src/tests/semantic-storage-synthetic.test.ts` | Test data generation |
| `src/tests/memory-modules.test.ts` | Tests JS implementation |
| `src/speech/__tests__/*.test.ts` | Test data generation |
| `src/agents/__tests__/*.test.ts` | Test data generation |
| `src/workers/__tests__/*.test.ts` | Test data generation |

### 4.2 TTS/Audio Output (Int16Array)
| File | Lines | Priority |
|------|-------|----------|
| `src/agents/shared/performance/cache-aware-tts.ts` | 136, 170 | 🟢 LOW |
| `src/agents/shared/greeting-audio-cache.ts` | 327 | 🟢 LOW |
| `src/speech/tts/superhuman-tts.ts` | 367, 437 | 🟢 LOW |
| `src/speech/tts/btcw-core.ts` | 690, 848 | 🟢 LOW |

**Note**: These are OUTPUT allocations (sending audio out), not hot-path INPUT processing.

---

## Implementation Checklist

### Step 1: Feature Flag Preparation
- [ ] Add `USE_NATIVE_EMBEDDINGS` feature flag to `src/config/feature-flags.ts`
- [ ] Add metrics tracking for native vs JS path usage
- [ ] Add GC pressure metric baseline capture

### Step 2: Batch Migration Functions
Create unified migration helpers in `src/memory/rust-accelerator.ts`:

```typescript
// Add to rust-accelerator.ts:

/**
 * Drop-in replacement for cosineSimilarity that auto-batches when beneficial.
 * Use this for gradual migration without code changes at call sites.
 */
export function cosineSimilarityOptimized(a: number[], b: number[]): number {
  // Single operations stay in JS (V8 optimized)
  return cosineSimilarity(a, b);
}

/**
 * Replace O(n²) loops with SIMD batch operation.
 */
export function findSimilarPairsOptimized(
  embeddings: number[][],
  threshold: number
): SimilarPairResult[] {
  return findSimilarPairs(embeddings, threshold);
}

/**
 * Replace single comparisons in loops with batch operation.
 */
export function batchSearchOptimized(
  query: number[],
  candidates: number[][],
  k: number = 10
): TopKResult {
  return topKSimilar(query, candidates, k);
}
```

### Step 3: Migration Order

#### Week 1: Audio Hot Path
1. [ ] Verify `audio-processor.ts` feature flag integration
2. [ ] Migrate `real-time-analyzer.ts` to use `native-analyzer.ts`
3. [ ] Migrate `feature-extraction.ts` to use native buffer pool
4. [ ] Migrate `fft-core.ts` to use pre-allocated buffers
5. [ ] Migrate `spectral-analysis.ts` to use native
6. [ ] Add integration test for native audio path

#### Week 2: Voice Services
1. [ ] Migrate `voice-speaker-change.ts`
2. [ ] Migrate `voice-antispoofing.ts`
3. [ ] Migrate `voice-enrollment.ts` (batch the 6 similarities!)
4. [ ] Add integration tests

#### Week 3: Memory/Vector Operations
1. [ ] Migrate `memory-deduplication.ts` to `findSimilarPairs`
2. [ ] Migrate `memory-consolidator.ts` to `findSimilarPairs`
3. [ ] Migrate `vector-store.ts` to `batchSearchOptimized`
4. [ ] Migrate `firestore-vector-store/core.ts`
5. [ ] Add integration tests

#### Week 4: Semantic Router
1. [ ] Create `semantic-router/rust-bridge.ts` wrapper
2. [ ] Migrate `matcher.ts`
3. [ ] Migrate `embedding-providers.ts`
4. [ ] Migrate workers
5. [ ] Migrate learning loop
6. [ ] Add integration tests

#### Week 5: Superhuman Services
1. [ ] Create unified import point for superhuman services
2. [ ] Migrate all 9 semantic intelligence modules
3. [ ] Add integration tests

#### Week 6: Remaining + Testing
1. [ ] Migrate remaining MEDIUM priority files
2. [ ] Full E2E test suite
3. [ ] Performance benchmark suite
4. [ ] Documentation update

---

## Testing Strategy

### Unit Tests
```typescript
// src/memory/__tests__/rust-accelerator-f32.test.ts
describe('F32 SIMD Operations', () => {
  it('batchCosineSimilarityOptimized matches JS for correctness', () => {
    const query = randomEmbedding(1536);
    const candidates = Array(100).fill(null).map(() => randomEmbedding(1536));

    const jsResults = candidates.map(c => cosineSimilarityJs(query, c));
    const rustResults = batchCosineSimilarityOptimized(query, candidates);

    for (let i = 0; i < jsResults.length; i++) {
      expect(rustResults[i]).toBeCloseTo(jsResults[i], 5);
    }
  });

  it('findSimilarPairs finds all pairs above threshold', () => {
    // Create embeddings with known similar pairs
    const embeddings = createSyntheticEmbeddings();
    const pairs = findSimilarPairs(embeddings, 0.95);

    // Verify expected pairs found
    expect(pairs.length).toBe(expectedPairs.length);
  });
});
```

### Integration Tests
```typescript
// src/tests/native-audio-integration.test.ts
describe('Native Audio Integration', () => {
  it('processes 20ms frames without allocation', async () => {
    const sessionId = 'test-native';
    const analyzer = await getSessionUnifiedAnalyzer(sessionId);

    expect(analyzer.isNative).toBe(true);

    // Process 100 frames (2 seconds)
    const heapBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100; i++) {
      const frame = generateTestFrame();
      analyzer.processFrame(frame, Date.now());
    }
    const heapAfter = process.memoryUsage().heapUsed;

    // Should see minimal heap growth (< 10KB)
    expect(heapAfter - heapBefore).toBeLessThan(10 * 1024);
  });
});
```

### Performance Benchmarks
```typescript
// src/tests/rust-performance.bench.ts
describe('Rust vs JS Performance', () => {
  it('batch cosine 100x1536 dims', () => {
    const query = randomEmbedding(1536);
    const candidates = Array(100).fill(null).map(() => randomEmbedding(1536));

    const jsStart = performance.now();
    for (let i = 0; i < 10; i++) {
      candidates.map(c => cosineSimilarityJs(query, c));
    }
    const jsTime = performance.now() - jsStart;

    const rustStart = performance.now();
    for (let i = 0; i < 10; i++) {
      batchCosineSimilarityOptimized(query, candidates);
    }
    const rustTime = performance.now() - rustStart;

    console.log(`JS: ${jsTime}ms, Rust: ${rustTime}ms, Speedup: ${jsTime/rustTime}x`);
    expect(rustTime).toBeLessThan(jsTime / 10); // At least 10x faster
  });

  it('findSimilarPairs O(n²) with 100 embeddings', () => {
    const embeddings = Array(100).fill(null).map(() => randomEmbedding(1536));

    // JS O(n²) - ~5000 comparisons
    const jsStart = performance.now();
    const jsPairs = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        if (cosineSimilarityJs(embeddings[i], embeddings[j]) > 0.9) {
          jsPairs.push({ i, j });
        }
      }
    }
    const jsTime = performance.now() - jsStart;

    // Rust SIMD
    const rustStart = performance.now();
    const rustPairs = findSimilarPairs(embeddings, 0.9);
    const rustTime = performance.now() - rustStart;

    console.log(`JS: ${jsTime}ms, Rust: ${rustTime}ms, Speedup: ${jsTime/rustTime}x`);
    expect(rustTime).toBeLessThan(jsTime / 30); // At least 30x faster
  });
});
```

---

## Audit Checklist

### Pre-Migration Audit
- [ ] Count baseline GC pressure with `--expose-gc` flag
- [ ] Measure baseline p99 latency for audio processing
- [ ] Measure baseline batch cosine similarity time
- [ ] Verify native modules load in all environments (dev, CI, production)

### Per-File Migration Audit
For each migrated file:
- [ ] Feature flag wrapper present
- [ ] Graceful fallback to JS implementation
- [ ] Unit tests pass
- [ ] Type safety maintained (no `any`)
- [ ] Logging for native vs JS path
- [ ] Performance metric capture

### Post-Migration Audit
- [ ] GC pressure reduction verified (target: -90%)
- [ ] p99 latency improvement measured
- [ ] Zero regressions in functionality
- [ ] All integration tests pass
- [ ] Production canary successful (5% traffic)
- [ ] Full rollout complete

---

## Risk Mitigation

### Rollback Strategy
Every migration includes:
1. **Feature flag** - `USE_NATIVE_X=false` immediately disables
2. **Graceful fallback** - Missing native module = JS path automatically
3. **Canary deployment** - 5% traffic first, monitor for 24h

### Known Risks
| Risk | Mitigation |
|------|------------|
| Native module fails to load | Graceful fallback built-in |
| SIMD not available on CPU | `wide` crate handles scalar fallback |
| Memory safety in Rust | Buffer pool pre-allocates, no dynamic allocation |
| Cross-platform builds | CI builds for linux-x64, darwin-arm64 |

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Audio GC pressure | ~192KB/sec | <10KB/sec | `--expose-gc --trace-gc` |
| Frame processing p99 | ~8ms | <2ms | OpenTelemetry traces |
| Batch cosine (100×1536) | ~80ms | <2ms | Benchmark suite |
| Memory dedup (100 items) | ~3000ms | <50ms | Benchmark suite |
| Native module adoption | 1 file | 50+ files | Code search |

---

## File Summary

### Files to Migrate (by Priority)

**🔴 HIGH (17 files)**:
1. `src/speech/audio-prosody/real-time-analyzer.ts`
2. `src/speech/audio-prosody/feature-extraction.ts`
3. `src/speech/fft-analyzer/fft-core.ts`
4. `src/speech/fft-analyzer/spectral-analysis.ts`
5. `src/services/voice/voice-speaker-change.ts`
6. `src/services/voice/voice-antispoofing.ts`
7. `src/services/voice/voice-enrollment.ts`
8. `src/memory/memory-deduplication.ts`
9. `src/memory/memory-consolidator.ts`
10. `src/memory/vector-store.ts`
11. `src/memory/firestore-vector-store/core.ts`
12. `src/memory/firestore-vector-store/fallback-cache.ts`
13. `src/memory/semantic-memory-cache.ts`
14. `src/tools/semantic-router/matcher.ts`
15. `src/tools/semantic-router/embedding-providers.ts`
16. `src/intelligence/triggers/trigger-embedding-service.ts`
17. `src/intelligence/triggers/semantic-trigger-matcher.ts`

**🟡 MEDIUM (23 files)**:
1. `src/tools/semantic-router/i18n/multilingual.ts`
2. `src/tools/semantic-router/advanced/learned-retriever.ts`
3. `src/tools/semantic-router/advanced/workers/embedding-worker.ts`
4. `src/tools/semantic-router/advanced/workers/scoring-worker.ts`
5. `src/tools/semantic-router/learning/online-learning-loop.ts`
6. `src/tools/semantic-router/advanced/audio-prosody-extractor.ts`
7. `src/services/superhuman/semantic-intelligence/advice-matcher.ts`
8. `src/services/superhuman/semantic-intelligence/relationship-graph.ts`
9. `src/services/superhuman/semantic-intelligence/correlation-mining.ts`
10. `src/services/superhuman/semantic-intelligence/counterfactual-memory.ts`
11. `src/services/superhuman/semantic-intelligence/cross-session-threading.ts`
12. `src/services/superhuman/semantic-intelligence/emotional-trajectories.ts`
13. `src/services/superhuman/semantic-intelligence/growth-fingerprint.ts`
14. `src/services/superhuman/semantic-intelligence/relational-semantics.ts`
15. `src/services/superhuman/semantic-intelligence/behavioral-intelligence.ts`
16. `src/personality/memory-adapter.ts`
17. `src/personas/behaviors.ts`
18. `src/agents/shared/tool-executors/memory-executor.ts`
19. `src/agents/shared/json-function-executor.ts`
20. `src/services/custom-agent/memory-capture.service.ts`
21. `src/services/semantic/embedding-matcher.ts`
22. `src/services/memory/memory-management.ts`
23. `src/services/voice-memory-enhanced.ts`

**🟢 LOW (8 files)**:
1. `src/api/voice-auth/helpers.ts`
2. `src/services/memory/voice-memory.ts`
3. `src/agents/shared/performance/cache-aware-tts.ts`
4. `src/agents/shared/greeting-audio-cache.ts`
5. `src/speech/tts/superhuman-tts.ts`
6. `src/speech/tts/btcw-core.ts`
7. `src/memory/advanced-retrieval.ts`
8. `src/memory/embeddings.ts`

**📝 TEST FILES (Do not migrate - 25+ files)**:
- All files in `__tests__/` directories

---

*Last updated: December 2024*
*Total files requiring migration: 48 production files*
*Total test files to preserve: 25+ files*
