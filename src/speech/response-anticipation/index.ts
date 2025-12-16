/**
 * Response Anticipation Cache
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Workaround for LiveKit's inability to support preemptive LLM generation.
 * Instead of generating responses before turn-end, we:
 *
 * 1. **Pattern Caching**: Pre-cache likely responses for common patterns
 * 2. **Intent Prediction**: Predict user intent from partial transcript
 * 3. **Warm Response Templates**: Keep templates ready for quick customization
 * 4. **Semantic Prefetch**: Preload relevant context for faster LLM response
 *
 * This reduces perceived latency by ~100-200ms on cache hits.
 *
 * @module response-anticipation
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  AnticipatedResponse,
  CachedPattern,
  CacheStats,
  IntentCategory,
  PrefetchContext,
} from './types.js';

// ============================================================================
// PATTERNS & PREDICTION
// ============================================================================

export { CACHED_PATTERNS, predictIntent } from './patterns.js';

// ============================================================================
// PREFETCH
// ============================================================================

export { generatePrefetchContext } from './prefetch.js';

// ============================================================================
// SERVICE
// ============================================================================

export {
  getActiveResponseAnticipationCount,
  getResponseAnticipationService,
  resetResponseAnticipationService,
  ResponseAnticipationService,
} from './service.js';
