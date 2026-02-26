/**
 * Rust Accelerator — deduplication (LSH, injection dedup).
 * @module memory/vectors/rust-accelerator/dedup
 */

import { loadRustPerf, tryLoadRustPerf, NativeRustAcceleratorUnavailableError } from './core.js';
import type { DuplicatePair, InjectionInput, DeduplicationResult } from './types.js';

// ============================================================================
// LSH DEDUPLICATION (Rust is significantly faster)
// ============================================================================

/**
 * Find near-duplicate texts using Locality-Sensitive Hashing.
 * Uses Rust for parallel signature computation and hashing.
 *
 * @param texts Array of texts to deduplicate
 * @param threshold Minimum similarity threshold (0-1)
 * @param numHashes Number of hash functions for MinHash (default: 100)
 * @param numBands Number of bands for LSH (default: 20)
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function findDuplicatesLsh(
  texts: string[],
  threshold: number,
  numHashes = 100,
  numBands = 20
): DuplicatePair[] {
  const perf = loadRustPerf();
  return perf.findDuplicatesLsh(texts, threshold, numHashes, numBands);
}

// ============================================================================

// ============================================================================
// INJECTION DEDUPLICATION (Rust-accelerated)
// ============================================================================

/**
 * Deduplicate injections based on semantic similarity.
 * Uses Rust for parallel keyword extraction and Jaccard comparison.
 *
 * @param injections - Array of injection inputs
 * @param similarityThreshold - Threshold for duplicates (0-1), default 0.7
 * @returns Which injections to keep and which were removed
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function deduplicateInjectionsOptimized(
  injections: InjectionInput[],
  similarityThreshold = 0.7
): DeduplicationResult {
  if (injections.length === 0) {
    return { keepIds: [], removedIds: [], comparisons: 0 };
  }

  const perf = loadRustPerf();

  if (!perf.deduplicateInjections) {
    throw new NativeRustAcceleratorUnavailableError('deduplicateInjections function not found');
  }

  return perf.deduplicateInjections(injections, similarityThreshold);
}

/**
 * Check if native injection deduplication is available.
 */
export function isInjectionDeduplicationNativeAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.deduplicateInjections !== undefined;
}

