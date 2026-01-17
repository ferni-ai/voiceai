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
import type { Entity } from './types.js';

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

  // Stub methods for backward compatibility with integration.ts
  /** Resolve a mention to an entity (stub - delegates to entityResolver) */
  resolveMention: (userId: string, mention: unknown, context?: unknown) => Promise<Entity>;
  /** Add a fact about an entity (stub) */
  addFact: (userId: string, entityId: string, fact: unknown, context?: unknown) => Promise<void>;
  /** Record a mention of an entity (stub) */
  recordMention: (userId: string, entityId: string, mention: unknown, context?: unknown) => Promise<void>;
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

    const resolver = getResolver();

    knowledgeGraphInstance = {
      entityResolver: resolver,
      queryEngine: getEngine(),
      captureTurn,
      executeQuery: executeNaturalQuery,
      isReady: () => isKnowledgeCaptureReady(),

      // Full implementations (not stubs!)
      resolveMention: async (userId: string, mention: unknown, context?: unknown): Promise<Entity> => {
        // Use the full entity resolver implementation
        if (resolver && typeof resolver.resolveMention === 'function') {
          const resolved = await resolver.resolveMention(userId, mention);
          if (resolved) {
            return resolved as Entity;
          }
        }

        // Fallback: Use resolvePerson for person mentions
        const input = mention as { name?: string; text?: string; relationship?: string };
        const result = await resolver.resolvePerson(userId, {
          name: input.name || input.text,
          relationship: input.relationship,
          context: typeof context === 'object' && context !== null 
            ? JSON.stringify(context) 
            : undefined,
        });

        return result.entity as Entity;
      },

      addFact: async (userId: string, entityId: string, fact: unknown, context?: unknown) => {
        // Full implementation: Store fact as part of a mention
        const { createMention } = await import('../entity-store/storage.js');
        
        const factObj = fact as { 
          type?: string; 
          key?: string; 
          value?: string; 
          content?: string;
          confidence?: number;
        };

        // Create a mention with the fact attached
        await createMention(userId, {
          entityId,
          userId,
          timestamp: new Date(),
          sessionId: (context as { sessionId?: string })?.sessionId || 'unknown',
          personaId: (context as { personaId?: string })?.personaId || 'ferni',
          transcript: factObj.content || factObj.value || '',
          topics: [],
          sentiment: 0,
          emotionalIntensity: 0,
          mentionType: 'reference',
          facts: [{
            type: (factObj.type as 'attribute' | 'event' | 'relationship' | 'state') || 'attribute',
            key: factObj.key || 'fact',
            value: factObj.value || factObj.content || '',
            confidence: factObj.confidence ?? 0.8,
          }],
        });

        // Also update the entity's lastSeen
        const { updateEntity } = await import('../entity-store/storage.js');
        await updateEntity(userId, entityId, {
          lastSeen: new Date(),
          updatedAt: new Date(),
        });
      },

      recordMention: async (userId: string, entityId: string, mention: unknown, context?: unknown) => {
        // Full implementation: Record the mention in storage
        const { createMention, updateEntity } = await import('../entity-store/storage.js');
        
        const mentionObj = mention as {
          text?: string;
          snippet?: string;
          context?: string;
          sessionId?: string;
          personaId?: string;
          emotionalWeight?: number;
          sentiment?: number;
        };

        const contextObj = context as {
          sessionId?: string;
          personaId?: string;
          turnNumber?: number;
          topics?: string[];
        } | undefined;

        // Create the mention record
        await createMention(userId, {
          entityId,
          userId,
          timestamp: new Date(),
          sessionId: mentionObj.sessionId || contextObj?.sessionId || 'unknown',
          personaId: mentionObj.personaId || contextObj?.personaId || 'ferni',
          transcript: mentionObj.text || mentionObj.snippet || mentionObj.context || '',
          topics: contextObj?.topics || [],
          sentiment: mentionObj.sentiment ?? 0,
          emotionalIntensity: Math.abs(mentionObj.sentiment ?? 0),
          mentionType: 'reference',
          facts: [],
        });

        // Update entity mention count and lastSeen
        const { getEntity } = await import('../entity-store/storage.js');
        const entity = await getEntity(userId, entityId);
        if (entity) {
          await updateEntity(userId, entityId, {
            lastSeen: new Date(),
            mentionCount: (entity.mentionCount || 0) + 1,
            updatedAt: new Date(),
          });
        }
      },
    };
  }
  return knowledgeGraphInstance;
}
