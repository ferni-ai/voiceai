/**
 * Rust Accelerator type definitions.
 * @module memory/vectors/rust-accelerator/types
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

// ============================================================================
// FFT AUDIO ANALYSIS TYPES
// ============================================================================

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

// ============================================================================
// EMBEDDING CACHE TYPES
// ============================================================================

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
type RustEmbeddingCacheConstructor = new (
  maxSize: number,
  defaultTtlMs: number
) => RustEmbeddingCache;

/** Vector type for cosine similarity - accepts both number[] and Float32Array */
export type EmbeddingVector = number[] | Float32Array;
