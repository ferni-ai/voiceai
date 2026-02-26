/**
 * Rust Accelerator — token counting, FFT audio analysis, embedding cache.
 * @module memory/vectors/rust-accelerator/text-audio
 */

import { loadRustPerf, tryLoadRustPerf, NativeRustAcceleratorUnavailableError } from './core.js';
import type { RustFftProcessor, RustEmbeddingCache } from './core.js';
import type { TextStats, AudioFeatures, EmbeddingCacheStats } from './types.js';

// ============================================================================
// TOKEN/WORD COUNTING (Fast byte-level counting)
// ============================================================================

/**
 * Count words in text (space-separated tokens).
 * Uses byte-level iteration for 2-3x speedup over JS split/filter.
 *
 * @param text - Text to count
 * @returns Word count
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countWordsRust(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countWords) {
    throw new NativeRustAcceleratorUnavailableError('countWords function not found');
  }
  return perf.countWords(text);
}

/**
 * Count approximate tokens (OpenAI-style).
 * Rough approximation: words + punctuation. 10-100x faster than tiktoken.
 *
 * @param text - Text to count
 * @returns Approximate token count
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countTokensApproxRust(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countTokensApprox) {
    throw new NativeRustAcceleratorUnavailableError('countTokensApprox function not found');
  }
  return perf.countTokensApprox(text);
}

/**
 * Count characters (Unicode-aware).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countCharsRust(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countChars) {
    throw new NativeRustAcceleratorUnavailableError('countChars function not found');
  }
  return perf.countChars(text);
}

/**
 * Count bytes.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countBytesRust(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countBytes) {
    throw new NativeRustAcceleratorUnavailableError('countBytes function not found');
  }
  return perf.countBytes(text);
}

/**
 * Count sentences.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countSentencesRust(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countSentences) {
    throw new NativeRustAcceleratorUnavailableError('countSentences function not found');
  }
  return perf.countSentences(text);
}

/**
 * Count lines.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countLinesRust(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countLines) {
    throw new NativeRustAcceleratorUnavailableError('countLines function not found');
  }
  return perf.countLines(text);
}

/**
 * Get comprehensive text statistics.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function getTextStatsRust(text: string): TextStats {
  const perf = loadRustPerf();
  if (!perf.getTextStats) {
    throw new NativeRustAcceleratorUnavailableError('getTextStats function not found');
  }
  return perf.getTextStats(text);
}

/**
 * Quick check if text exceeds token limit.
 * Uses fast byte-based estimate before accurate count.
 *
 * @param text - Text to check
 * @param limit - Token limit
 * @returns true if text exceeds limit
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function exceedsTokenLimitRust(text: string, limit: number): boolean {
  const perf = loadRustPerf();
  if (!perf.exceedsTokenLimit) {
    throw new NativeRustAcceleratorUnavailableError('exceedsTokenLimit function not found');
  }
  return perf.exceedsTokenLimit(text, limit);
}

/**
 * Truncate text to approximate token limit.
 * Uses binary search to find optimal cutoff.
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum tokens
 * @returns Truncated text
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function truncateToTokensRust(text: string, maxTokens: number): string {
  const perf = loadRustPerf();
  if (!perf.truncateToTokens) {
    throw new NativeRustAcceleratorUnavailableError('truncateToTokens function not found');
  }
  return perf.truncateToTokens(text, maxTokens);
}

/**
 * Batch count words for multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchCountWordsRust(texts: string[]): number[] {
  const perf = loadRustPerf();
  if (!perf.batchCountWords) {
    throw new NativeRustAcceleratorUnavailableError('batchCountWords function not found');
  }
  return perf.batchCountWords(texts);
}

/**
 * Batch count tokens for multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchCountTokensRust(texts: string[]): number[] {
  const perf = loadRustPerf();
  if (!perf.batchCountTokens) {
    throw new NativeRustAcceleratorUnavailableError('batchCountTokens function not found');
  }
  return perf.batchCountTokens(texts);
}

/**
 * Batch get text stats for multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchGetStatsRust(texts: string[]): TextStats[] {
  const perf = loadRustPerf();
  if (!perf.batchGetStats) {
    throw new NativeRustAcceleratorUnavailableError('batchGetStats function not found');
  }
  return perf.batchGetStats(texts);
}

/**
 * Check if token counting is available.
 */
export function isTokenCountingAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.countWords !== undefined;
}


// ============================================================================
// FFT AUDIO ANALYSIS (SIMD-accelerated)
// ============================================================================

/**
 * FFT Processor for session-scoped audio analysis.
 * Uses SIMD-accelerated FFT with pre-allocated buffers for zero GC pressure.
 *
 * @example
 * ```typescript
 * const fft = createFftProcessor(1024);
 * const magnitudes = fft.processFrame(audioSamples);
 * const features = fft.extractFeatures(audioSamples, 16000);
 * ```
 */
export class FftProcessor {
  private processor: RustFftProcessor;

  constructor(fftSize: number) {
    const perf = loadRustPerf();
    if (!perf.NapiFftProcessor) {
      throw new NativeRustAcceleratorUnavailableError('NapiFftProcessor class not found');
    }
    this.processor = new perf.NapiFftProcessor(fftSize);
  }

  /** Process audio frame and return magnitude spectrum */
  processFrame(samples: number[]): number[] {
    return this.processor.processFrame(samples);
  }

  /** Compute spectral flux (change from previous frame) - higher = onset/transient */
  computeSpectralFlux(samples: number[]): number {
    return this.processor.computeSpectralFlux(samples);
  }

  /** Get spectral centroid (brightness measure) in Hz */
  getSpectralCentroid(sampleRate: number): number {
    return this.processor.getSpectralCentroid(sampleRate);
  }

  /** Get spectral rolloff (frequency bin containing threshold% of energy) */
  getSpectralRolloff(threshold = 0.95): number {
    return this.processor.getSpectralRolloff(threshold);
  }

  /** Extract all audio features from a frame */
  extractFeatures(samples: number[], sampleRate: number): AudioFeatures {
    return this.processor.extractFeatures(samples, sampleRate);
  }

  /** Get FFT size */
  get fftSize(): number {
    return this.processor.fftSize();
  }

  /** Get number of frequency bins */
  get numBins(): number {
    return this.processor.numBins();
  }

  /** Reset processor (clear previous frame data) */
  reset(): void {
    this.processor.reset();
  }
}

/**
 * Create a new FFT processor instance.
 * @param fftSize - FFT window size (typically 1024 or 2048)
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function createFftProcessor(fftSize: number): FftProcessor {
  return new FftProcessor(fftSize);
}

/**
 * Get RMS energy of audio samples (SIMD-accelerated).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function getRmsEnergyRust(samples: number[]): number {
  const perf = loadRustPerf();
  if (!perf.getRmsEnergy) {
    throw new NativeRustAcceleratorUnavailableError('getRmsEnergy function not found');
  }
  return perf.getRmsEnergy(samples);
}

/**
 * Get zero crossing rate of audio samples.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function getZeroCrossingRateRust(samples: number[]): number {
  const perf = loadRustPerf();
  if (!perf.getZeroCrossingRate) {
    throw new NativeRustAcceleratorUnavailableError('getZeroCrossingRate function not found');
  }
  return perf.getZeroCrossingRate(samples);
}

/**
 * Check if FFT audio analysis is available.
 */
export function isFftAnalysisAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.NapiFftProcessor !== undefined;
}


// ============================================================================
// EMBEDDING CACHE (SHA256 + LRU)
// ============================================================================

/**
 * High-performance embedding cache with SHA256 hashing and LRU eviction.
 * Thread-safe and eliminates per-call hash computation overhead.
 *
 * @example
 * ```typescript
 * const cache = createEmbeddingCache(1000, 300000); // 1000 entries, 5min TTL
 * cache.put('hello world', embedding, Date.now());
 * const cached = cache.get('hello world', Date.now());
 * ```
 */
export class NativeEmbeddingCache {
  private cache: RustEmbeddingCache;

  constructor(maxSize: number, defaultTtlMs: number) {
    const perf = loadRustPerf();
    if (!perf.NapiEmbeddingCache) {
      throw new NativeRustAcceleratorUnavailableError('NapiEmbeddingCache class not found');
    }
    this.cache = new perf.NapiEmbeddingCache(maxSize, defaultTtlMs);
  }

  /** Get an embedding from the cache (returns null if not found or expired) */
  get(text: string, currentTimeMs = Date.now()): number[] | null {
    return this.cache.get(text, currentTimeMs);
  }

  /** Put an embedding in the cache */
  put(text: string, embedding: number[], currentTimeMs = Date.now()): void {
    this.cache.put(text, embedding, currentTimeMs);
  }

  /** Put an embedding with custom TTL */
  putWithTtl(text: string, embedding: number[], currentTimeMs: number, ttlMs: number): void {
    this.cache.putWithTtl(text, embedding, currentTimeMs, ttlMs);
  }

  /** Remove an entry from the cache */
  remove(text: string): boolean {
    return this.cache.remove(text);
  }

  /** Clear all entries from the cache */
  clear(): void {
    this.cache.clear();
  }

  /** Get the current number of entries */
  get size(): number {
    return this.cache.len();
  }

  /** Check if the cache is empty */
  get isEmpty(): boolean {
    return this.cache.isEmpty();
  }

  /** Get cache capacity */
  get capacity(): number {
    return this.cache.capacity();
  }

  /** Prune expired entries, returns count of entries removed */
  pruneExpired(currentTimeMs = Date.now()): number {
    return this.cache.pruneExpired(currentTimeMs);
  }

  /** Get cache statistics */
  getStats(): EmbeddingCacheStats {
    return this.cache.stats();
  }
}

/**
 * Create a new embedding cache instance.
 * @param maxSize - Maximum number of entries
 * @param defaultTtlMs - Default time-to-live in milliseconds
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function createEmbeddingCache(maxSize: number, defaultTtlMs: number): NativeEmbeddingCache {
  return new NativeEmbeddingCache(maxSize, defaultTtlMs);
}

/**
 * Compute SHA256 hash of text (returns hex string).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function hashTextSha256(text: string): string {
  const perf = loadRustPerf();
  if (!perf.hashTextSha256) {
    throw new NativeRustAcceleratorUnavailableError('hashTextSha256 function not found');
  }
  return perf.hashTextSha256(text);
}

/**
 * Batch compute SHA256 hashes for multiple texts.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchHashTextsSha256(texts: string[]): string[] {
  const perf = loadRustPerf();
  if (!perf.batchHashTextsSha256) {
    throw new NativeRustAcceleratorUnavailableError('batchHashTextsSha256 function not found');
  }
  return perf.batchHashTextsSha256(texts);
}

/**
 * Check if embedding cache is available.
 */
export function isEmbeddingCacheAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.NapiEmbeddingCache !== undefined;
}

// ============================================================================
