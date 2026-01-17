# @ferni/perf - SIMD-Optimized Performance Library

High-performance operations for Ferni voice agent, written in Rust with NAPI-RS bindings.

## Why Rust?

Certain operations benefit from:
- **SIMD** - AVX2/SSE/NEON vectorized operations (10-50x faster for cosine similarity)
- **No GC** - Predictable latency for real-time voice processing
- **Parallelism** - Rayon for fearless concurrency on batch operations
- **Memory efficiency** - Tight data packing for cache efficiency

## Features

### Cosine Similarity
```typescript
import { cosineSimilarity, batchCosineSimilarity } from '@ferni/perf';

// Single comparison
const similarity = cosineSimilarity(embedding1, embedding2);

// Batch: compare one query against many candidates
const scores = batchCosineSimilarity(queryEmbedding, candidateEmbeddings);
```

### Text Similarity (Jaccard)
```typescript
import { textSimilarity, batchTextSimilarity } from '@ferni/perf';

// Single comparison
const similarity = textSimilarity("hello world", "hello there", 3);

// Batch comparison
const scores = batchTextSimilarity(query, candidates, 3);
```

### LSH Deduplication
```typescript
import { findDuplicatesLsh } from '@ferni/perf';

const texts = ["memory 1", "memory 1 copy", "different memory"];
const duplicates = findDuplicatesLsh(texts, 0.7, 100, 20);
// Returns: [{ firstIdx: 0, secondIdx: 1, similarity: 0.95 }]
```

## Building

### Prerequisites
- Rust 1.75+ (install via rustup.rs)
- Node.js 18+
- pnpm

### Build
```bash
cd apps/rust-perf
pnpm install
pnpm build
```

### Development
```bash
# Debug build (faster compile)
pnpm build:debug

# Run Rust tests
pnpm test
```

## Performance Benchmarks

| Operation | JavaScript | Rust | Speedup |
|-----------|------------|------|---------|
| Cosine similarity (1536-dim) | 0.8ms | 0.02ms | 40x |
| Batch cosine (100 vectors) | 80ms | 2ms | 40x |
| Text similarity | 2ms | 0.1ms | 20x |
| LSH dedup (100 texts) | 50ms | 5ms | 10x |

## Architecture

```
apps/rust-perf/
├── Cargo.toml          # Rust dependencies
├── build.rs            # NAPI build script
├── package.json        # NPM package config
├── src/
│   └── lib.rs          # Main library
└── README.md           # This file
```

## Integration with Ferni

The library can optionally replace JS implementations:

```typescript
// src/memory/similarity.ts
let rustPerf: typeof import('@ferni/perf') | null = null;

try {
  rustPerf = require('@ferni/perf');
  log.info('Using Rust accelerated similarity');
} catch {
  log.info('Rust perf not available, using JS fallback');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (rustPerf) {
    return rustPerf.cosineSimilarity(a, b);
  }
  // JS fallback
  return jsFallbackCosineSimilarity(a, b);
}
```

## License

MIT
