/**
 * Rust Accelerator — vector operations (normalization, F32 SIMD, optimized batch ops).
 * @module memory/vectors/rust-accelerator/vector-ops
 */

import { loadRustPerf, tryLoadRustPerf, NativeRustAcceleratorUnavailableError, metrics } from './core.js';
import { cosineSimilarity } from './similarity.js';
import type { EmbeddingVector, SimilarPairResult, TopKResult } from './types.js';

// ============================================================================
// VECTOR NORMALIZATION (SIMD-optimized)
// ============================================================================

/**
 * Normalize a vector to unit length (L2 normalization).
 * Uses pure JS for single vectors - fast enough for most cases.
 */
export function normalizeVector(v: EmbeddingVector): number[] {
  const arr = Array.isArray(v) ? v : Array.from(v);
  let sumSq = 0;
  for (const val of arr) {
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) {
    return [...arr];
  }
  const invNorm = 1 / norm;
  return arr.map((x) => x * invNorm);
}

/**
 * SIMD-optimized vector normalization for Float32Array.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function normalizeVectorF32(v: Float32Array): Float32Array {
  const perf = loadRustPerf();
  if (!perf.normalizeVectorF32) {
    throw new NativeRustAcceleratorUnavailableError('normalizeVectorF32 function not found');
  }
  return perf.normalizeVectorF32(v);
}

/**
 * Batch normalize multiple vectors with SIMD and parallel processing.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchNormalizeVectorsF32(
  embeddings: Float32Array,
  embeddingCount: number
): Float32Array {
  const perf = loadRustPerf();
  if (!perf.batchNormalizeVectorsF32) {
    throw new NativeRustAcceleratorUnavailableError('batchNormalizeVectorsF32 function not found');
  }
  return perf.batchNormalizeVectorsF32(embeddings, embeddingCount);
}

/**
 * Compute L2 norm (magnitude) of a vector.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function vectorNormF32(v: Float32Array): number {
  const perf = loadRustPerf();
  if (!perf.vectorNormF32) {
    throw new NativeRustAcceleratorUnavailableError('vectorNormF32 function not found');
  }
  return perf.vectorNormF32(v);
}

/**
 * Compute centroid (mean vector) of multiple embeddings.
 * Useful for clustering and averaging embeddings.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function computeCentroidF32(embeddings: Float32Array, embeddingCount: number): Float32Array {
  const perf = loadRustPerf();
  if (!perf.computeCentroidF32) {
    throw new NativeRustAcceleratorUnavailableError('computeCentroidF32 function not found');
  }
  return perf.computeCentroidF32(embeddings, embeddingCount);
}


// F32 SIMD-OPTIMIZED OPERATIONS (Zero-Copy from JS)
// ============================================================================

/** Default embedding dimension for OpenAI embeddings */
const OPENAI_EMBEDDING_DIM = 1536;

/**
 * Convert f64 number arrays to Float32Array for SIMD operations.
 * OpenAI returns f64 but f32 is sufficient for similarity and 2x faster.
 */
export function toFloat32Array(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Convert multiple embeddings to a flat Float32Array.
 * Layout: [emb0[0], emb0[1], ..., emb0[dim-1], emb1[0], ...]
 */
export function toFlatFloat32Array(embeddings: number[][]): Float32Array {
  if (embeddings.length === 0) return new Float32Array(0);

  const dim = embeddings[0].length;
  const flat = new Float32Array(embeddings.length * dim);

  for (let i = 0; i < embeddings.length; i++) {
    const offset = i * dim;
    for (let j = 0; j < dim; j++) {
      flat[offset + j] = embeddings[i][j];
    }
  }

  return flat;
}

/**
 * Batch cosine similarity with F32 SIMD optimization.
 *
 * @param query - Query embedding (1536 floats for OpenAI)
 * @param candidates - Array of candidate embeddings
 * @returns Array of similarity scores in same order as candidates
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchCosineSimilarityOptimized(query: number[], candidates: number[][]): number[] {
  if (candidates.length === 0) return [];

  const perf = loadRustPerf();

  // Try F32 SIMD path (10-50x faster for batches)
  if (perf.batchCosineSimilarityF32 && candidates.length >= 5) {
    const queryF32 = toFloat32Array(query);
    const candidatesF32 = toFlatFloat32Array(candidates);
    const result = perf.batchCosineSimilarityF32(queryF32, candidatesF32, candidates.length);
    return Array.from(result);
  }

  // Rust f64 path for smaller batches
  return perf.batchCosineSimilarity(query, candidates);
}

/**
 * Find all pairs of embeddings with similarity above threshold.
 * Uses SIMD-accelerated O(n²) pairwise comparison.
 *
 * @param embeddings - Array of embeddings to compare
 * @param threshold - Minimum similarity threshold (0-1)
 * @param dim - Embedding dimension (default: 1536 for OpenAI)
 * @returns Array of similar pairs with indices and similarity scores
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function findSimilarPairs(
  embeddings: number[][],
  threshold: number,
  dim: number = OPENAI_EMBEDDING_DIM
): SimilarPairResult[] {
  if (embeddings.length < 2) return [];

  const perf = loadRustPerf();

  // F32 SIMD path (60x faster for batches)
  if (perf.findSimilarPairsF32 && embeddings.length >= 5) {
    const flatEmbeddings = toFlatFloat32Array(embeddings);
    return perf.findSimilarPairsF32(flatEmbeddings, embeddings.length, dim, threshold);
  }

  // For small batches, use JS (NAPI overhead not worth it)
  const pairs: SimilarPairResult[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity >= threshold) {
        pairs.push({ firstIdx: i, secondIdx: j, similarity });
      }
    }
  }
  return pairs;
}

/**
 * Find top-K most similar embeddings to a query.
 * Uses SIMD-accelerated parallel computation.
 *
 * @param query - Query embedding
 * @param candidates - Array of candidate embeddings
 * @param k - Number of top results to return
 * @param minSimilarity - Minimum similarity threshold (default: 0)
 * @returns TopKResult with indices and similarity scores
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function topKSimilar(
  query: number[],
  candidates: number[][],
  k: number,
  minSimilarity = 0
): TopKResult {
  if (candidates.length === 0) {
    return { indices: [], similarities: [] };
  }

  const perf = loadRustPerf();

  // F32 SIMD path for larger batches
  if (perf.topKSimilarF32 && candidates.length >= 5) {
    const queryF32 = toFloat32Array(query);
    const candidatesF32 = toFlatFloat32Array(candidates);
    return perf.topKSimilarF32(queryF32, candidatesF32, candidates.length, k, minSimilarity);
  }

  // JS for small batches (NAPI overhead not worth it)
  const scored = candidates
    .map((candidate, i) => ({
      index: i,
      similarity: cosineSimilarity(query, candidate),
    }))
    .filter((s) => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);

  return {
    indices: scored.map((s) => s.index),
    similarities: scored.map((s) => s.similarity),
  };
}

/**
 * Check if F32 SIMD operations are available.
 */
export function isF32SimdAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.batchCosineSimilarityF32 !== undefined;
}


// ============================================================================
// OPTIMIZED OPERATIONS WITH METRICS
// ============================================================================

/**
 * Find similar pairs with metrics tracking.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function findSimilarPairsOptimized(
  embeddings: number[][],
  threshold: number,
  dim: number = OPENAI_EMBEDDING_DIM
): SimilarPairResult[] {
  const start = performance.now();
  const result = findSimilarPairs(embeddings, threshold, dim);
  const elapsed = performance.now() - start;

  metrics.nativeCalls++;
  metrics.totalTimeMs += elapsed;
  metrics.totalBatchItems += embeddings.length;

  return result;
}

/**
 * Batch search with metrics tracking.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchSearchOptimized(
  query: number[],
  candidates: number[][],
  k = 10,
  minSimilarity = 0
): TopKResult {
  const start = performance.now();
  const result = topKSimilar(query, candidates, k, minSimilarity);
  const elapsed = performance.now() - start;

  metrics.nativeCalls++;
  metrics.totalTimeMs += elapsed;
  metrics.totalBatchItems += candidates.length;

  return result;
}

/**
 * Batch cosine similarity with metrics tracking.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchCosineSimilarityWithMetrics(
  query: number[],
  candidates: number[][]
): number[] {
  const start = performance.now();
  const result = batchCosineSimilarityOptimized(query, candidates);
  const elapsed = performance.now() - start;

  metrics.nativeCalls++;
  metrics.totalTimeMs += elapsed;
  metrics.totalBatchItems += candidates.length;

  return result;
}

