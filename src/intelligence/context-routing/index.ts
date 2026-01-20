/**
 * Smart Context Routing Module
 *
 * Phase 2 of BTH Communication System Overhaul.
 * ML-informed context selection with dynamic slot allocation.
 *
 * @module context-routing
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  ConversationMode,
  SlotAllocation,
  CategoryToSlot,
  ScoreSource,
  ScoreFactors,
  PredictiveScore,
  RejectionInfo,
  SelectionAlgorithm,
  SelectionDecision,
  BuilderEffectiveness,
  UserBuilderPreferences,
  CacheTier,
  CachedUserScores,
  GlobalEffectivenessCache,
  SmartSelectorOptions,
  AggregatedFeedback,
  RoutingVariant,
  RoutingExperimentConfig,
  ContextInjection,
} from './types.js';

export {
  MIN_SAMPLES_FOR_ML,
  MIN_SAMPLES_FOR_HEURISTIC,
  DEFAULT_SLOT_COUNT,
  FAST_MODE_SLOT_COUNT,
  SCORE_WEIGHTS,
  CACHE_TTL,
} from './types.js';

// ============================================================================
// SLOT ALLOCATION
// ============================================================================

export {
  SlotAllocator,
  createSlotAllocator,
  getAllocationForMode,
  MODE_ALLOCATIONS,
  FAST_MODE_ALLOCATIONS,
  CATEGORY_TO_SLOT,
  ESSENTIAL_CATEGORIES,
} from './slot-allocator.js';

// ============================================================================
// CACHING
// ============================================================================

export {
  CacheManager,
  createCacheManager,
  clearAllCaches,
  getGlobalCacheStats,
} from './cache-manager.js';

// ============================================================================
// SCORING
// ============================================================================

export {
  PredictiveScorer,
  createPredictiveScorer,
  getModeRelevance,
  computeScore,
  MODE_CATEGORY_RELEVANCE,
} from './predictive-scorer.js';

// ============================================================================
// SMART SELECTION
// ============================================================================

export {
  SmartSelector,
  createSmartSelector,
  selectInjections,
  setupSmartRoutingExperiment,
  SMART_ROUTING_EXPERIMENT_ID,
} from './smart-selector.js';

// ============================================================================
// FEEDBACK AGGREGATION
// ============================================================================

export {
  FeedbackAggregator,
  createFeedbackAggregator,
  getFeedbackAggregator,
  initializeFeedbackAggregator,
  calculateRoi,
} from './feedback-aggregator.js';
