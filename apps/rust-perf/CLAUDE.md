# Ferni Rust Performance Library

SIMD-optimized performance-critical operations for Ferni voice agent. Called from Node.js via NAPI-RS bindings.

## Quick Reference

```bash
# Build the native module
pnpm build

# Run TypeScript integration tests (tests rust-accelerator.ts)
cd ../.. && pnpm test -- --run rust-accelerator

# Check for compilation errors
cargo build

# Note: `cargo test` won't work directly (see Testing section)
```

## Architecture

```
apps/rust-perf/
├── Cargo.toml          # Rust dependencies (napi, rayon, wide, simd-json, etc.)
├── build.rs            # NAPI build configuration
├── package.json        # npm package @ferni/perf
├── index.js            # Auto-generated NAPI bindings
├── index.d.ts          # Auto-generated TypeScript types
└── src/
    ├── lib.rs              # Main entry - NAPI exports and core algorithms
    ├── embedding_cache.rs  # LRU cache with SHA256 keys
    ├── fft_analyzer.rs     # FFT audio analysis (SIMD)
    ├── fluency_analyzer.rs # Speech disfluency detection
    ├── json_parser.rs      # SIMD-accelerated JSON parsing
    ├── signal_extractor.rs # Human signal extraction (dates, values, etc.)
    ├── ssml_processor.rs   # SSML tag processing
    ├── token_counter.rs    # Fast word/token counting
    └── turn_analyzer.rs    # Turn boundary detection (Aho-Corasick)
```

## TypeScript Integration

### Import Patterns

```typescript
// Primary accelerator (with JS fallbacks)
import {
  cosineSimilarity,
  batchCosineSimilarityF32,
  topKSimilarF32,
  deduplicateInjectionsOptimized,
  analyzeMessageOptimized,
} from '@/memory/rust-accelerator.js';

// SSML processing (strict native requirement)
import {
  containsSsml,
  stripSsml,
  analyzeSsml,
} from '@/ssml/native-ssml-processor.js';

// JSON parsing (graceful fallback)
import {
  extractFunctionCalls,
  buildToolNameAutomaton,
} from '@/agents/shared/native-json-parser.js';
```

### Fallback Strategies

| Module | Strategy | Reason |
|--------|----------|--------|
| `rust-accelerator.ts` | Mixed (some fallbacks) | Performance optimization optional |
| `native-ssml-processor.ts` | Strict (throws if unavailable) | SSML critical for voice quality |
| `native-json-parser.ts` | Graceful (JS fallback) | Function extraction not critical path |

## Key Features

### 1. Embedding Operations (SIMD)
- `cosineSimilarity` / `cosineSimilarityF32` - Single pair similarity
- `batchCosineSimilarityF32` - One-to-many comparison (parallel)
- `euclideanDistanceF32` - Distance calculation
- `topKSimilarF32` - Top-K nearest neighbors
- `findSimilarPairsF32` - All pairs above threshold
- `normalizeVectorF32` / `batchNormalizeVectorsF32` - L2 normalization
- `computeCentroidF32` - Mean vector computation

### 2. Text Similarity (LSH)
- `textSimilarity` - Jaccard with k-shingles
- `computeMinhash` - MinHash signatures
- `findDuplicatesLsh` - Near-duplicate detection

### 3. Semantic Router (batch_score_tools)
- Combined regex + keyword + embedding scoring
- Parallel processing with early termination
- Used by `unified-tool-orchestrator.ts`

### 4. JSON Parsing (SIMD)
- `extractFunctionCalls` - Tool call extraction from TTS
- `likelyContainsFunctionCall` - Fast pre-check
- `parseFunctionCall` - Single call parsing

### 5. SSML Processing
- `containsSsml` / `stripSsml` - Tag detection/removal
- `analyzeSsml` - Full SSML analysis
- `insertBreak` / `insertEmotion` - Tag insertion

### 6. Message Analysis
- `analyzeMessage` - Wrap-up, question, greeting detection
- `detectEmotionalState` - Emotion + voice prosody
- `analyzeConversationDynamics` - Engagement metrics

### 7. Time-Series Forecasting
- `calculateStatisticsF32` - Mean, variance, min, max (SIMD)
- `calculateLinearTrendF32` - Linear regression slope
- `exponentialSmoothingF32` - Holt's double exponential
- `calculateSeasonalityF32` - Seasonal decomposition

### 8. Aho-Corasick Pattern Matching
- `buildToolNameAutomaton` / `scanForToolNames` - O(n) multi-pattern
- `buildGuidanceAutomaton` / `stripGuidanceBlocks` - Internal prompt cleaning
- `AhoCorasickMatcher` class - Instance-based matching

### 9. Audio Analysis (FFT)
- `NapiFftProcessor` class - Session-scoped FFT
- `getRmsEnergy` / `getZeroCrossingRate` - Audio features

### 10. Utility Functions
- `countWords` / `countTokensApprox` - Fast text stats
- `hashTextSha256` - SHA256 hashing
- `NapiEmbeddingCache` class - LRU cache with TTL

## Testing

### Why `cargo test` Doesn't Work

NAPI-RS projects produce a `cdylib` (dynamic library for Node.js). When you run `cargo test`, it tries to link the test binary against NAPI symbols that are only available when loaded into Node.js. This causes:

```
error: linking with `cc` failed
Undefined symbols: _napi_call_threadsafe_function, _napi_create_error, ...
```

### Correct Testing Approach

1. **TypeScript Integration Tests** (recommended):
   ```bash
   cd /Users/sethford/Documents/voiceai
   pnpm test -- --run rust-accelerator
   ```

2. **Test Files**:
   - `src/memory/__tests__/rust-accelerator-advanced.test.ts`
   - `src/memory/__tests__/batch-tool-scoring.test.ts`

3. **For Pure Rust Logic**:
   The individual modules (e.g., `embedding_cache.rs`, `fft_analyzer.rs`) have internal `#[cfg(test)]` modules with pure Rust tests. However, these are currently blocked by the NAPI linking issue. Future refactoring could:
   - Extract core algorithms into a separate crate
   - Use feature flags to conditionally compile NAPI

## Performance Benchmarks

| Operation | Rust | JavaScript | Speedup |
|-----------|------|------------|---------|
| Cosine similarity (1536-dim) | ~2.1μs | ~26.3μs | ~12x |
| Batch cosine (1000 candidates) | ~0.8ms | ~21ms | ~26x |
| Text similarity (Jaccard) | ~15μs | ~180μs | ~12x |
| LSH deduplication | ~3ms | ~45ms | ~15x |
| JSON function extraction | ~0.5μs | ~2.5μs | ~5x |
| SSML stripping | ~0.8μs | ~3.5μs | ~4x |

## Adding New Functions

### 1. Add Rust Implementation

```rust
// In lib.rs or a module file

/// Internal implementation (no NAPI types)
fn my_algorithm_impl(data: &[f32]) -> f32 {
    // SIMD-optimized algorithm
    let chunks = data.len() / 8;
    // ...
}

/// NAPI-exported wrapper
#[napi]
pub fn my_algorithm(values: Float32Array) -> f64 {
    let data: &[f32] = &values;
    my_algorithm_impl(data) as f64
}
```

### 2. Build and Generate Types

```bash
pnpm build
# index.d.ts and index.js are auto-generated
```

### 3. Add TypeScript Wrapper

```typescript
// In rust-accelerator.ts or appropriate file

import { my_algorithm } from '@ferni/perf';

export function myAlgorithmOptimized(values: Float32Array): number {
  if (isNativeAvailable()) {
    return my_algorithm(values);
  }
  // JS fallback (if needed)
  return jsFallback(values);
}
```

## Code Conventions

### Rust
- Use `_impl` suffix for internal functions that don't use NAPI types
- Use `f32` internally, convert to `f64` at NAPI boundary (JS uses f64)
- Use `rayon` for parallel batch operations
- Use `wide` crate for SIMD (cross-platform: AVX2/SSE/NEON)
- Use `lazy_static` for pre-compiled patterns
- Add `#[allow(dead_code)]` for internal utilities kept for future use

### TypeScript
- Use `Float32Array` for embeddings (zero-copy transfer)
- Implement JS fallbacks for non-critical operations
- Track metrics (native vs fallback calls)
- Use conditional `process.env.USE_NATIVE_*` flags

## Common Issues

### 1. Build Failures
```bash
# Clean and rebuild
cargo clean
pnpm build
```

### 2. Module Not Found
```bash
# Ensure native module exists
ls -la *.node
# If missing, rebuild
pnpm build
```

### 3. Type Mismatches
- `Float32Array` in TS → `Float32Array` (NAPI) → `&[f32]` in Rust
- `Array<number>` in TS → `Vec<f64>` in Rust (automatic conversion)

## Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| napi | 2.x | Node.js bindings |
| rayon | 1.10 | Parallel processing |
| wide | 0.7 | SIMD operations |
| simd-json | 0.14 | SIMD JSON parsing |
| aho-corasick | 1.1 | Multi-pattern matching |
| regex | 1.10 | Pattern matching |
| rustfft | 6.2 | FFT audio analysis |
| sha2 | 0.10 | SHA256 hashing |
| lru | 0.12 | LRU cache |
| memchr | 2.7 | Fast byte searching |
| xxhash-rust | 0.8 | MinHash hashing |
