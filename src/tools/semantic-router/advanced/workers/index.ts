/**
 * Semantic Router Workers - Optimized Background Processing
 *
 * This module provides worker-based optimizations for the semantic router:
 *
 * 1. **EmbeddingWorker** - Background embedding computation with caching
 *    - LRU cache with 24h TTL
 *    - Request batching for efficiency
 *    - Pre-warming for common queries
 *
 * 2. **ScoringWorker** - Parallel tool scoring
 *    - Early termination on high-confidence matches
 *    - Incremental scoring (pattern → keyword → embedding)
 *    - Score caching
 *
 * 3. **PipelineOptimizer** - Orchestrates the full pipeline
 *    - Speculative execution (parallel paths)
 *    - Request coalescing
 *    - Predictive pre-fetching
 *
 * LATENCY TARGETS:
 * - p50: <20ms (cache hit + pattern match)
 * - p95: <100ms (full embedding path)
 * - p99: <200ms (cold start)
 *
 * @module tools/semantic-router/advanced/workers
 */

// Embedding worker
export { EmbeddingWorker, getEmbeddingWorker, COMMON_QUERIES } from './embedding-worker.js';

// Scoring worker
export { ScoringWorker, getScoringWorker } from './scoring-worker.js';

// Pipeline optimizer
export { PipelineOptimizer, getPipelineOptimizer } from './pipeline-optimizer.js';

// Thread pool
export { ThreadPool, getThreadPool } from './thread-pool.js';
