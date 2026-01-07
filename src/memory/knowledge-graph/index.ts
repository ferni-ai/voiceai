/**
 * Knowledge Graph Module
 *
 * Unified entity-centric memory architecture for "Better Than Human" memory.
 *
 * This module provides:
 * - Entity extraction from conversation (LLM + rule-based)
 * - Fact extraction about entities
 * - Relationship extraction between entities
 * - Knowledge capture pipeline (wire into turn processor)
 * - Proactive surfacing of relevant memories
 * - Pattern/correlation detection
 *
 * @module memory/knowledge-graph
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  Entity,
  EntityType,
  Relationship,
  RelationshipType,
  Fact,
  FactSource,
  TemporalMention,
  Correlation,
  CorrelationType,
  EntityQuery,
  EntityQueryResult,
  EntityProfile,
  ConsolidationResult,
  DecayConfig,
  SurfacingRecommendation,
  SurfacingReason,
} from './types.js';

// ============================================================================
// EXTRACTOR EXPORTS
// ============================================================================

export {
  extractEntities,
  extractEntitiesRuleBased,
  extractFacts,
  extractFactsRuleBased,
  extractRelationships,
  extractRelationshipsRuleBased,
  type ExtractedEntity,
  type ExtractionContext,
  type ExtractionResult,
  type FactExtractionInput,
  type FactExtractionResult,
  type RelationshipExtractionInput,
  type ExtractedRelationship,
  type RelationshipExtractionResult,
} from './extractors/index.js';

// ============================================================================
// SERVICE EXPORTS
// ============================================================================

export {
  captureTurn,
  captureBatch,
  initializeKnowledgeCapture,
  setKnowledgeCaptureEnabled,
  isKnowledgeCaptureReady,
  type TurnCaptureInput,
  type CaptureResult,
  // Natural language query
  executeNaturalQuery,
  detectQueryType,
  type QueryType,
  type QueryOptions,
  type NaturalQueryResult,
} from './services/index.js';

// ============================================================================
// INTEGRATION EXPORTS
// ============================================================================

export {
  integrateContact,
  integrateCommitment,
  integrateRelationshipMention,
  processConversationTurn,
  syncFromSuperhumanService,
  migrateUserData,
} from './integration.js';

// ============================================================================
// PROACTIVE SURFACING EXPORTS
// ============================================================================

export {
  getProactiveSurfacingEngine,
  default as ProactiveSurfacingEngine,
} from './proactive-surfacing.js';

// ============================================================================
// CONSOLIDATION EXPORTS
// ============================================================================

export {
  getConsolidationEngine,
  default as ConsolidationEngine,
} from './consolidation.js';

// ============================================================================
// STORAGE EXPORTS
// ============================================================================

export {
  // Insight store
  createInsight,
  updateInsight,
  getInsight,
  getAllInsights,
  getInsightsReadyToSurface,
  getInsightsForEntities,
  deleteInsight,
  deleteExpiredInsights,
  deleteNegativeInsights,
  createInsightsBatch,
  getInsightStats,
  recordInsightSurfaced,
  recordInsightFeedback,
  // Thread store
  createThread,
  updateThread,
  getThread,
  getActiveThreads,
  getThreadsForEntity,
  getOpenLoopThreads,
  closeThread,
  recordThreadSession,
  addOpenQuestion,
  resolveOpenQuestion,
  getThreadStats,
  findOrCreateThread,
  markDormantThreads,
} from './storage/index.js';
