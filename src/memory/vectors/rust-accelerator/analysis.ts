/**
 * Rust Accelerator — NLP analysis (message, emotional, dynamics, fluency, turn, signal, time-series, guidance).
 * @module memory/vectors/rust-accelerator/analysis
 */

import { loadRustPerf, tryLoadRustPerf, NativeRustAcceleratorUnavailableError } from './core.js';
import type {
  MessageAnalysisResult, VoiceEmotionInput, EmotionalStateResult,
  ConversationTurnInput, ConversationDynamicsResult,
  TimeSeriesStats, ExponentialSmoothingResult, SeasonalityResult,
  FluencyAnalysisResult, TurnAnalysisResult,
  ExtractedSignal, SignalExtractionResult,
} from './types.js';

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

