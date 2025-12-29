/**
 * Rust Accelerator - SIMD-optimized operations
 *
 * Uses Rust for operations where it provides speedup.
 * NO JavaScript fallback - native module is REQUIRED.
 *
 * Performance characteristics:
 * - Cosine similarity: JS is faster for single ops (V8 is highly optimized, NAPI overhead dominates)
 * - LSH deduplication: Rust is faster (parallel signature computation + hashing)
 * - Batch text similarity: Rust is faster (parallel shingle computation)
 * - Batch tool scoring: Rust is faster (parallel regex + SIMD embeddings)
 *
 * @module memory/rust-accelerator
 */

import { createRequire } from 'module';
import { getLogger } from '../utils/safe-logger.js';

// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/** Similar pair result from F32 pairwise comparison */
export interface SimilarPairResult {
  firstIdx: number;
  secondIdx: number;
  similarity: number;
}

/** Top-K result from F32 similarity search */
export interface TopKResult {
  indices: number[];
  similarities: number[];
}

/** Input for batch tool scoring */
export interface ToolProfileInput {
  toolId: string;
  patterns: string[];
  keywordsFlat: string[];
  keywordWeightsFlat: number[];
  hasEmbedding: boolean;
  embeddingIndex?: number;
}

/** Result from batch tool scoring */
export interface ToolScoringResult {
  toolId: string;
  score: number;
  patternScore: number;
  keywordScore: number;
  embeddingScore: number;
  matchedPatternCount: number;
  matchedKeywordCount: number;
}

/** Configuration for batch scoring */
export interface BatchScoringConfig {
  patternWeight: number;
  keywordWeight: number;
  embeddingWeight: number;
  earlyTerminationThreshold: number;
  minScoreThreshold: number;
}

/** Input for injection deduplication */
export interface InjectionInput {
  id: string;
  content: string;
  priority: number;
  source: string;
}

/** Result from injection deduplication */
export interface DeduplicationResult {
  keepIds: string[];
  removedIds: string[];
  comparisons: number;
}

/** Result from message analysis */
export interface MessageAnalysisResult {
  isWrapUp: boolean;
  wrapUpConfidence: number;
  isQuestion: boolean;
  isGreeting: boolean;
  sentiment: number;
  emotionCategory: string;
  wordCount: number;
  charCount: number;
  keywords: string[];
}

/** Voice emotion indicators input */
export interface VoiceEmotionInput {
  speechRate: number;
  volume: number;
  pitchVariation: number;
  pauseFrequency: number;
}

/** Emotional state detection result */
export interface EmotionalStateResult {
  primaryEmotion: string;
  confidence: number;
  intensity: number;
  hasMismatch: boolean;
  mismatchDescription: string;
  suggestedTone: string;
}

/** Input for conversation turn tracking */
export interface ConversationTurnInput {
  turnNumber: number;
  speaker: string;
  wordCount: number;
  durationSecs?: number;
  sentiment: number;
  hasQuestion: boolean;
}

/** Result from conversation dynamics analysis */
export interface ConversationDynamicsResult {
  avgUserWords: number;
  avgAgentWords: number;
  turnRatio: number;
  engagementScore: number;
  conversationPhase: string;
  sentimentTrend: string;
  questionDensity: number;
  suggestedPacing: string;
}

export interface DuplicatePair {
  firstIdx: number;
  secondIdx: number;
  similarity: number;
}

/** Time series statistics result */
export interface TimeSeriesStats {
  mean: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
}

/** Exponential smoothing result (Holt's method) */
export interface ExponentialSmoothingResult {
  level: number;
  trend: number;
  forecast: number;
}

/** Seasonality analysis result */
export interface SeasonalityResult {
  strength: number;
  period: number;
  indices: number[];
}

// ============================================================================
// NATIVE MODULE INTERFACE
// ============================================================================

/** Pattern matcher class interface */
interface RustPatternMatcher {
  addToolPatterns: (toolId: string, patterns: string[]) => void;
  scoreAllPatterns: (query: string) => string[];
  toolCount: () => number;
}

/** Constructor type for RustPatternMatcher */
type RustPatternMatcherConstructor = new () => RustPatternMatcher;

// ============================================================================
// FLUENCY ANALYSIS TYPES
// ============================================================================

/** Disfluency counts by type */
export interface DisfluencyCounts {
  repetitions: number;
  prolongations: number;
  interjections: number;
  revisions: number;
  restarts: number;
  trailing: number;
  pauseFillers: number;
  hesitations: number;
}

/** Fluency analysis result */
export interface FluencyAnalysisResult {
  counts: DisfluencyCounts;
  wordCount: number;
  fluencyScore: number;
  detectedInterjections: string[];
  detectedProlongations: string[];
  hasSignificantDisfluencies: boolean;
}

/** Interjection match with position */
export interface InterjectionMatch {
  text: string;
  start: number;
  end: number;
}

// ============================================================================
// TURN ANALYSIS TYPES
// ============================================================================

/** Turn phrase match with position */
export interface TurnPhraseMatch {
  phrase: string;
  phraseType: 'turn_final' | 'continuation';
  start: number;
  end: number;
}

/** Turn analysis result */
export interface TurnAnalysisResult {
  matches: TurnPhraseMatch[];
  turnFinalCount: number;
  continuationCount: number;
  likelyTurnComplete: boolean;
  likelyContinuing: boolean;
}

// ============================================================================
// SIGNAL EXTRACTION TYPES
// ============================================================================

/** Extracted signal from conversation */
export interface ExtractedSignal {
  signalType: string;
  value: string;
  context: string;
  start: number;
  end: number;
  confidence: number;
}

/** Signal extraction result */
export interface SignalExtractionResult {
  signals: ExtractedSignal[];
  hasSignals: boolean;
  highValueCount: number;
}

// ============================================================================
// TOKEN COUNTING TYPES
// ============================================================================

/** Text statistics */
export interface TextStats {
  words: number;
  tokensApprox: number;
  chars: number;
  bytes: number;
  sentences: number;
  lines: number;
  avgWordLength: number;
}

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
 */
function loadRustPerf(): RustPerf {
  if (loadAttempted && rustPerf) {
    return rustPerf;
  }

  if (loadAttempted && !rustPerf) {
    throw new NativeRustAcceleratorUnavailableError(loadError ?? 'Unknown error');
  }

  loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
// COSINE SIMILARITY (JS is faster for single operations - NOT a fallback)
// ============================================================================

/** Vector type for cosine similarity - accepts both number[] and Float32Array */
export type EmbeddingVector = number[] | Float32Array;

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
// VECTOR NORMALIZATION (SIMD-optimized)
// ============================================================================

/**
 * Normalize a vector to unit length (L2 normalization).
 * Uses pure JS for single vectors - fast enough for most cases.
 */
export function normalizeVector(v: EmbeddingVector): number[] {
  const arr = Array.isArray(v) ? v : Array.from(v);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    sumSq += arr[i] * arr[i];
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

// ============================================================================
// BATCH TOOL SCORING (Semantic Router Optimization)
// ============================================================================

/**
 * Input format matching ScoringWorker's ToolProfile interface.
 */
interface ToolProfileForScoring {
  toolId: string;
  patterns: RegExp[];
  keywords: Map<string, number>;
  embedding: Float32Array | number[] | null;
}

/**
 * Scoring result matching ScoringWorker's result format.
 */
export interface DetailedScoringResult {
  toolId: string;
  score: number;
  patternScore: number;
  keywordScore: number;
  embeddingScore: number;
  matchedPatterns: string[];
  matchedKeywords: string[];
}

/**
 * Convert ToolProfile to Rust-compatible ToolProfileInput format.
 */
function convertToRustProfile(
  profile: ToolProfileForScoring,
  embeddingIndex: number | undefined
): ToolProfileInput {
  const keywordsFlat: string[] = [];
  const keywordWeightsFlat: number[] = [];

  for (const [keyword, weight] of profile.keywords.entries()) {
    keywordsFlat.push(keyword);
    keywordWeightsFlat.push(weight);
  }

  return {
    toolId: profile.toolId,
    patterns: profile.patterns.map((p) => p.source),
    keywordsFlat,
    keywordWeightsFlat,
    hasEmbedding: profile.embedding !== null,
    embeddingIndex,
  };
}

/**
 * Batch tool scoring optimized with Rust SIMD and parallel processing.
 *
 * Performance characteristics:
 * - Rust: ~0.5-2ms for 50 tools (parallel regex + SIMD embeddings)
 *
 * @param query - User query to match against tools
 * @param profiles - Array of tool profiles with patterns, keywords, embeddings
 * @param queryEmbedding - Query embedding vector (optional)
 * @param config - Scoring weights and thresholds
 * @returns Sorted array of scoring results
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchScoreToolsOptimized(
  query: string,
  profiles: ToolProfileForScoring[],
  queryEmbedding: Float32Array | number[] | null = null,
  config: Partial<BatchScoringConfig> = {}
): DetailedScoringResult[] {
  const start = performance.now();

  const fullConfig: BatchScoringConfig = {
    patternWeight: config.patternWeight ?? 0.4,
    keywordWeight: config.keywordWeight ?? 0.3,
    embeddingWeight: config.embeddingWeight ?? 0.3,
    earlyTerminationThreshold: config.earlyTerminationThreshold ?? 0.95,
    minScoreThreshold: config.minScoreThreshold ?? 0.05,
  };

  const perf = loadRustPerf();

  if (!perf.batchScoreTools) {
    throw new NativeRustAcceleratorUnavailableError('batchScoreTools function not found');
  }

  // Build flat embedding array for tools that have embeddings
  const embeddingsWithIndex: Array<{ index: number; embedding: number[] }> = [];
  for (let i = 0; i < profiles.length; i++) {
    if (profiles[i].embedding) {
      const emb = profiles[i].embedding!;
      embeddingsWithIndex.push({
        index: i,
        embedding: Array.isArray(emb) ? emb : Array.from(emb),
      });
    }
  }

  // Convert profiles to Rust format
  const rustProfiles: ToolProfileInput[] = profiles.map((p, i) => {
    const embIdx = embeddingsWithIndex.findIndex((e) => e.index === i);
    return convertToRustProfile(p, embIdx >= 0 ? embIdx : undefined);
  });

  // Build flat embeddings array
  let toolEmbeddings: Float32Array | null = null;
  let embeddingDim: number | null = null;
  if (embeddingsWithIndex.length > 0) {
    embeddingDim = embeddingsWithIndex[0].embedding.length;
    toolEmbeddings = new Float32Array(embeddingsWithIndex.length * embeddingDim);
    for (let i = 0; i < embeddingsWithIndex.length; i++) {
      const emb = embeddingsWithIndex[i].embedding;
      for (let j = 0; j < embeddingDim; j++) {
        toolEmbeddings[i * embeddingDim + j] = emb[j];
      }
    }
  }

  const queryEmbF32 = queryEmbedding
    ? queryEmbedding instanceof Float32Array
      ? queryEmbedding
      : new Float32Array(queryEmbedding)
    : null;

  const rustResults = perf.batchScoreTools(
    query,
    rustProfiles,
    queryEmbF32,
    toolEmbeddings,
    embeddingDim,
    fullConfig
  );

  const elapsed = performance.now() - start;
  metrics.nativeCalls++;
  metrics.totalTimeMs += elapsed;
  metrics.totalBatchItems += profiles.length;

  return rustResults.map((r) => ({
    toolId: r.toolId,
    score: r.score,
    patternScore: r.patternScore,
    keywordScore: r.keywordScore,
    embeddingScore: r.embeddingScore,
    matchedPatterns: [],
    matchedKeywords: [],
  }));
}

/**
 * Check if batch tool scoring can use the native Rust path.
 */
export function isBatchToolScoringNativeAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.batchScoreTools !== undefined;
}

/**
 * Check if the native path should be used for a given operation.
 */
export function shouldUseNativePath(
  operation: 'batch' | 'pairwise' | 'topk' | 'toolScoring',
  itemCount: number
): boolean {
  if (!isRustAvailable()) return false;

  const useNative = process.env.USE_NATIVE_EMBEDDINGS !== 'false';
  if (!useNative) return false;

  const thresholds: Record<string, number> = {
    batch: 5,
    pairwise: 10,
    topk: 10,
    toolScoring: 5,
  };

  return itemCount >= (thresholds[operation] ?? 5);
}

/**
 * Log accelerator status for debugging.
 */
export function logAcceleratorStatus(): void {
  const info = getRustInfo();
  const m = getAcceleratorMetrics();

  if (info.available) {
    log.info(
      {
        rustAvailable: true,
        version: info.version,
        threads: info.threads,
        totalCalls: m.nativeCalls,
        avgTimeMs: m.avgTimeMs.toFixed(3),
        totalBatchItems: m.totalBatchItems,
      },
      '🦀 Rust accelerator status'
    );
  } else {
    log.error(
      {
        rustAvailable: false,
        error: loadError,
      },
      '❌ Rust accelerator unavailable'
    );
  }
}

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

// ============================================================================
// MESSAGE ANALYSIS (Rust-accelerated NLP)
// ============================================================================

/**
 * Analyze a user message for wrap-up signals, questions, greetings, and sentiment.
 * Uses Rust for parallel regex matching and keyword extraction.
 *
 * @param text - User message to analyze
 * @returns Analysis result with detected signals
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function analyzeMessageOptimized(text: string): MessageAnalysisResult {
  const perf = loadRustPerf();

  if (!perf.analyzeMessage) {
    throw new NativeRustAcceleratorUnavailableError('analyzeMessage function not found');
  }

  return perf.analyzeMessage(text);
}

/**
 * Batch analyze multiple messages in parallel.
 * Uses Rust for parallel processing.
 *
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchAnalyzeMessagesOptimized(messages: string[]): MessageAnalysisResult[] {
  const perf = loadRustPerf();

  if (!perf.batchAnalyzeMessages) {
    throw new NativeRustAcceleratorUnavailableError('batchAnalyzeMessages function not found');
  }

  return perf.batchAnalyzeMessages(messages);
}

/**
 * Check if native message analysis is available.
 */
export function isMessageAnalysisNativeAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.analyzeMessage !== undefined;
}

// ============================================================================
// EMOTIONAL STATE DETECTION (Rust-accelerated)
// ============================================================================

/**
 * Detect emotional state from text and optional voice indicators.
 * Combines text sentiment with voice prosody to detect mismatches.
 *
 * @param text - User text to analyze
 * @param voice - Optional voice prosody indicators
 * @returns Emotional state with mismatch detection
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function detectEmotionalStateOptimized(
  text: string,
  voice?: VoiceEmotionInput
): EmotionalStateResult {
  const perf = loadRustPerf();

  if (!perf.detectEmotionalState) {
    throw new NativeRustAcceleratorUnavailableError('detectEmotionalState function not found');
  }

  return perf.detectEmotionalState(text, voice || null);
}

/**
 * Check if native emotional state detection is available.
 */
export function isEmotionalStateNativeAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.detectEmotionalState !== undefined;
}

// ============================================================================
// CONVERSATION DYNAMICS (Rust-accelerated)
// ============================================================================

/**
 * Analyze conversation dynamics from turn history.
 * Tracks engagement, sentiment trajectory, and conversation phase.
 *
 * @param turns - Array of conversation turns
 * @returns Dynamics analysis with engagement and pacing suggestions
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function analyzeConversationDynamicsOptimized(
  turns: ConversationTurnInput[]
): ConversationDynamicsResult {
  if (turns.length === 0) {
    return {
      avgUserWords: 0,
      avgAgentWords: 0,
      turnRatio: 0.5,
      engagementScore: 0.5,
      conversationPhase: 'opening',
      sentimentTrend: 'stable',
      questionDensity: 0,
      suggestedPacing: 'maintain',
    };
  }

  const perf = loadRustPerf();

  if (!perf.analyzeConversationDynamics) {
    throw new NativeRustAcceleratorUnavailableError(
      'analyzeConversationDynamics function not found'
    );
  }

  return perf.analyzeConversationDynamics(turns);
}

/**
 * Check if native conversation dynamics analysis is available.
 */
export function isConversationDynamicsNativeAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.analyzeConversationDynamics !== undefined;
}

// ============================================================================
// TIME-SERIES FORECASTING (SIMD-accelerated)
// ============================================================================

/**
 * Calculate statistics for a time series using SIMD acceleration.
 * Computes mean, variance, std dev, min, max in a single optimized pass.
 *
 * @param values - Time series values
 * @returns Statistics object
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function calculateStatisticsF32(values: Float32Array): TimeSeriesStats {
  const perf = loadRustPerf();
  if (!perf.calculateStatisticsF32) {
    throw new NativeRustAcceleratorUnavailableError('calculateStatisticsF32 function not found');
  }
  return perf.calculateStatisticsF32(values);
}

/**
 * Calculate linear trend (slope) using SIMD-accelerated regression.
 *
 * @param values - Time series values
 * @returns Slope of the linear regression line
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function calculateLinearTrendF32(values: Float32Array): number {
  const perf = loadRustPerf();
  if (!perf.calculateLinearTrendF32) {
    throw new NativeRustAcceleratorUnavailableError('calculateLinearTrendF32 function not found');
  }
  return perf.calculateLinearTrendF32(values);
}

/**
 * Perform exponential smoothing (Holt's method) for forecasting.
 *
 * @param values - Time series values
 * @param alpha - Level smoothing factor (0-1)
 * @param beta - Trend smoothing factor (0-1)
 * @returns Smoothing result with level, trend, and forecast
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function exponentialSmoothingF32(
  values: Float32Array,
  alpha: number,
  beta: number
): ExponentialSmoothingResult {
  const perf = loadRustPerf();
  if (!perf.exponentialSmoothingF32) {
    throw new NativeRustAcceleratorUnavailableError('exponentialSmoothingF32 function not found');
  }
  return perf.exponentialSmoothingF32(values, alpha, beta);
}

/**
 * Detect seasonality in time series using variance decomposition.
 *
 * @param values - Time series values
 * @param maxPeriod - Maximum period to test (e.g., 365 for annual)
 * @returns Seasonality result with strength, period, and seasonal indices
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function calculateSeasonalityF32(
  values: Float32Array,
  maxPeriod: number
): SeasonalityResult {
  const perf = loadRustPerf();
  if (!perf.calculateSeasonalityF32) {
    throw new NativeRustAcceleratorUnavailableError('calculateSeasonalityF32 function not found');
  }
  return perf.calculateSeasonalityF32(values, maxPeriod);
}

/**
 * Batch calculate statistics for multiple time series in parallel.
 *
 * @param seriesFlat - Flattened array of all series values
 * @param seriesLengths - Length of each series
 * @returns Array of statistics for each series
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchCalculateStatisticsF32(
  seriesFlat: Float32Array,
  seriesLengths: number[]
): TimeSeriesStats[] {
  const perf = loadRustPerf();
  if (!perf.batchCalculateStatisticsF32) {
    throw new NativeRustAcceleratorUnavailableError(
      'batchCalculateStatisticsF32 function not found'
    );
  }
  return perf.batchCalculateStatisticsF32(seriesFlat, seriesLengths);
}

/**
 * Check if time-series forecasting functions are available.
 */
export function isTimeSeriesForecastingAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.calculateStatisticsF32 !== undefined;
}

// ============================================================================
// GUIDANCE BLOCK STRIPPING (Aho-Corasick accelerated)
// ============================================================================

let guidanceAutomatonBuilt = false;

/**
 * Build the Aho-Corasick automaton for guidance block pattern matching.
 * Call this once at startup for optimal performance.
 *
 * @returns true if automaton was built successfully
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function buildGuidanceAutomaton(): boolean {
  const perf = loadRustPerf();
  if (!perf.buildGuidanceAutomaton) {
    throw new NativeRustAcceleratorUnavailableError('buildGuidanceAutomaton function not found');
  }
  guidanceAutomatonBuilt = perf.buildGuidanceAutomaton();
  return guidanceAutomatonBuilt;
}

/**
 * Strip guidance/internal/system blocks from text.
 * Uses O(n) Aho-Corasick algorithm for efficient multi-pattern matching.
 *
 * Strips patterns:
 * - <guidance>...</guidance>
 * - <internal>...</internal>
 * - <system>...</system>
 * - [guidance]...[/guidance]
 * - [internal]...[/internal]
 * - [system]...[/system]
 *
 * @param text - Text to process
 * @returns Text with guidance blocks removed
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function stripGuidanceBlocks(text: string): string {
  const perf = loadRustPerf();
  if (!perf.stripGuidanceBlocks) {
    throw new NativeRustAcceleratorUnavailableError('stripGuidanceBlocks function not found');
  }
  // Auto-build automaton on first use
  if (!guidanceAutomatonBuilt) {
    buildGuidanceAutomaton();
  }
  return perf.stripGuidanceBlocks(text);
}

/**
 * Check if text contains any guidance blocks (fast check without stripping).
 *
 * @param text - Text to check
 * @returns true if any guidance block patterns are found
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function containsGuidanceBlocks(text: string): boolean {
  const perf = loadRustPerf();
  if (!perf.containsGuidanceBlocks) {
    throw new NativeRustAcceleratorUnavailableError('containsGuidanceBlocks function not found');
  }
  // Auto-build automaton on first use
  if (!guidanceAutomatonBuilt) {
    buildGuidanceAutomaton();
  }
  return perf.containsGuidanceBlocks(text);
}

/**
 * Clear the guidance automaton to free memory.
 * Call this during cleanup if needed.
 */
export function clearGuidanceAutomaton(): void {
  const perf = tryLoadRustPerf();
  if (perf?.clearGuidanceAutomaton) {
    perf.clearGuidanceAutomaton();
    guidanceAutomatonBuilt = false;
  }
}

/**
 * Check if guidance block stripping is available.
 */
export function isGuidanceStrippingAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.stripGuidanceBlocks !== undefined;
}

// ============================================================================
// FLUENCY ANALYSIS (Speech disfluency detection)
// ============================================================================

/**
 * Analyze speech fluency for disfluencies (repetitions, interjections, etc.).
 * Uses Rust with pre-compiled regex patterns for 5-8x speedup.
 *
 * @param text - Text to analyze
 * @returns Fluency analysis result with counts and detected patterns
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function analyzeFluency(text: string): FluencyAnalysisResult {
  const perf = loadRustPerf();
  if (!perf.analyzeFluency) {
    throw new NativeRustAcceleratorUnavailableError('analyzeFluency function not found');
  }
  return perf.analyzeFluency(text);
}

/**
 * Quick check if text has any disfluencies.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function hasDisfluencies(text: string): boolean {
  const perf = loadRustPerf();
  if (!perf.likelyHasDisfluencies) {
    throw new NativeRustAcceleratorUnavailableError('likelyHasDisfluencies function not found');
  }
  return perf.likelyHasDisfluencies(text);
}

/**
 * Count interjections (um, uh, er, etc.) in text.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function countInterjections(text: string): number {
  const perf = loadRustPerf();
  if (!perf.countInterjections) {
    throw new NativeRustAcceleratorUnavailableError('countInterjections function not found');
  }
  return perf.countInterjections(text);
}

/**
 * Batch analyze multiple texts for fluency in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchAnalyzeFluency(texts: string[]): FluencyAnalysisResult[] {
  const perf = loadRustPerf();
  if (!perf.batchAnalyzeFluency) {
    throw new NativeRustAcceleratorUnavailableError('batchAnalyzeFluency function not found');
  }
  return perf.batchAnalyzeFluency(texts);
}

/**
 * Check if fluency analysis is available.
 */
export function isFluencyAnalysisAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.analyzeFluency !== undefined;
}

// ============================================================================
// TURN ANALYSIS (Turn-boundary detection)
// ============================================================================

/**
 * Analyze text for turn-boundary indicators.
 * Uses Aho-Corasick automaton for O(n) multi-pattern matching.
 *
 * @param text - Text to analyze
 * @returns Turn analysis with phrase matches and completion signals
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function analyzeTurnBoundary(text: string): TurnAnalysisResult {
  const perf = loadRustPerf();
  if (!perf.analyzeTurn) {
    throw new NativeRustAcceleratorUnavailableError('analyzeTurn function not found');
  }
  return perf.analyzeTurn(text);
}

/**
 * Quick check if text contains turn-final phrases.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function hasTurnFinalPhrase(text: string): boolean {
  const perf = loadRustPerf();
  if (!perf.hasTurnFinal) {
    throw new NativeRustAcceleratorUnavailableError('hasTurnFinal function not found');
  }
  return perf.hasTurnFinal(text);
}

/**
 * Quick check if text contains continuation phrases.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function hasContinuationPhrase(text: string): boolean {
  const perf = loadRustPerf();
  if (!perf.hasContinuation) {
    throw new NativeRustAcceleratorUnavailableError('hasContinuation function not found');
  }
  return perf.hasContinuation(text);
}

/**
 * Get probability that turn is complete (0.0 = continuing, 1.0 = complete).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function getTurnCompleteProbability(text: string): number {
  const perf = loadRustPerf();
  if (!perf.turnCompleteProbability) {
    throw new NativeRustAcceleratorUnavailableError('turnCompleteProbability function not found');
  }
  return perf.turnCompleteProbability(text);
}

/**
 * Batch analyze multiple texts for turn boundaries in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchAnalyzeTurnBoundary(texts: string[]): TurnAnalysisResult[] {
  const perf = loadRustPerf();
  if (!perf.batchAnalyzeTurn) {
    throw new NativeRustAcceleratorUnavailableError('batchAnalyzeTurn function not found');
  }
  return perf.batchAnalyzeTurn(texts);
}

/**
 * Check if turn analysis is available.
 */
export function isTurnAnalysisAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.analyzeTurn !== undefined;
}

// ============================================================================
// SIGNAL EXTRACTION (Memory-worthy signals)
// ============================================================================

/**
 * Extract memory-worthy signals from conversation text.
 * Detects dates, values, dreams, fears, stress triggers, etc.
 *
 * @param text - Text to analyze
 * @returns Extraction result with signals and confidence scores
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function extractMemorySignals(text: string): SignalExtractionResult {
  const perf = loadRustPerf();
  if (!perf.extractSignals) {
    throw new NativeRustAcceleratorUnavailableError('extractSignals function not found');
  }
  return perf.extractSignals(text);
}

/**
 * Extract only high-value signals (birthdays, anniversaries, etc.).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function extractHighValueSignals(text: string): ExtractedSignal[] {
  const perf = loadRustPerf();
  if (!perf.extractHighValueSignals) {
    throw new NativeRustAcceleratorUnavailableError('extractHighValueSignals function not found');
  }
  return perf.extractHighValueSignals(text);
}

/**
 * Quick check if text has any memorable signals.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function hasMemorableSignals(text: string): boolean {
  const perf = loadRustPerf();
  if (!perf.hasMemorableSignals) {
    throw new NativeRustAcceleratorUnavailableError('hasMemorableSignals function not found');
  }
  return perf.hasMemorableSignals(text);
}

/**
 * Batch extract signals from multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export function batchExtractMemorySignals(texts: string[]): SignalExtractionResult[] {
  const perf = loadRustPerf();
  if (!perf.batchExtractSignals) {
    throw new NativeRustAcceleratorUnavailableError('batchExtractSignals function not found');
  }
  return perf.batchExtractSignals(texts);
}

/**
 * Check if signal extraction is available.
 */
export function isSignalExtractionAvailable(): boolean {
  const perf = tryLoadRustPerf();
  return perf?.extractSignals !== undefined;
}

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
// EXPORTS
// ============================================================================

// Private helpers exported for testing
export { loadRustPerf, tryLoadRustPerf, getShingles };
