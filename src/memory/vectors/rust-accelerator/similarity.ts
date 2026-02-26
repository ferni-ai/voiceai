/**
 * Rust Accelerator — similarity operations (cosine, euclidean, text, optimized batch).
 * @module memory/vectors/rust-accelerator/similarity
 */

import { loadRustPerf, NativeRustAcceleratorUnavailableError } from './core.js';
import type { EmbeddingVector } from './types.js';

// COSINE SIMILARITY (JS is faster for single operations - NOT a fallback)
// ============================================================================

/** Vector type for cosine similarity - accepts both number[] and Float32Array */

/**
 * Compute cosine similarity between two vectors.
 * Uses pure JS - V8 is highly optimized for this pattern.
 * Accepts both number[] and Float32Array for maximum compatibility.
 *
 * NOTE: This is intentionally JS, not a fallback. NAPI overhead
 * makes Rust slower for single operations.
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Batch cosine similarity - compare query against many candidates.
 * Uses pure JS for small batches, Rust for larger batches.
 */
export function batchCosineSimilarity(query: number[], candidates: number[][]): number[] {
  return candidates.map((candidate) => cosineSimilarity(query, candidate));
}


// ============================================================================
// EUCLIDEAN DISTANCE (SIMD-optimized for batches)
// ============================================================================

/**
 * Compute Euclidean distance between two vectors.
 * Uses pure JS - V8 is optimized for single operations.
 */
export function euclideanDistance(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Batch euclidean distance - compare query against many candidates.
 * Uses SIMD-accelerated Rust for optimal performance.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchEuclideanDistance(query: number[], candidates: number[][]): number[] {
  const perf = loadRustPerf();
  if (!perf.batchEuclideanDistance) {
    throw new NativeRustAcceleratorUnavailableError('batchEuclideanDistance function not found');
  }
  return perf.batchEuclideanDistance(query, candidates);
}

/**
 * SIMD-optimized euclidean distance for Float32Array vectors.
 * Uses Rust SIMD for 8-way parallelism.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function euclideanDistanceF32(a: Float32Array, b: Float32Array): number {
  const perf = loadRustPerf();
  if (!perf.euclideanDistanceF32) {
    throw new NativeRustAcceleratorUnavailableError('euclideanDistanceF32 function not found');
  }
  return perf.euclideanDistanceF32(a, b);
}

/**
 * Batch euclidean distance with Float32Array for maximum performance.
 * Uses zero-copy transfer and SIMD acceleration.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchEuclideanDistanceF32(
  query: Float32Array,
  candidates: Float32Array,
  candidateCount: number
): Float32Array {
  const perf = loadRustPerf();
  if (!perf.batchEuclideanDistanceF32) {
    throw new NativeRustAcceleratorUnavailableError('batchEuclideanDistanceF32 function not found');
  }
  return perf.batchEuclideanDistanceF32(query, candidates, candidateCount);
}


// ============================================================================
// TEXT SIMILARITY (Shingles - JS for single, Rust for batch)
// ============================================================================

/**
 * Generate k-shingles from text.
 */
function getShingles(text: string, k: number): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const shingles = new Set<string>();

  for (let i = 0; i <= normalized.length - k; i++) {
    shingles.add(normalized.slice(i, i + k));
  }

  return shingles;
}

/**
 * Compute Jaccard similarity between two texts.
 * Uses pure JS - sufficient for single comparisons.
 */
export function textSimilarity(text1: string, text2: string, shingleSize = 3): number {
  const shingles1 = getShingles(text1, shingleSize);
  const shingles2 = getShingles(text2, shingleSize);

  if (shingles1.size === 0 && shingles2.size === 0) return 1;
  if (shingles1.size === 0 || shingles2.size === 0) return 0;

  let intersection = 0;
  for (const s of shingles1) {
    if (shingles2.has(s)) intersection++;
  }

  const union = shingles1.size + shingles2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Batch text similarity - uses Rust for parallel shingle computation.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchTextSimilarity(
  query: string,
  candidates: string[],
  shingleSize = 3
): number[] {
  const perf = loadRustPerf();
  return perf.batchTextSimilarity(query, candidates, shingleSize);
}

// Private helper exported for testing
export { getShingles };
