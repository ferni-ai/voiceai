/**
 * FTIS - Ferni Tool Intelligence System
 *
 * Main entry point for tool classification.
 *
 * Architecture:
 * - V3 Classifier: SOTA with ROIC boundaries + BaseCal calibration
 * - V2 Classifier: Production-ready with transformers.js + ONNX
 * - Gemini Fallback: For low-confidence predictions
 * - Hybrid Router: Tiered routing (fast/verify/llm)
 * - Observability: Prometheus metrics + feedback loop
 *
 * @module tools/intelligence
 */

// =============================================================================
// V2/V3 CLASSIFIER (RECOMMENDED)
// =============================================================================

export {
  FTISClassifierV2,
  getFTISClassifierV2,
  initializeFTISClassifierV2,
  resetFTISClassifierV2,
  type ClassificationResult,
  type ClassifierConfig,
  type ClassifierMetrics,
} from './tool-classifier.js';

// =============================================================================
// V3 COMPONENTS (SOTA 2026)
// =============================================================================

// ROIC-style decision boundaries for open intent detection
export {
  FTISDecisionBoundary,
  getFTISDecisionBoundary,
  resetFTISDecisionBoundary,
  type BoundaryCheckResult,
  type OpenIntentResult,
  type DecisionBoundaries,
} from './classifier-boundary.js';

// BaseCal confidence calibration
export {
  FTISCalibration,
  getFTISCalibration,
  resetFTISCalibration,
  type CalibrationResult,
  type CalibrationInput,
} from './classifier-calibration.js';

// Hybrid routing architecture
export {
  FTISHybridRouter,
  getFTISHybridRouter,
  resetFTISHybridRouter,
  type RoutingDecision,
  type RoutingTier,
  type HybridRouterConfig,
  type RouterMetrics,
} from './tool-router.js';

// =============================================================================
// CONVENIENCE ALIASES
// =============================================================================

import {
  FTISClassifierV2,
  getFTISClassifierV2,
  initializeFTISClassifierV2,
  type ClassificationResult,
  type ClassifierConfig,
} from './tool-classifier.js';

// Default export for easy import
export default FTISClassifierV2;

// Convenience function for one-off classification
let defaultClassifier: FTISClassifierV2 | null = null;

/**
 * Classify a query using the default classifier instance.
 *
 * @example
 * const result = await classifyQuery('Play some jazz music');
 * console.log(result.superCategory); // 'media'
 * console.log(result.fineCategory);  // 'play_music'
 * console.log(result.toolIds);       // ['spotify_play', 'music_play', ...]
 */
export async function classifyQuery(
  query: string,
  config?: Partial<ClassifierConfig>
): Promise<ClassificationResult | null> {
  if (!defaultClassifier) {
    defaultClassifier = await initializeFTISClassifierV2(config);
  }
  return defaultClassifier.classify(query);
}

/**
 * Get tools for a query in one step.
 *
 * @example
 * const tools = await getToolsForQuery('Play some jazz music');
 * // Returns: ['spotify_play', 'music_play', 'sonos_play', ...]
 */
export async function getToolsForQuery(
  query: string,
  config?: Partial<ClassifierConfig>
): Promise<string[]> {
  const result = await classifyQuery(query, config);
  return result?.toolIds || [];
}

/**
 * Initialize and warmup the classifier for production use.
 * Call this at application startup to avoid cold-start latency.
 */
export async function warmupClassifier(config?: Partial<ClassifierConfig>): Promise<void> {
  const classifier = await initializeFTISClassifierV2(config);
  await classifier.warmup();
}

// =============================================================================
// LEGACY EXPORTS (for backwards compatibility)
// =============================================================================

export {
  HierarchicalClassifier,
  getHierarchicalClassifier,
  initializeHierarchicalClassifier,
} from './ftis-hierarchical-classifier.js';

export {
  GeminiFallbackClassifier,
  getGeminiFallback,
  getEmbedding,
  cosineSimilarity,
  findMostSimilarCategory,
} from './gemini-fallback.js';
