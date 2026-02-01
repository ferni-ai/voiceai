/**
 * Spanner Adapter for Unified Memory Store
 *
 * Provides L3 long-term memory storage with graph traversal capabilities.
 * Handles entity relationships, facts, and complex pattern queries.
 *
 * This adapter complements the FirestoreAdapter (L2) by providing:
 * - Graph traversal for relationship networks
 * - Multi-hop relationship queries
 * - Entity context with facts
 * - Pattern-based memory discovery
 *
 * @module memory/unified-store/adapters/spanner-adapter
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  StoredMemory,
  ScoredMemory,
  StoreHealth,
  MemoryType,
} from '../types.js';
import {
  initializeSpanner,
  isSpannerReady,
  closeSpanner,
  upsertEntity,
  insertFact,
  insertRelationship,
  getEntitiesByUser,
  getEntityByName,
  getMemoryThreadsByUser,
  getMemoryAnchorsByUser,
  type GraphEntity,
  type GraphFact,
} from '../../spanner-graph/index.js';
import {
  getEntityWithFacts,
  getEntityRelationships,
  getExtendedNetwork,
  getEntityContext,
  type EntityContext,
} from '../../spanner-graph/queries.js';
import type { RelationshipResult } from '../../spanner-graph/schema.js';

const log = createLogger({ module: 'SpannerAdapter' });

// ============================================================================
// TYPES
// ============================================================================

export interface SpannerAdapterConfig {
  /** Whether to use Spanner for writes (default: true when available) */
  enableWrites?: boolean;
  /** Whether to use graph queries (default: true when available) */
  enableGraphQueries?: boolean;
  /** Max hops for relationship traversal (default: 2) */
  maxHops?: number;
}

export interface GraphQuery {
  /** Entity name to query */
  entityName?: string;
  /** Entity type filter */
  entityType?: string;
  /** Include related entities */
  includeRelationships?: boolean;
  /** Include facts */
  includeFacts?: boolean;
  /** Max results */
  limit?: number;
}

export interface GraphMemoryResult {
  /** Entities found */
  entities: GraphEntity[];
  /** Entity contexts with facts and relationships */
  contexts: EntityContext[];
  /** Relationship results */
  relationships: RelationshipResult[];
}

// ============================================================================
// SPANNER ADAPTER
// ============================================================================

/**
 * Spanner adapter for the unified memory store
 *
 * Provides L3 long-term memory storage with graph capabilities.
 * Gracefully degrades when Spanner is unavailable.
 */
export class SpannerAdapter {
  readonly name = 'spanner';

  private config: SpannerAdapterConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Metrics
  private successCount = 0;
  private errorCount = 0;
  private lastError: string | undefined;
  private lastSuccess: Date | undefined;
  private avgLatencyMs = 0;
  private latencyCount = 0;

  constructor(config?: SpannerAdapterConfig) {
    this.config = {
      enableWrites: config?.enableWrites ?? true,
      enableGraphQueries: config?.enableGraphQueries ?? true,
      maxHops: config?.maxHops ?? 2,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      const ready = await initializeSpanner();
      this.initialized = true;

      if (ready) {
        log.info('Spanner adapter initialized (graph queries enabled)');
      } else {
        log.info('Spanner adapter initialized (using fallback mode)');
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Spanner initialization failed, using fallback mode');
      this.initialized = true; // Mark as initialized but in fallback mode
    }
  }

  async shutdown(): Promise<void> {
    await closeSpanner();
    this.initialized = false;
    log.debug('Spanner adapter shut down');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<StoreHealth> {
    const ready = isSpannerReady();
    const total = this.successCount + this.errorCount;

    return {
      healthy: ready,
      name: this.name,
      initialized: this.initialized,
      latencyMs: this.avgLatencyMs,
      errorRate: total > 0 ? this.errorCount / total : 0,
      lastError: this.lastError,
      lastSuccess: this.lastSuccess,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store an entity in Spanner
   */
  async storeEntity(entity: Omit<GraphEntity, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (!this.config.enableWrites || !isSpannerReady()) {
      log.debug('Spanner writes disabled or not ready, skipping entity store');
      return;
    }

    const start = Date.now();
    try {
      await upsertEntity(entity);
      this.recordSuccess(start);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Store a fact in Spanner
   */
  async storeFact(fact: Omit<GraphFact, 'createdAt'>): Promise<void> {
    if (!this.config.enableWrites || !isSpannerReady()) {
      log.debug('Spanner writes disabled or not ready, skipping fact store');
      return;
    }

    const start = Date.now();
    try {
      await insertFact(fact);
      this.recordSuccess(start);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Store a relationship in Spanner
   */
  async storeRelationship(relationship: {
    relationshipId: string;
    userId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    strength: number;
    bidirectional?: boolean;
  }): Promise<void> {
    if (!this.config.enableWrites || !isSpannerReady()) {
      log.debug('Spanner writes disabled or not ready, skipping relationship store');
      return;
    }

    const start = Date.now();
    try {
      await insertRelationship({
        ...relationship,
        bidirectional: relationship.bidirectional ?? false,
      });
      this.recordSuccess(start);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get entities for a user
   */
  async getEntities(
    userId: string,
    options?: { limit?: number; entityType?: string }
  ): Promise<GraphEntity[]> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return [];
    }

    const start = Date.now();
    try {
      const entities = await getEntitiesByUser(userId, options);
      this.recordSuccess(start);
      return entities;
    } catch (error) {
      this.recordError(error);
      return [];
    }
  }

  /**
   * Get entity by name
   */
  async getEntity(userId: string, name: string): Promise<GraphEntity | null> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return null;
    }

    const start = Date.now();
    try {
      const entity = await getEntityByName(userId, name);
      this.recordSuccess(start);
      return entity;
    } catch (error) {
      this.recordError(error);
      return null;
    }
  }

  /**
   * Get entity with all facts (graph traversal)
   */
  async getEntityWithFacts(
    userId: string,
    entityName: string
  ): Promise<EntityContext['entity'] | null> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return null;
    }

    const start = Date.now();
    try {
      const result = await getEntityWithFacts(userId, entityName);
      this.recordSuccess(start);
      return result;
    } catch (error) {
      this.recordError(error);
      return null;
    }
  }

  /**
   * Get comprehensive entity context (entity + facts + relationships)
   * This is the main "Better Than Human" query for entity recall
   */
  async getEntityContext(userId: string, entityName: string): Promise<EntityContext | null> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return null;
    }

    const start = Date.now();
    try {
      const context = await getEntityContext(userId, entityName);
      this.recordSuccess(start);
      return context;
    } catch (error) {
      this.recordError(error);
      return null;
    }
  }

  /**
   * Get entity relationships (1-hop)
   */
  async getEntityRelationships(
    userId: string,
    entityName: string
  ): Promise<RelationshipResult[]> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return [];
    }

    const start = Date.now();
    try {
      const relationships = await getEntityRelationships(userId, entityName);
      this.recordSuccess(start);
      return relationships;
    } catch (error) {
      this.recordError(error);
      return [];
    }
  }

  /**
   * Get extended network (multi-hop relationships)
   * Use for "friends of friends" or complex relationship discovery
   */
  async getExtendedNetwork(
    userId: string,
    entityName: string,
    maxHops?: number
  ): Promise<{ path: GraphEntity[]; depth: number }[]> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return [];
    }

    const start = Date.now();
    try {
      const network = await getExtendedNetwork(
        userId,
        entityName,
        maxHops ?? this.config.maxHops
      );
      this.recordSuccess(start);
      return network;
    } catch (error) {
      this.recordError(error);
      return [];
    }
  }

  /**
   * Get memory threads for a user
   */
  async getMemoryThreads(
    userId: string,
    options?: { limit?: number; minConfidence?: number }
  ): Promise<ReturnType<typeof getMemoryThreadsByUser>> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return [];
    }

    const start = Date.now();
    try {
      const threads = await getMemoryThreadsByUser(userId, options);
      this.recordSuccess(start);
      return threads;
    } catch (error) {
      this.recordError(error);
      return [];
    }
  }

  /**
   * Get memory anchors (significant memories) for a user
   */
  async getMemoryAnchors(
    userId: string,
    options?: { limit?: number; minSignificance?: number }
  ): Promise<ReturnType<typeof getMemoryAnchorsByUser>> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return [];
    }

    const start = Date.now();
    try {
      const anchors = await getMemoryAnchorsByUser(userId, options);
      this.recordSuccess(start);
      return anchors;
    } catch (error) {
      this.recordError(error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED STORE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert StoredMemory to graph entities/facts
   * This is used when memories are stored in Firestore and need to be synced to Spanner
   */
  async syncMemoryToGraph(memory: StoredMemory): Promise<void> {
    if (!this.config.enableWrites || !isSpannerReady()) {
      return;
    }

    const start = Date.now();
    try {
      // Extract entities from peopleMentioned
      for (const person of memory.peopleMentioned || []) {
        await this.storeEntity({
          entityId: `entity-${memory.userId}-${person.toLowerCase().replace(/\s+/g, '-')}`,
          userId: memory.userId,
          name: person,
          entityType: 'person',
          attributes: {},
          importance: 0.5 + (memory.emotionalWeight || 0) * 0.5,
          firstMentioned: memory.createdAt,
          lastMentioned: memory.updatedAt || memory.createdAt,
          mentionCount: 1,
        });
      }

      // Store as fact if it contains structured information
      if (memory.type === 'fact' || memory.type === 'insight') {
        await this.storeFact({
          factId: `fact-${memory.id}`,
          userId: memory.userId,
          factType: memory.type === 'fact' ? 'attribute' : 'state',
          key: memory.topics?.[0] || 'general',
          value: memory.content,
          domain: 'general',
          confidence: memory.strength || 0.7,
          extractedAt: memory.createdAt,
        });
      }

      this.recordSuccess(start);
    } catch (error) {
      this.recordError(error);
      // Don't throw - this is a background sync operation
    }
  }

  /**
   * Enhance recall results with graph context
   * Call this after Firestore recall to add relationship context
   */
  async enhanceRecallWithGraph(
    userId: string,
    memories: ScoredMemory[]
  ): Promise<ScoredMemory[]> {
    if (!this.config.enableGraphQueries || !isSpannerReady()) {
      return memories;
    }

    const start = Date.now();
    try {
      // Extract unique people mentioned across all memories
      const peopleMentioned = new Set<string>();
      for (const { memory } of memories) {
        for (const person of memory.peopleMentioned || []) {
          peopleMentioned.add(person);
        }
      }

      // Get entity contexts for mentioned people
      const entityContexts = new Map<string, EntityContext>();
      for (const person of peopleMentioned) {
        const context = await getEntityContext(userId, person);
        if (context) {
          entityContexts.set(person.toLowerCase(), context);
        }
      }

      // Enhance memories with graph context
      const enhanced: ScoredMemory[] = memories.map((scoredMemory) => {
        const { memory, score, scoreBreakdown, reason, triggerType, graphPath } = scoredMemory;
        const graphContext: string[] = [];

        for (const person of memory.peopleMentioned || []) {
          const context = entityContexts.get(person.toLowerCase());
          if (context) {
            graphContext.push(context.summary);
          }
        }

        return {
          memory: {
            ...memory,
            metadata: {
              ...memory.metadata,
              graphContext: graphContext.length > 0 ? graphContext.join('\n\n') : undefined,
              graphEnhanced: graphContext.length > 0,
            },
          },
          score,
          scoreBreakdown,
          reason,
          triggerType,
          graphPath,
        };
      });

      this.recordSuccess(start);
      return enhanced;
    } catch (error) {
      this.recordError(error);
      return memories; // Return original memories on error
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  private recordSuccess(startTime: number): void {
    const latency = Date.now() - startTime;
    this.successCount++;
    this.lastSuccess = new Date();

    // Update running average
    this.latencyCount++;
    this.avgLatencyMs = this.avgLatencyMs + (latency - this.avgLatencyMs) / this.latencyCount;
  }

  private recordError(error: unknown): void {
    this.errorCount++;
    this.lastError = String(error);
    log.warn({ error: this.lastError }, 'Spanner operation failed');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SpannerAdapter | null = null;

/**
 * Get the SpannerAdapter singleton
 */
export function getSpannerAdapter(config?: SpannerAdapterConfig): SpannerAdapter {
  if (!instance) {
    instance = new SpannerAdapter(config);
  }
  return instance;
}

/**
 * Reset the SpannerAdapter singleton (for testing)
 */
export function resetSpannerAdapter(): void {
  instance = null;
}
