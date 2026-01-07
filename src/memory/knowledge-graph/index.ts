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
// SERVICE IMPORTS & EXPORTS
// ============================================================================

// Import for local use in getKnowledgeGraph
import {
  captureTurn,
  isKnowledgeCaptureReady,
} from './services/index.js';

import {
  executeNaturalQuery,
} from './services/index.js';

// Re-export everything
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
  getUnifiedQueryEngine,
  type UnifiedQueryEngine,
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

// ============================================================================
// ENTITY RESOLVER RE-EXPORT
// ============================================================================

export {
  getEntityResolver,
  type EntityResolver,
} from '../entity-store/entity-resolver.js';

// ============================================================================
// KNOWLEDGE GRAPH SINGLETON
// ============================================================================

import type { EntityResolver } from '../entity-store/entity-resolver.js';
import type { UnifiedQueryEngine } from './services/natural-language-query.js';

/**
 * Knowledge Graph - unified facade for the knowledge graph system
 *
 * This provides a singleton accessor pattern used by higher-level modules
 * like integration.ts to access all knowledge graph functionality.
 */
export interface KnowledgeGraph {
  /** Entity resolver for person mentions */
  entityResolver: EntityResolver;
  /** Query engine for natural language queries */
  queryEngine: UnifiedQueryEngine;
  /** Capture knowledge from conversation turns */
  captureTurn: typeof captureTurn;
  /** Execute natural language queries */
  executeQuery: typeof executeNaturalQuery;
  /** Check if knowledge graph is ready */
  isReady: () => boolean;
}

let knowledgeGraphInstance: KnowledgeGraph | null = null;

/**
 * Get the knowledge graph singleton
 */
export function getKnowledgeGraph(): KnowledgeGraph {
  if (!knowledgeGraphInstance) {
    // Lazy import to avoid circular dependencies
    const { getEntityResolver: getResolver } = require('../entity-store/entity-resolver.js');
    const { getUnifiedQueryEngine: getEngine } = require('./services/natural-language-query.js');

    knowledgeGraphInstance = {
      entityResolver: getResolver(),
      queryEngine: getEngine(),
      captureTurn,
      executeQuery: executeNaturalQuery,
      isReady: () => isKnowledgeCaptureReady(),
    };
  }
  return knowledgeGraphInstance;
}
