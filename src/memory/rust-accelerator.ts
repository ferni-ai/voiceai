/**
 * Rust Accelerator - Optional SIMD-optimized operations
 *
 * Uses Rust for operations where it provides speedup (batch LSH),
 * falls back to JS for single operations (cosine similarity).
 *
 * Performance characteristics:
 * - Cosine similarity: JS is faster (V8 is highly optimized, NAPI overhead dominates)
 * - LSH deduplication: Rust is faster (parallel signature computation + hashing)
 * - Batch text similarity: Rust is faster (parallel shingle computation)
 *
 * @module memory/rust-accelerator
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// RUST LIBRARY LOADING (OPTIONAL)
// ============================================================================

interface RustPerf {
  getLibraryInfo(): { version: string; simdAvailable: boolean; parallelThreads: number };
  cosineSimilarity(a: number[], b: number[]): number;
  batchCosineSimilarity(query: number[], candidates: number[][]): number[];
  textSimilarity(text1: string, text2: string, shingleSize?: number): number;
  batchTextSimilarity(query: string, candidates: string[], shingleSize?: number): number[];
  findDuplicatesLsh(
    texts: string[],
    threshold: number,
    numHashes?: number,
    numBands?: number
  ): Array<{ firstIdx: number; secondIdx: number; similarity: number }>;
  computeMinhash(
    text: string,
    numHashes: number,
    shingleSize?: number
  ): { id: string; signature: number[] };
  estimateSimilarityFromMinhash(sig1: number[], sig2: number[]): number;
}

let rustPerf: RustPerf | null = null;
let loadAttempted = false;

/**
 * Attempt to load the Rust performance library.
 * Returns null if not available (graceful degradation).
 */
function loadRustPerf(): RustPerf | null {
  if (loadAttempted) {
    return rustPerf;
  }

  loadAttempted = true;

  try {
    // Try to load the native module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    rustPerf = require('@ferni/perf') as RustPerf;

    const info = rustPerf.getLibraryInfo();
    log.info(
      {
        version: info.version,
        threads: info.parallelThreads,
        simd: info.simdAvailable,
      },
      '🦀 Rust accelerator loaded'
    );

    return rustPerf;
  } catch {
    log.debug('Rust accelerator not available, using JS fallback');
    return null;
  }
}

/**
 * Check if Rust accelerator is available.
 */
export function isRustAvailable(): boolean {
  return loadRustPerf() !== null;
}

/**
 * Get Rust library info if available.
 */
export function getRustInfo(): { version: string; threads: number; available: boolean } {
  const perf = loadRustPerf();
  if (!perf) {
    return { version: 'N/A', threads: 0, available: false };
  }

  const info = perf.getLibraryInfo();
  return {
    version: info.version,
    threads: info.parallelThreads,
    available: true,
  };
}

// ============================================================================
// COSINE SIMILARITY (JS is faster for single operations)
// ============================================================================

/**
 * Compute cosine similarity between two vectors.
 * Uses pure JS - V8 is highly optimized for this pattern.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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
 * Uses pure JS - V8's array.map is highly optimized.
 */
export function batchCosineSimilarity(query: number[], candidates: number[][]): number[] {
  return candidates.map((candidate) => cosineSimilarity(query, candidate));
}

// ============================================================================
// TEXT SIMILARITY (Rust is faster for batch operations)
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
 * Batch text similarity - uses Rust if available (parallel shingle computation).
 */
export function batchTextSimilarity(
  query: string,
  candidates: string[],
  shingleSize = 3
): number[] {
  const perf = loadRustPerf();

  if (perf && candidates.length >= 10) {
    // Use Rust for batch operations with 10+ candidates
    return perf.batchTextSimilarity(query, candidates, shingleSize);
  }

  // JS fallback for small batches
  return candidates.map((candidate) => textSimilarity(query, candidate, shingleSize));
}

// ============================================================================
// LSH DEDUPLICATION (Rust is significantly faster)
// ============================================================================

export interface DuplicatePair {
  firstIdx: number;
  secondIdx: number;
  similarity: number;
}

/**
 * Find near-duplicate texts using Locality-Sensitive Hashing.
 * Uses Rust for parallel signature computation and hashing.
 *
 * @param texts Array of texts to deduplicate
 * @param threshold Minimum similarity threshold (0-1)
 * @param numHashes Number of hash functions for MinHash (default: 100)
 * @param numBands Number of bands for LSH (default: 20)
 */
export function findDuplicatesLsh(
  texts: string[],
  threshold: number,
  numHashes = 100,
  numBands = 20
): DuplicatePair[] {
  const perf = loadRustPerf();

  if (perf) {
    // Use Rust accelerator - significantly faster for LSH
    return perf.findDuplicatesLsh(texts, threshold, numHashes, numBands);
  }

  // JS fallback - import the pure JS implementation
  // This is slower but works without native dependencies
  log.debug('Using JS LSH fallback');

  // Inline simple implementation for fallback
  return findDuplicatesLshJs(texts, threshold, numHashes, numBands);
}

/**
 * Pure JS LSH implementation (fallback when Rust not available).
 */
function findDuplicatesLshJs(
  texts: string[],
  threshold: number,
  numHashes: number,
  numBands: number
): DuplicatePair[] {
  const rowsPerBand = Math.floor(numHashes / numBands);

  // Compute signatures
  const signatures: number[][] = texts.map((text) => {
    const shingles = getShingles(text, 3);
    const signature: number[] = new Array(numHashes).fill(Infinity);

    if (shingles.size === 0) {
      return new Array(numHashes).fill(0);
    }

    const shingleArray = Array.from(shingles);
    for (let i = 0; i < numHashes; i++) {
      for (const shingle of shingleArray) {
        // Simple hash function
        let hash = 0;
        const str = `${i}:${shingle}`;
        for (let j = 0; j < str.length; j++) {
          const char = str.charCodeAt(j);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        hash = Math.abs(hash);

        if (hash < signature[i]) {
          signature[i] = hash;
        }
      }
    }

    return signature;
  });

  // Build band buckets
  const bandBuckets: Map<string, number[]>[] = [];
  for (let i = 0; i < numBands; i++) {
    bandBuckets.push(new Map());
  }

  for (let idx = 0; idx < signatures.length; idx++) {
    const sig = signatures[idx];
    for (let band = 0; band < numBands; band++) {
      const start = band * rowsPerBand;
      const end = Math.min(start + rowsPerBand, sig.length);
      const bandSlice = sig.slice(start, end);
      const bandKey = bandSlice.join(',');

      if (!bandBuckets[band].has(bandKey)) {
        bandBuckets[band].set(bandKey, []);
      }
      bandBuckets[band].get(bandKey)!.push(idx);
    }
  }

  // Find candidates
  const candidates = new Set<string>();
  for (const bucketMap of bandBuckets) {
    for (const indices of bucketMap.values()) {
      if (indices.length > 1) {
        for (let i = 0; i < indices.length; i++) {
          for (let j = i + 1; j < indices.length; j++) {
            const pair =
              indices[i] < indices[j]
                ? `${indices[i]},${indices[j]}`
                : `${indices[j]},${indices[i]}`;
            candidates.add(pair);
          }
        }
      }
    }
  }

  // Verify candidates
  const duplicates: DuplicatePair[] = [];
  for (const pair of candidates) {
    const [i, j] = pair.split(',').map(Number);
    const sig1 = signatures[i];
    const sig2 = signatures[j];

    let matches = 0;
    for (let k = 0; k < sig1.length; k++) {
      if (sig1[k] === sig2[k]) matches++;
    }
    const similarity = matches / sig1.length;

    if (similarity >= threshold) {
      duplicates.push({ firstIdx: i, secondIdx: j, similarity });
    }
  }

  return duplicates;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  loadRustPerf,
  getShingles,
};
