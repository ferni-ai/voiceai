/**
 * Semantic Data Layer Integrations
 *
 * CONSOLIDATED: These are legacy wrappers for backward compatibility.
 * New code should import hooks directly from `../hooks/` instead.
 *
 * @module data-layer/integrations
 * @deprecated Import from `../hooks/` instead
 */

// ============================================================================
// LEGACY INTEGRATION FUNCTIONS (Backward Compatibility)
// These wrap the newer hooks pattern internally
// ============================================================================

// Trust Systems Integration
export {
  indexCommitment,
  deindexCommitment,
  indexBoundary,
  deindexBoundary,
  indexInsideJoke,
  deindexInsideJoke,
  indexGrowthReflection,
  deindexGrowthReflection,
  indexSmallWin,
  deindexSmallWin,
  indexTrustMoment,
  indexThinkingOfYou,
  deindexThinkingOfYou,
  indexReadingBetweenLines,
  deindexReadingBetweenLines,
  indexTonalMemory,
  deindexTonalMemory,
  indexVulnerabilityMoment,
  deindexVulnerabilityMoment,
  indexTrustMilestone,
  deindexTrustMilestone,
  indexLifeEvent,
  deindexLifeEvent,
  indexLearningStyle,
  deindexLearningStyle,
} from './trust-integration.js';

// Superhuman Services Integration
export {
  indexDream,
  deindexDream,
  indexLifeChapter,
  deindexLifeChapter,
  indexValuesAlignment,
  deindexValuesAlignment,
  indexCapacityState,
  deindexCapacityState,
  indexRelationshipMilestone,
  deindexRelationshipMilestone,
  indexSeasonalPattern,
  deindexSeasonalPattern,
  indexPredictiveCoaching,
  deindexPredictiveCoaching,
  indexEmotionalFirstAid,
  deindexEmotionalFirstAid,
} from './superhuman-integration.js';

// ============================================================================
// PREFERRED: HOOKS (New Code Should Use These)
// ============================================================================

// Re-export all hooks for easier migration
export * from '../hooks/index.js';
