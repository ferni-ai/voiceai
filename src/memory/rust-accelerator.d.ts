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
/** Pattern matcher class interface */
interface RustPatternMatcher {
    addToolPatterns: (toolId: string, patterns: string[]) => void;
    scoreAllPatterns: (query: string) => string[];
    toolCount: () => number;
}
/** Constructor type for RustPatternMatcher */
type RustPatternMatcherConstructor = new () => RustPatternMatcher;
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
/** Audio features extracted from FFT analysis */
export interface AudioFeatures {
    rmsEnergy: number;
    zeroCrossingRate: number;
    spectralCentroid: number;
    spectralFlux: number;
    spectralRolloff: number;
    dominantBin: number;
    dominantMagnitude: number;
}
/** FFT Processor class interface */
interface RustFftProcessor {
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
type RustFftProcessorConstructor = new (fftSize: number) => RustFftProcessor;
/** Embedding cache statistics */
export interface EmbeddingCacheStats {
    size: number;
    capacity: number;
    utilization: number;
}
/** Embedding cache class interface */
interface RustEmbeddingCache {
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
type RustEmbeddingCacheConstructor = new (maxSize: number, defaultTtlMs: number) => RustEmbeddingCache;
interface RustPerf {
    getLibraryInfo: () => {
        version: string;
        simdAvailable: boolean;
        parallelThreads: number;
    };
    cosineSimilarity: (a: number[], b: number[]) => number;
    batchCosineSimilarity: (query: number[], candidates: number[][]) => number[];
    textSimilarity: (text1: string, text2: string, shingleSize?: number) => number;
    batchTextSimilarity: (query: string, candidates: string[], shingleSize?: number) => number[];
    findDuplicatesLsh: (texts: string[], threshold: number, numHashes?: number, numBands?: number) => Array<{
        firstIdx: number;
        secondIdx: number;
        similarity: number;
    }>;
    computeMinhash: (text: string, numHashes: number, shingleSize?: number) => {
        id: string;
        signature: number[];
    };
    estimateSimilarityFromMinhash: (sig1: number[], sig2: number[]) => number;
    batchCosineSimilarityF32?: (query: Float32Array, candidates: Float32Array, candidateCount: number) => Float32Array;
    findSimilarPairsF32?: (embeddings: Float32Array, embeddingCount: number, dim: number, threshold: number) => SimilarPairResult[];
    topKSimilarF32?: (query: Float32Array, candidates: Float32Array, candidateCount: number, k: number, minSimilarity: number) => TopKResult;
    batchScoreTools?: (query: string, profiles: ToolProfileInput[], queryEmbedding: Float32Array | null, toolEmbeddings: Float32Array | null, embeddingDim: number | null, config: BatchScoringConfig | null) => ToolScoringResult[];
    PatternMatcher?: RustPatternMatcherConstructor;
    deduplicateInjections?: (injections: InjectionInput[], similarityThreshold?: number) => DeduplicationResult;
    keywordJaccardSimilarity?: (text1: string, text2: string) => number;
    textSemanticSimilarity?: (text1: string, text2: string) => number;
    analyzeMessage?: (text: string) => MessageAnalysisResult;
    batchAnalyzeMessages?: (messages: string[]) => MessageAnalysisResult[];
    detectEmotionalState?: (text: string, voice: VoiceEmotionInput | null) => EmotionalStateResult;
    analyzeConversationDynamics?: (turns: ConversationTurnInput[]) => ConversationDynamicsResult;
    euclideanDistance?: (a: number[], b: number[]) => number;
    batchEuclideanDistance?: (query: number[], candidates: number[][]) => number[];
    euclideanDistanceF32?: (a: Float32Array, b: Float32Array) => number;
    batchEuclideanDistanceF32?: (query: Float32Array, candidates: Float32Array, candidateCount: number) => Float32Array;
    normalizeVectorF32?: (v: Float32Array) => Float32Array;
    batchNormalizeVectorsF32?: (embeddings: Float32Array, embeddingCount: number) => Float32Array;
    vectorNormF32?: (v: Float32Array) => number;
    computeCentroidF32?: (embeddings: Float32Array, embeddingCount: number) => Float32Array;
    calculateStatisticsF32?: (values: Float32Array) => TimeSeriesStats;
    calculateLinearTrendF32?: (values: Float32Array) => number;
    exponentialSmoothingF32?: (values: Float32Array, alpha: number, beta: number) => ExponentialSmoothingResult;
    calculateSeasonalityF32?: (values: Float32Array, maxPeriod: number) => SeasonalityResult;
    batchCalculateStatisticsF32?: (seriesFlat: Float32Array, seriesLengths: number[]) => TimeSeriesStats[];
    buildGuidanceAutomaton?: () => boolean;
    stripGuidanceBlocks?: (text: string) => string;
    containsGuidanceBlocks?: (text: string) => boolean;
    clearGuidanceAutomaton?: () => void;
    analyzeFluency?: (text: string) => FluencyAnalysisResult;
    likelyHasDisfluencies?: (text: string) => boolean;
    countInterjections?: (text: string) => number;
    batchAnalyzeFluency?: (texts: string[]) => FluencyAnalysisResult[];
    analyzeTurn?: (text: string) => TurnAnalysisResult;
    hasTurnFinal?: (text: string) => boolean;
    hasContinuation?: (text: string) => boolean;
    turnCompleteProbability?: (text: string) => number;
    batchAnalyzeTurn?: (texts: string[]) => TurnAnalysisResult[];
    extractSignals?: (text: string) => SignalExtractionResult;
    extractHighValueSignals?: (text: string) => ExtractedSignal[];
    hasMemorableSignals?: (text: string) => boolean;
    batchExtractSignals?: (texts: string[]) => SignalExtractionResult[];
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
    NapiFftProcessor?: RustFftProcessorConstructor;
    getRmsEnergy?: (samples: number[]) => number;
    getZeroCrossingRate?: (samples: number[]) => number;
    NapiEmbeddingCache?: RustEmbeddingCacheConstructor;
    hashTextSha256?: (text: string) => string;
    batchHashTextsSha256?: (texts: string[]) => string[];
}
/**
 * Custom error for when Rust accelerator module is not available.
 */
export declare class NativeRustAcceleratorUnavailableError extends Error {
    constructor(reason: string);
}
/**
 * Load the native Rust performance library.
 * Throws NativeRustAcceleratorUnavailableError if not available.
 */
declare function loadRustPerf(): RustPerf;
/**
 * Try to load the native module, returning null on failure instead of throwing.
 * Use this only for availability checks, not for actual operations.
 */
declare function tryLoadRustPerf(): RustPerf | null;
/**
 * Check if Rust accelerator is available.
 */
export declare function isRustAvailable(): boolean;
/**
 * Get Rust library info if available.
 */
export declare function getRustInfo(): {
    version: string;
    threads: number;
    available: boolean;
};
/**
 * Get the reason native module failed to load (for debugging).
 */
export declare function getRustLoadError(): string | null;
/**
 * Ensure Rust accelerator is available, throwing if not.
 * Call this at startup to fail fast.
 */
export declare function requireRustAccelerator(): void;
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
export declare function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
/**
 * Batch cosine similarity - compare query against many candidates.
 * Uses pure JS for small batches, Rust for larger batches.
 */
export declare function batchCosineSimilarity(query: number[], candidates: number[][]): number[];
/**
 * Compute Euclidean distance between two vectors.
 * Uses pure JS - V8 is optimized for single operations.
 */
export declare function euclideanDistance(a: EmbeddingVector, b: EmbeddingVector): number;
/**
 * Batch euclidean distance - compare query against many candidates.
 * Uses SIMD-accelerated Rust for optimal performance.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchEuclideanDistance(query: number[], candidates: number[][]): number[];
/**
 * SIMD-optimized euclidean distance for Float32Array vectors.
 * Uses Rust SIMD for 8-way parallelism.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function euclideanDistanceF32(a: Float32Array, b: Float32Array): number;
/**
 * Batch euclidean distance with Float32Array for maximum performance.
 * Uses zero-copy transfer and SIMD acceleration.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchEuclideanDistanceF32(query: Float32Array, candidates: Float32Array, candidateCount: number): Float32Array;
/**
 * Normalize a vector to unit length (L2 normalization).
 * Uses pure JS for single vectors - fast enough for most cases.
 */
export declare function normalizeVector(v: EmbeddingVector): number[];
/**
 * SIMD-optimized vector normalization for Float32Array.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function normalizeVectorF32(v: Float32Array): Float32Array;
/**
 * Batch normalize multiple vectors with SIMD and parallel processing.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchNormalizeVectorsF32(embeddings: Float32Array, embeddingCount: number): Float32Array;
/**
 * Compute L2 norm (magnitude) of a vector.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function vectorNormF32(v: Float32Array): number;
/**
 * Compute centroid (mean vector) of multiple embeddings.
 * Useful for clustering and averaging embeddings.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function computeCentroidF32(embeddings: Float32Array, embeddingCount: number): Float32Array;
/**
 * Generate k-shingles from text.
 */
declare function getShingles(text: string, k: number): Set<string>;
/**
 * Compute Jaccard similarity between two texts.
 * Uses pure JS - sufficient for single comparisons.
 */
export declare function textSimilarity(text1: string, text2: string, shingleSize?: number): number;
/**
 * Batch text similarity - uses Rust for parallel shingle computation.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchTextSimilarity(query: string, candidates: string[], shingleSize?: number): number[];
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
export declare function findDuplicatesLsh(texts: string[], threshold: number, numHashes?: number, numBands?: number): DuplicatePair[];
/**
 * Convert f64 number arrays to Float32Array for SIMD operations.
 * OpenAI returns f64 but f32 is sufficient for similarity and 2x faster.
 */
export declare function toFloat32Array(arr: number[]): Float32Array;
/**
 * Convert multiple embeddings to a flat Float32Array.
 * Layout: [emb0[0], emb0[1], ..., emb0[dim-1], emb1[0], ...]
 */
export declare function toFlatFloat32Array(embeddings: number[][]): Float32Array;
/**
 * Batch cosine similarity with F32 SIMD optimization.
 *
 * @param query - Query embedding (1536 floats for OpenAI)
 * @param candidates - Array of candidate embeddings
 * @returns Array of similarity scores in same order as candidates
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchCosineSimilarityOptimized(query: number[], candidates: number[][]): number[];
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
export declare function findSimilarPairs(embeddings: number[][], threshold: number, dim?: number): SimilarPairResult[];
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
export declare function topKSimilar(query: number[], candidates: number[][], k: number, minSimilarity?: number): TopKResult;
/**
 * Check if F32 SIMD operations are available.
 */
export declare function isF32SimdAvailable(): boolean;
/** Metrics for tracking native path usage */
interface RustAcceleratorMetrics {
    nativeCalls: number;
    totalBatchItems: number;
    totalTimeMs: number;
    lastResetTime: number;
}
/**
 * Get current accelerator metrics.
 */
export declare function getAcceleratorMetrics(): RustAcceleratorMetrics & {
    avgTimeMs: number;
    uptime: number;
};
/**
 * Reset accelerator metrics.
 */
export declare function resetAcceleratorMetrics(): void;
/**
 * Find similar pairs with metrics tracking.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function findSimilarPairsOptimized(embeddings: number[][], threshold: number, dim?: number): SimilarPairResult[];
/**
 * Batch search with metrics tracking.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchSearchOptimized(query: number[], candidates: number[][], k?: number, minSimilarity?: number): TopKResult;
/**
 * Batch cosine similarity with metrics tracking.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchCosineSimilarityWithMetrics(query: number[], candidates: number[][]): number[];
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
export declare function batchScoreToolsOptimized(query: string, profiles: ToolProfileForScoring[], queryEmbedding?: Float32Array | number[] | null, config?: Partial<BatchScoringConfig>): DetailedScoringResult[];
/**
 * Check if batch tool scoring can use the native Rust path.
 */
export declare function isBatchToolScoringNativeAvailable(): boolean;
/**
 * Check if the native path should be used for a given operation.
 */
export declare function shouldUseNativePath(operation: 'batch' | 'pairwise' | 'topk' | 'toolScoring', itemCount: number): boolean;
/**
 * Log accelerator status for debugging.
 */
export declare function logAcceleratorStatus(): void;
/**
 * Deduplicate injections based on semantic similarity.
 * Uses Rust for parallel keyword extraction and Jaccard comparison.
 *
 * @param injections - Array of injection inputs
 * @param similarityThreshold - Threshold for duplicates (0-1), default 0.7
 * @returns Which injections to keep and which were removed
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function deduplicateInjectionsOptimized(injections: InjectionInput[], similarityThreshold?: number): DeduplicationResult;
/**
 * Check if native injection deduplication is available.
 */
export declare function isInjectionDeduplicationNativeAvailable(): boolean;
/**
 * Analyze a user message for wrap-up signals, questions, greetings, and sentiment.
 * Uses Rust for parallel regex matching and keyword extraction.
 *
 * @param text - User message to analyze
 * @returns Analysis result with detected signals
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function analyzeMessageOptimized(text: string): MessageAnalysisResult;
/**
 * Batch analyze multiple messages in parallel.
 * Uses Rust for parallel processing.
 *
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchAnalyzeMessagesOptimized(messages: string[]): MessageAnalysisResult[];
/**
 * Check if native message analysis is available.
 */
export declare function isMessageAnalysisNativeAvailable(): boolean;
/**
 * Detect emotional state from text and optional voice indicators.
 * Combines text sentiment with voice prosody to detect mismatches.
 *
 * @param text - User text to analyze
 * @param voice - Optional voice prosody indicators
 * @returns Emotional state with mismatch detection
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function detectEmotionalStateOptimized(text: string, voice?: VoiceEmotionInput): EmotionalStateResult;
/**
 * Check if native emotional state detection is available.
 */
export declare function isEmotionalStateNativeAvailable(): boolean;
/**
 * Analyze conversation dynamics from turn history.
 * Tracks engagement, sentiment trajectory, and conversation phase.
 *
 * @param turns - Array of conversation turns
 * @returns Dynamics analysis with engagement and pacing suggestions
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function analyzeConversationDynamicsOptimized(turns: ConversationTurnInput[]): ConversationDynamicsResult;
/**
 * Check if native conversation dynamics analysis is available.
 */
export declare function isConversationDynamicsNativeAvailable(): boolean;
/**
 * Calculate statistics for a time series using SIMD acceleration.
 * Computes mean, variance, std dev, min, max in a single optimized pass.
 *
 * @param values - Time series values
 * @returns Statistics object
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function calculateStatisticsF32(values: Float32Array): TimeSeriesStats;
/**
 * Calculate linear trend (slope) using SIMD-accelerated regression.
 *
 * @param values - Time series values
 * @returns Slope of the linear regression line
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function calculateLinearTrendF32(values: Float32Array): number;
/**
 * Perform exponential smoothing (Holt's method) for forecasting.
 *
 * @param values - Time series values
 * @param alpha - Level smoothing factor (0-1)
 * @param beta - Trend smoothing factor (0-1)
 * @returns Smoothing result with level, trend, and forecast
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function exponentialSmoothingF32(values: Float32Array, alpha: number, beta: number): ExponentialSmoothingResult;
/**
 * Detect seasonality in time series using variance decomposition.
 *
 * @param values - Time series values
 * @param maxPeriod - Maximum period to test (e.g., 365 for annual)
 * @returns Seasonality result with strength, period, and seasonal indices
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function calculateSeasonalityF32(values: Float32Array, maxPeriod: number): SeasonalityResult;
/**
 * Batch calculate statistics for multiple time series in parallel.
 *
 * @param seriesFlat - Flattened array of all series values
 * @param seriesLengths - Length of each series
 * @returns Array of statistics for each series
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchCalculateStatisticsF32(seriesFlat: Float32Array, seriesLengths: number[]): TimeSeriesStats[];
/**
 * Check if time-series forecasting functions are available.
 */
export declare function isTimeSeriesForecastingAvailable(): boolean;
/**
 * Build the Aho-Corasick automaton for guidance block pattern matching.
 * Call this once at startup for optimal performance.
 *
 * @returns true if automaton was built successfully
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function buildGuidanceAutomaton(): boolean;
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
export declare function stripGuidanceBlocks(text: string): string;
/**
 * Check if text contains any guidance blocks (fast check without stripping).
 *
 * @param text - Text to check
 * @returns true if any guidance block patterns are found
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function containsGuidanceBlocks(text: string): boolean;
/**
 * Clear the guidance automaton to free memory.
 * Call this during cleanup if needed.
 */
export declare function clearGuidanceAutomaton(): void;
/**
 * Check if guidance block stripping is available.
 */
export declare function isGuidanceStrippingAvailable(): boolean;
/**
 * Analyze speech fluency for disfluencies (repetitions, interjections, etc.).
 * Uses Rust with pre-compiled regex patterns for 5-8x speedup.
 *
 * @param text - Text to analyze
 * @returns Fluency analysis result with counts and detected patterns
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function analyzeFluency(text: string): FluencyAnalysisResult;
/**
 * Quick check if text has any disfluencies.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function hasDisfluencies(text: string): boolean;
/**
 * Count interjections (um, uh, er, etc.) in text.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countInterjections(text: string): number;
/**
 * Batch analyze multiple texts for fluency in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchAnalyzeFluency(texts: string[]): FluencyAnalysisResult[];
/**
 * Check if fluency analysis is available.
 */
export declare function isFluencyAnalysisAvailable(): boolean;
/**
 * Analyze text for turn-boundary indicators.
 * Uses Aho-Corasick automaton for O(n) multi-pattern matching.
 *
 * @param text - Text to analyze
 * @returns Turn analysis with phrase matches and completion signals
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function analyzeTurnBoundary(text: string): TurnAnalysisResult;
/**
 * Quick check if text contains turn-final phrases.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function hasTurnFinalPhrase(text: string): boolean;
/**
 * Quick check if text contains continuation phrases.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function hasContinuationPhrase(text: string): boolean;
/**
 * Get probability that turn is complete (0.0 = continuing, 1.0 = complete).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function getTurnCompleteProbability(text: string): number;
/**
 * Batch analyze multiple texts for turn boundaries in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchAnalyzeTurnBoundary(texts: string[]): TurnAnalysisResult[];
/**
 * Check if turn analysis is available.
 */
export declare function isTurnAnalysisAvailable(): boolean;
/**
 * Extract memory-worthy signals from conversation text.
 * Detects dates, values, dreams, fears, stress triggers, etc.
 *
 * @param text - Text to analyze
 * @returns Extraction result with signals and confidence scores
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function extractMemorySignals(text: string): SignalExtractionResult;
/**
 * Extract only high-value signals (birthdays, anniversaries, etc.).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function extractHighValueSignals(text: string): ExtractedSignal[];
/**
 * Quick check if text has any memorable signals.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function hasMemorableSignals(text: string): boolean;
/**
 * Batch extract signals from multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchExtractMemorySignals(texts: string[]): SignalExtractionResult[];
/**
 * Check if signal extraction is available.
 */
export declare function isSignalExtractionAvailable(): boolean;
/**
 * Count words in text (space-separated tokens).
 * Uses byte-level iteration for 2-3x speedup over JS split/filter.
 *
 * @param text - Text to count
 * @returns Word count
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countWordsRust(text: string): number;
/**
 * Count approximate tokens (OpenAI-style).
 * Rough approximation: words + punctuation. 10-100x faster than tiktoken.
 *
 * @param text - Text to count
 * @returns Approximate token count
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countTokensApproxRust(text: string): number;
/**
 * Count characters (Unicode-aware).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countCharsRust(text: string): number;
/**
 * Count bytes.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countBytesRust(text: string): number;
/**
 * Count sentences.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countSentencesRust(text: string): number;
/**
 * Count lines.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function countLinesRust(text: string): number;
/**
 * Get comprehensive text statistics.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function getTextStatsRust(text: string): TextStats;
/**
 * Quick check if text exceeds token limit.
 * Uses fast byte-based estimate before accurate count.
 *
 * @param text - Text to check
 * @param limit - Token limit
 * @returns true if text exceeds limit
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function exceedsTokenLimitRust(text: string, limit: number): boolean;
/**
 * Truncate text to approximate token limit.
 * Uses binary search to find optimal cutoff.
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum tokens
 * @returns Truncated text
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function truncateToTokensRust(text: string, maxTokens: number): string;
/**
 * Batch count words for multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchCountWordsRust(texts: string[]): number[];
/**
 * Batch count tokens for multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchCountTokensRust(texts: string[]): number[];
/**
 * Batch get text stats for multiple texts in parallel.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchGetStatsRust(texts: string[]): TextStats[];
/**
 * Check if token counting is available.
 */
export declare function isTokenCountingAvailable(): boolean;
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
export declare class FftProcessor {
    private processor;
    constructor(fftSize: number);
    /** Process audio frame and return magnitude spectrum */
    processFrame(samples: number[]): number[];
    /** Compute spectral flux (change from previous frame) - higher = onset/transient */
    computeSpectralFlux(samples: number[]): number;
    /** Get spectral centroid (brightness measure) in Hz */
    getSpectralCentroid(sampleRate: number): number;
    /** Get spectral rolloff (frequency bin containing threshold% of energy) */
    getSpectralRolloff(threshold?: number): number;
    /** Extract all audio features from a frame */
    extractFeatures(samples: number[], sampleRate: number): AudioFeatures;
    /** Get FFT size */
    get fftSize(): number;
    /** Get number of frequency bins */
    get numBins(): number;
    /** Reset processor (clear previous frame data) */
    reset(): void;
}
/**
 * Create a new FFT processor instance.
 * @param fftSize - FFT window size (typically 1024 or 2048)
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function createFftProcessor(fftSize: number): FftProcessor;
/**
 * Get RMS energy of audio samples (SIMD-accelerated).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function getRmsEnergyRust(samples: number[]): number;
/**
 * Get zero crossing rate of audio samples.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function getZeroCrossingRateRust(samples: number[]): number;
/**
 * Check if FFT audio analysis is available.
 */
export declare function isFftAnalysisAvailable(): boolean;
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
export declare class NativeEmbeddingCache {
    private cache;
    constructor(maxSize: number, defaultTtlMs: number);
    /** Get an embedding from the cache (returns null if not found or expired) */
    get(text: string, currentTimeMs?: number): number[] | null;
    /** Put an embedding in the cache */
    put(text: string, embedding: number[], currentTimeMs?: number): void;
    /** Put an embedding with custom TTL */
    putWithTtl(text: string, embedding: number[], currentTimeMs: number, ttlMs: number): void;
    /** Remove an entry from the cache */
    remove(text: string): boolean;
    /** Clear all entries from the cache */
    clear(): void;
    /** Get the current number of entries */
    get size(): number;
    /** Check if the cache is empty */
    get isEmpty(): boolean;
    /** Get cache capacity */
    get capacity(): number;
    /** Prune expired entries, returns count of entries removed */
    pruneExpired(currentTimeMs?: number): number;
    /** Get cache statistics */
    getStats(): EmbeddingCacheStats;
}
/**
 * Create a new embedding cache instance.
 * @param maxSize - Maximum number of entries
 * @param defaultTtlMs - Default time-to-live in milliseconds
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function createEmbeddingCache(maxSize: number, defaultTtlMs: number): NativeEmbeddingCache;
/**
 * Compute SHA256 hash of text (returns hex string).
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function hashTextSha256(text: string): string;
/**
 * Batch compute SHA256 hashes for multiple texts.
 * @throws NativeRustAcceleratorUnavailableError if native module not available
 */
export declare function batchHashTextsSha256(texts: string[]): string[];
/**
 * Check if embedding cache is available.
 */
export declare function isEmbeddingCacheAvailable(): boolean;
export { loadRustPerf, tryLoadRustPerf, getShingles };
//# sourceMappingURL=rust-accelerator.d.ts.map