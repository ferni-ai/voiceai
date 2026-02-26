/**
 * Rust Accelerator core — module loading, availability, metrics.
 * @module memory/vectors/rust-accelerator/core
 */

import { createRequire } from 'module';
import { getLogger } from '../../../utils/safe-logger.js';
import type {
  SimilarPairResult, TopKResult, ToolProfileInput, ToolScoringResult,
  BatchScoringConfig, InjectionInput, DeduplicationResult, MessageAnalysisResult,
  VoiceEmotionInput, EmotionalStateResult, ConversationTurnInput, ConversationDynamicsResult,
  DuplicatePair, TimeSeriesStats, ExponentialSmoothingResult, SeasonalityResult,
  DisfluencyCounts, FluencyAnalysisResult, InterjectionMatch,
  TurnPhraseMatch, TurnAnalysisResult, ExtractedSignal, SignalExtractionResult,
  TextStats, AudioFeatures, EmbeddingCacheStats,
} from './types.js';

const require = createRequire(import.meta.url);
const log = getLogger();

/** Pattern matcher class interface */
interface RustPatternMatcher {
  addToolPatterns: (toolId: string, patterns: string[]) => void;
  scoreAllPatterns: (query: string) => string[];
  toolCount: () => number;
}

/** Constructor type for RustPatternMatcher */
type RustPatternMatcherConstructor = new () => RustPatternMatcher;

export interface RustFftProcessor {
  processFrame: (samples: number[]) => number[];
  computeSpectralFlux: (samples: number[]) => number;
  getSpectralCentroid: (sampleRate: number) => number;
  getSpectralRolloff: (threshold: number) => number;
  extractFeatures: (samples: number[], sampleRate: number) => AudioFeatures;
  fftSize: () => number;
  numBins: () => number;
  reset: () => void;
}

/** Constructor type for RustFftProcessor */
export type RustFftProcessorConstructor = new (fftSize: number) => RustFftProcessor;


export interface RustEmbeddingCache {
  get: (text: string, currentTimeMs: number) => number[] | null;
  put: (text: string, embedding: number[], currentTimeMs: number) => void;
  putWithTtl: (text: string, embedding: number[], currentTimeMs: number, ttlMs: number) => void;
  remove: (text: string) => boolean;
  clear: () => void;
  len: () => number;
  isEmpty: () => boolean;
  capacity: () => number;
  pruneExpired: (currentTimeMs: number) => number;
  stats: () => EmbeddingCacheStats;
}

/** Constructor type for RustEmbeddingCache */
export type RustEmbeddingCacheConstructor = new (
  maxSize: number,
  defaultTtlMs: number
) => RustEmbeddingCache;

interface RustPerf {
  getLibraryInfo: () => { version: string; simdAvailable: boolean; parallelThreads: number };
  cosineSimilarity: (a: number[], b: number[]) => number;
  batchCosineSimilarity: (query: number[], candidates: number[][]) => number[];
  textSimilarity: (text1: string, text2: string, shingleSize?: number) => number;
  batchTextSimilarity: (query: string, candidates: string[], shingleSize?: number) => number[];
  findDuplicatesLsh: (
    texts: string[],
    threshold: number,
    numHashes?: number,
    numBands?: number
  ) => Array<{ firstIdx: number; secondIdx: number; similarity: number }>;
  computeMinhash: (
    text: string,
    numHashes: number,
    shingleSize?: number
  ) => { id: string; signature: number[] };
  estimateSimilarityFromMinhash: (sig1: number[], sig2: number[]) => number;

  // F32 SIMD-optimized functions
  batchCosineSimilarityF32?: (
    query: Float32Array,
    candidates: Float32Array,
    candidateCount: number
  ) => Float32Array;
  findSimilarPairsF32?: (
    embeddings: Float32Array,
    embeddingCount: number,
    dim: number,
    threshold: number
  ) => SimilarPairResult[];
  topKSimilarF32?: (
    query: Float32Array,
    candidates: Float32Array,
    candidateCount: number,
    k: number,
    minSimilarity: number
  ) => TopKResult;

  // Batch tool scoring (semantic router optimization)
  batchScoreTools?: (
    query: string,
    profiles: ToolProfileInput[],
    queryEmbedding: Float32Array | null,
    toolEmbeddings: Float32Array | null,
    embeddingDim: number | null,
    config: BatchScoringConfig | null
  ) => ToolScoringResult[];

  // Pattern matcher class
  PatternMatcher?: RustPatternMatcherConstructor;

  // Injection deduplication
  deduplicateInjections?: (
    injections: InjectionInput[],
    similarityThreshold?: number
  ) => DeduplicationResult;

  // Text similarity helpers
  keywordJaccardSimilarity?: (text1: string, text2: string) => number;
  textSemanticSimilarity?: (text1: string, text2: string) => number;

  // Message analysis
  analyzeMessage?: (text: string) => MessageAnalysisResult;
  batchAnalyzeMessages?: (messages: string[]) => MessageAnalysisResult[];

  // Emotional state detection
  detectEmotionalState?: (text: string, voice: VoiceEmotionInput | null) => EmotionalStateResult;

  // Conversation dynamics
  analyzeConversationDynamics?: (turns: ConversationTurnInput[]) => ConversationDynamicsResult;

  // Euclidean distance (SIMD-accelerated)
  euclideanDistance?: (a: number[], b: number[]) => number;
  batchEuclideanDistance?: (query: number[], candidates: number[][]) => number[];
  euclideanDistanceF32?: (a: Float32Array, b: Float32Array) => number;
  batchEuclideanDistanceF32?: (
    query: Float32Array,
    candidates: Float32Array,
    candidateCount: number
  ) => Float32Array;

  // Vector normalization (SIMD-accelerated)
  normalizeVectorF32?: (v: Float32Array) => Float32Array;
  batchNormalizeVectorsF32?: (embeddings: Float32Array, embeddingCount: number) => Float32Array;
  vectorNormF32?: (v: Float32Array) => number;
  computeCentroidF32?: (embeddings: Float32Array, embeddingCount: number) => Float32Array;

  // Time-series forecasting (SIMD-accelerated)
  calculateStatisticsF32?: (values: Float32Array) => TimeSeriesStats;
  calculateLinearTrendF32?: (values: Float32Array) => number;
  exponentialSmoothingF32?: (
    values: Float32Array,
    alpha: number,
    beta: number
  ) => ExponentialSmoothingResult;
  calculateSeasonalityF32?: (values: Float32Array, maxPeriod: number) => SeasonalityResult;
  batchCalculateStatisticsF32?: (
    seriesFlat: Float32Array,
    seriesLengths: number[]
  ) => TimeSeriesStats[];

  // Guidance block stripping (Aho-Corasick)
  buildGuidanceAutomaton?: () => boolean;
  stripGuidanceBlocks?: (text: string) => string;
  containsGuidanceBlocks?: (text: string) => boolean;
  clearGuidanceAutomaton?: () => void;

  // Fluency analysis (disfluency detection)
  analyzeFluency?: (text: string) => FluencyAnalysisResult;
  likelyHasDisfluencies?: (text: string) => boolean;
  countInterjections?: (text: string) => number;
  batchAnalyzeFluency?: (texts: string[]) => FluencyAnalysisResult[];

  // Turn analysis (turn-boundary detection)
  analyzeTurn?: (text: string) => TurnAnalysisResult;
  hasTurnFinal?: (text: string) => boolean;
  hasContinuation?: (text: string) => boolean;
  turnCompleteProbability?: (text: string) => number;
  batchAnalyzeTurn?: (texts: string[]) => TurnAnalysisResult[];

  // Signal extraction (memory-worthy signals)
  extractSignals?: (text: string) => SignalExtractionResult;
  extractHighValueSignals?: (text: string) => ExtractedSignal[];
  hasMemorableSignals?: (text: string) => boolean;
  batchExtractSignals?: (texts: string[]) => SignalExtractionResult[];

  // Token/word counting
  countWords?: (text: string) => number;
  countTokensApprox?: (text: string) => number;
  countChars?: (text: string) => number;
  countBytes?: (text: string) => number;
  countSentences?: (text: string) => number;
  countLines?: (text: string) => number;
  getTextStats?: (text: string) => TextStats;
  exceedsTokenLimit?: (text: string, limit: number) => boolean;
  truncateToTokens?: (text: string, maxTokens: number) => string;
  batchCountWords?: (texts: string[]) => number[];
  batchCountTokens?: (texts: string[]) => number[];
  batchGetStats?: (texts: string[]) => TextStats[];

  // FFT audio analysis (SIMD-accelerated)
  NapiFftProcessor?: RustFftProcessorConstructor;
  getRmsEnergy?: (samples: number[]) => number;
  getZeroCrossingRate?: (samples: number[]) => number;

  // Embedding cache (SHA256 + LRU)
  NapiEmbeddingCache?: RustEmbeddingCacheConstructor;
  hashTextSha256?: (text: string) => string;
  batchHashTextsSha256?: (texts: string[]) => string[];
}


// ============================================================================
// MODULE LOADING (FAIL FAST - NO FALLBACK)
// ============================================================================

let rustPerf: RustPerf | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Custom error for when Rust accelerator module is not available.
 */
export class NativeRustAcceleratorUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Native Rust accelerator module not available: ${reason}\n` +
        'Solutions:\n' +
        '  1. Run `pnpm run build` in apps/rust-perf\n' +
        '  2. Ensure USE_NATIVE_EMBEDDINGS=true in environment\n' +
        '  3. Check that @ferni/perf is installed'
    );
    this.name = 'NativeRustAcceleratorUnavailableError';
  }
}

/**
 * Load the native Rust performance library.
 * Throws NativeRustAcceleratorUnavailableError if not available.
 * Set DISABLE_RUST_ACCELERATOR=true to force JavaScript fallbacks.
 */
function loadRustPerf(): RustPerf {
  // Check for disable flag first
  if (process.env.DISABLE_RUST_ACCELERATOR === 'true') {
    if (!loadAttempted) {
      loadAttempted = true;
      loadError = 'Rust accelerator disabled via DISABLE_RUST_ACCELERATOR=true';
      log.info('🦀 Rust accelerator DISABLED (DISABLE_RUST_ACCELERATOR=true)');
    }
    throw new NativeRustAcceleratorUnavailableError(loadError ?? 'Disabled by environment');
  }

  if (loadAttempted && rustPerf) {
    return rustPerf;
  }

  if (loadAttempted && !rustPerf) {
    throw new NativeRustAcceleratorUnavailableError(loadError ?? 'Unknown error');
  }

  loadAttempted = true;

  try {
    const mod = require('@ferni/perf') as Partial<RustPerf>;

    // Verify required functions exist
    if (typeof mod.findDuplicatesLsh !== 'function') {
      loadError = 'findDuplicatesLsh function not found in native module';
      throw new NativeRustAcceleratorUnavailableError(loadError);
    }
    if (typeof mod.batchTextSimilarity !== 'function') {
      loadError = 'batchTextSimilarity function not found in native module';
      throw new NativeRustAcceleratorUnavailableError(loadError);
    }

    rustPerf = mod as RustPerf;
    const info = rustPerf.getLibraryInfo();
    log.info(
      {
        version: info.version,
        threads: info.parallelThreads,
        simd: info.simdAvailable,
      },
      '🦀 Rust accelerator loaded (SIMD-accelerated)'
    );

    return rustPerf;
  } catch (err) {
    if (err instanceof NativeRustAcceleratorUnavailableError) {
      throw err;
    }
    loadError = err instanceof Error ? err.message : String(err);
    throw new NativeRustAcceleratorUnavailableError(loadError);
  }
}

/**
 * Try to load the native module, returning null on failure instead of throwing.
 * Use this only for availability checks, not for actual operations.
 */
function tryLoadRustPerf(): RustPerf | null {
  try {
    return loadRustPerf();
  } catch {
    return null;
  }
}


// ============================================================================
// PUBLIC API - AVAILABILITY CHECKS
// ============================================================================

/**
 * Check if Rust accelerator is available.
 */
export function isRustAvailable(): boolean {
  return tryLoadRustPerf() !== null;
}

/**
 * Get Rust library info if available.
 */
export function getRustInfo(): { version: string; threads: number; available: boolean } {
  const perf = tryLoadRustPerf();
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

/**
 * Get the reason native module failed to load (for debugging).
 */
export function getRustLoadError(): string | null {
  tryLoadRustPerf(); // Ensure we've tried
  return loadError;
}

/**
 * Ensure Rust accelerator is available, throwing if not.
 * Call this at startup to fail fast.
 */
export function requireRustAccelerator(): void {
  loadRustPerf();
}


// ============================================================================
// METRICS TRACKING (Simplified - Native Only)
// ============================================================================

/** Metrics for tracking native path usage */
interface RustAcceleratorMetrics {
  nativeCalls: number;
  totalBatchItems: number;
  totalTimeMs: number;
  lastResetTime: number;
}

const metrics: RustAcceleratorMetrics = {
  nativeCalls: 0,
  totalBatchItems: 0,
  totalTimeMs: 0,
  lastResetTime: Date.now(),
};

/**
 * Get current accelerator metrics.
 */
export function getAcceleratorMetrics(): RustAcceleratorMetrics & {
  avgTimeMs: number;
  uptime: number;
} {
  return {
    ...metrics,
    avgTimeMs: metrics.nativeCalls > 0 ? metrics.totalTimeMs / metrics.nativeCalls : 0,
    uptime: Date.now() - metrics.lastResetTime,
  };
}

/**
 * Reset accelerator metrics.
 */
export function resetAcceleratorMetrics(): void {
  metrics.nativeCalls = 0;
  metrics.totalBatchItems = 0;
  metrics.totalTimeMs = 0;
  metrics.lastResetTime = Date.now();
}


// Re-export for sub-modules
export { loadRustPerf, tryLoadRustPerf, metrics };
export type { RustPerf, RustAcceleratorMetrics };
