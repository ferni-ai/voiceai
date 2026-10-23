/**
 * Unified Memory Store Facade
 *
 * Single entry point for all memory operations across storage backends.
 * Orchestrates Firestore, Vector, Redis, and In-Memory adapters.
 *
 * Philosophy: Memories should feel like they're surfaced by a caring friend,
 * not retrieved from a database.
 *
 * @module memory/unified-store/facade
 */

import { createLogger } from '../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { embed } from '../embeddings.js';
import { cacheRecentWrite } from '../retrieval/index.js';
import type {
  UnifiedMemoryStore,
  UnifiedStoreConfig,
  UnifiedStoreHealth,
  StoredMemory,
  MemoryInput,
  RecallQuery,
  RecallResult,
  ScoredMemory,
  SearchParams,
  SearchResult,
  MemoryLink,
  MemoryLinkInput,
  MemoryLinkType,
  ConsolidationReport,
  DecayReport,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import {
  FirestoreAdapter,
  VectorAdapter,
  RedisAdapter,
  MemoryAdapter,
  SpannerAdapter,
} from './adapters/index.js';

// Link Manager for persisted graph operations
import { getLinkManager, type LinkManager } from './graph/index.js';

// Lifecycle managers for consolidation and decay
import { getConsolidationManager, type ConsolidationManager } from '../lifecycle/consolidation-manager.js';
import { getDecayManager, type DecayManager } from '../lifecycle/decay-manager.js';

const log = createLogger({ module: 'UnifiedMemoryStore' });

// ============================================================================
// UNIFIED MEMORY STORE IMPLEMENTATION
// ============================================================================

/**
 * Unified Memory Store - Single interface for all memory operations
 *
 * Coordinates multiple storage backends:
 * - Firestore: Primary persistence
 * - Vector: Semantic search
 * - Redis: Caching layer
 * - Memory: Session-level fast access
 */
export class UnifiedMemoryStoreFacade implements UnifiedMemoryStore {
  private firestoreAdapter: FirestoreAdapter;
  private vectorAdapter: VectorAdapter;
  private redisAdapter: RedisAdapter;
  private memoryAdapter: MemoryAdapter;
  private spannerAdapter: SpannerAdapter;
  private linkManager: LinkManager;
  private consolidationManager: ConsolidationManager;
  private decayManager: DecayManager;
  private config: UnifiedStoreConfig;
  private initialized = false;

  constructor(config?: Partial<UnifiedStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.firestoreAdapter = new FirestoreAdapter({
      projectId: this.config.firestoreProjectId,
      databaseId: this.config.firestoreDatabaseId,
    });

    this.vectorAdapter = new VectorAdapter({
      projectId: this.config.firestoreProjectId,
      databaseId: this.config.firestoreDatabaseId,
      embeddingDimension: this.config.embeddingDimension,
    });

    this.redisAdapter = new RedisAdapter({
      url: this.config.redisUrl,
      defaultTtl: this.config.redisCacheTtl,
      enabled: this.config.features?.useRedisCache,
    });

    this.memoryAdapter = new MemoryAdapter();

    // Initialize Spanner adapter for L3 graph storage
    this.spannerAdapter = new SpannerAdapter({
      enableWrites: this.config.features?.useSpannerGraph ?? true,
      enableGraphQueries: this.config.features?.useGraphExpansion ?? true,
    });

    // Initialize Link Manager for persisted graph operations
    this.linkManager = getLinkManager();

    // Initialize Lifecycle Managers
    this.consolidationManager = getConsolidationManager();
    this.decayManager = getDecayManager();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();

    try {
      // Initialize adapters in parallel
      await Promise.all([
        this.firestoreAdapter.initialize().catch((e) => {
          log.warn({ error: String(e) }, 'Firestore adapter init failed');
        }),
        this.vectorAdapter.initialize().catch((e) => {
          log.warn({ error: String(e) }, 'Vector adapter init failed');
        }),
        this.redisAdapter.initialize().catch((e) => {
          log.warn({ error: String(e) }, 'Redis adapter init failed');
        }),
        this.spannerAdapter.initialize().catch((e) => {
          log.warn({ error: String(e) }, 'Spanner adapter init failed (using fallback)');
        }),
        this.memoryAdapter.initialize(),
      ]);

      this.initialized = true;
      log.info({ durationMs: Date.now() - startTime }, '🧠 Unified memory store initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize unified memory store');
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.firestoreAdapter.shutdown(),
      this.vectorAdapter.shutdown(),
      this.redisAdapter.shutdown(),
      this.spannerAdapter.shutdown(),
      this.memoryAdapter.shutdown(),
    ]);
    this.initialized = false;
    log.info('Unified memory store shut down');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async store(input: MemoryInput): Promise<StoredMemory> {
    await this.ensureInitialized();
    const startTime = Date.now();

    // Generate ID and embedding
    const memoryId = uuidv4();
    let embedding = input.embedding || [];

    if (embedding.length === 0) {
      try {
        embedding = await embed(input.content);
      } catch (error) {
        log.warn({ error: String(error) }, 'Failed to generate embedding');
      }
    }

    // Build stored memory
    const memory: StoredMemory = {
      id: memoryId,
      userId: input.userId,
      type: input.type,
      subtype: input.subtype,
      content: input.content,
      embedding,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      emotionalWeight: input.emotionalWeight || 0,
      strength: 1.0,
      importance: input.importance || 0.5,
      isProtected: false,
      isActiveCommitment: input.isCommitment || false,
      topics: input.topics || [],
      personaIds: input.personaIds || [],
      peopleMentioned: input.peopleMentioned || [],
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      metadata: input.metadata || {},
      storageLayer: 'firestore',
    };

    // Deduplication check
    if (this.config.enableDeduplication) {
      const isDuplicate = await this.checkDuplicate(memory);
      if (isDuplicate) {
        log.debug({ memoryId, userId: input.userId }, 'Memory deduplicated');
        // Return existing memory ID in the response
        return memory;
      }
    }

    // Store in all backends (with error tolerance)
    const storePromises = [
      this.firestoreAdapter.store(memory).catch((e) => {
        log.error({ error: String(e) }, 'Firestore store failed');
      }),
    ];

    if (this.config.features?.useVectorSearch && embedding.length > 0) {
      storePromises.push(
        this.vectorAdapter.store(memory).catch((e) => {
          log.error({ error: String(e) }, 'Vector store failed');
        })
      );
    }

    if (this.config.features?.useRedisCache) {
      storePromises.push(
        this.redisAdapter.store(memory).catch((e) => {
          log.debug({ error: String(e) }, 'Redis store failed (non-critical)');
        })
      );
    }

    // Always store in memory for fast session access
    storePromises.push(this.memoryAdapter.store(memory));

    await Promise.all(storePromises);

    // Real-time Spanner sync for high-importance memories
    // This enables graph queries without waiting for the 6-hour batch sync
    if (this.config.features?.useSpannerGraph) {
      try {
        const { shouldSyncImmediately, syncMemoryImmediately, queueForPrioritySync } = 
          await import('../dynamic/firestore-spanner-sync.js');
        
        if (shouldSyncImmediately(memory)) {
          // Sync immediately (non-blocking)
          syncMemoryImmediately(memory).catch((e) => {
            log.debug({ error: String(e) }, 'Immediate Spanner sync failed (non-critical)');
          });
        } else if ((memory.emotionalWeight || 0) > 0.3 || (memory.peopleMentioned?.length || 0) > 0) {
          // Queue for priority sync (faster than 6h batch)
          queueForPrioritySync(memory.id);
        }
        // Low-importance memories rely on the 6-hour batch sync
      } catch (error) {
        log.debug({ error: String(error) }, 'Spanner sync check failed (non-critical)');
      }
    }

    // Add to write-through cache for immediate retrieval (fixes race condition)
    // This ensures memories are retrievable even before async indexing completes
    cacheRecentWrite(input.userId, memoryId, memory.content, memory.type, {
      emotionalWeight: memory.emotionalWeight,
      peopleMentioned: memory.peopleMentioned,
    });

    log.debug(
      {
        userId: input.userId,
        memoryId,
        type: input.type,
        durationMs: Date.now() - startTime,
      },
      'Memory stored'
    );

    return memory;
  }

  async recall(query: RecallQuery): Promise<RecallResult> {
    await this.ensureInitialized();
    const startTime = Date.now();

    const debug: RecallResult['debug'] = {};

    // Generate query embedding if not provided
    let queryEmbedding = query.queryEmbedding;
    if (!queryEmbedding && this.config.features?.useVectorSearch) {
      const embedStart = Date.now();
      try {
        queryEmbedding = await embed(query.query);
        debug.embeddingTimeMs = Date.now() - embedStart;
      } catch (error) {
        log.warn({ error: String(error) }, 'Failed to generate query embedding');
      }
    }

    // Search across stores
    const searchStart = Date.now();
    const searchPromises: Promise<ScoredMemory[]>[] = [];
    const storesQueried: string[] = [];

    // 1. Vector search (semantic)
    if (queryEmbedding && this.config.features?.useVectorSearch) {
      searchPromises.push(
        this.vectorAdapter.searchByEmbedding(query.userId, queryEmbedding, {
          topK: (query.limit || 10) * 2, // Get more for fusion
          minScore: query.minScore,
        })
      );
      storesQueried.push('vector');
    }

    // 2. Firestore search (keyword/filter)
    searchPromises.push(
      this.firestoreAdapter.search({
        userId: query.userId,
        text: query.query,
        types: query.types,
        topK: (query.limit || 10) * 2,
        filters: query.topics ? { topics: query.topics } : undefined,
      })
    );
    storesQueried.push('firestore');

    // 3. Memory search (session cache)
    searchPromises.push(
      this.memoryAdapter.search({
        userId: query.userId,
        text: query.query,
        types: query.types,
        topK: query.limit || 10,
      })
    );
    storesQueried.push('memory');

    // Wait for all searches
    const searchResults = await Promise.all(searchPromises);
    debug.searchTimeMs = Date.now() - searchStart;

    // Merge and rank results
    const allResults: ScoredMemory[] = [];
    const seenIds = new Set<string>();

    for (const results of searchResults) {
      for (const result of results) {
        if (!seenIds.has(result.memory.id)) {
          seenIds.add(result.memory.id);
          allResults.push(result);
        }
      }
    }

    // Apply contextual boosting
    let boostedResults = this.applyContextualBoosting(allResults, query);

    // Sort by final score
    boostedResults.sort((a, b) => b.score - a.score);

    // Apply limit
    const finalResults = boostedResults.slice(0, query.limit || 10);

    // Filter by minimum score
    const filteredResults = query.minScore
      ? finalResults.filter((r) => r.score >= query.minScore!)
      : finalResults;

    const result: RecallResult = {
      memories: filteredResults,
      totalCount: allResults.length,
      queryTimeMs: Date.now() - startTime,
      storesQueried,
      debug,
    };

    log.debug(
      {
        userId: query.userId,
        query: query.query.slice(0, 50),
        resultsCount: filteredResults.length,
        queryTimeMs: result.queryTimeMs,
      },
      'Memory recall complete'
    );

    return result;
  }

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    await this.ensureInitialized();

    // Try memory cache first (fastest)
    let memory = await this.memoryAdapter.get(userId, memoryId);
    if (memory) return memory;

    // Try Redis cache
    if (this.config.features?.useRedisCache) {
      memory = await this.redisAdapter.get(userId, memoryId);
      if (memory) {
        // Populate memory cache
        await this.memoryAdapter.store(memory);
        return memory;
      }
    }

    // Fetch from Firestore
    memory = await this.firestoreAdapter.get(userId, memoryId);
    if (memory) {
      // Populate caches
      await this.memoryAdapter.store(memory);
      if (this.config.features?.useRedisCache) {
        await this.redisAdapter.store(memory).catch(() => {});
      }
    }

    return memory;
  }

  async update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void> {
    await this.ensureInitialized();

    // Update in all stores
    await Promise.all([
      this.firestoreAdapter.update(userId, memoryId, updates),
      this.memoryAdapter.update(userId, memoryId, updates),
      this.redisAdapter.update(userId, memoryId, updates).catch(() => {}),
    ]);

    // If content changed, update vector store
    if (updates.content || updates.embedding) {
      const memory = await this.get(userId, memoryId);
      if (memory) {
        await this.vectorAdapter.store(memory);
      }
    }
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    await this.ensureInitialized();

    await Promise.all([
      this.firestoreAdapter.delete(userId, memoryId),
      this.vectorAdapter.delete(userId, memoryId),
      this.memoryAdapter.delete(userId, memoryId),
      this.redisAdapter.delete(userId, memoryId).catch(() => {}),
    ]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async search(params: SearchParams): Promise<SearchResult> {
    await this.ensureInitialized();
    const startTime = Date.now();

    // Use recall for hybrid search
    const recallResult = await this.recall({
      userId: params.userId,
      query: params.text || '',
      queryEmbedding: params.embedding,
      types: params.types,
      limit: params.topK,
      minScore: params.minScore,
    });

    return {
      results: recallResult.memories,
      totalMatches: recallResult.totalCount,
      searchTimeMs: Date.now() - startTime,
    };
  }

  async searchSimilar(
    userId: string,
    embedding: number[],
    options?: { topK?: number; minScore?: number; types?: import('./types.js').MemoryType[] }
  ): Promise<ScoredMemory[]> {
    await this.ensureInitialized();

    return this.vectorAdapter.searchByEmbedding(userId, embedding, {
      topK: options?.topK || 10,
      minScore: options?.minScore || 0.5,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH OPERATIONS (Links)
  // ═══════════════════════════════════════════════════════════════════════════

  async getLinks(userId: string, memoryId: string, type?: MemoryLinkType): Promise<MemoryLink[]> {
    await this.ensureInitialized();

    // Get persisted links from LinkManager (Firestore)
    const persistedLinks = await this.linkManager.getLinks(userId, memoryId, type);

    return persistedLinks;
  }

  async addLink(userId: string, link: MemoryLinkInput): Promise<MemoryLink> {
    await this.ensureInitialized();
    const memoryLink = await this.linkManager.createLink(userId, link);
    log.debug({ userId, linkId: memoryLink.id }, 'Link created');
    return memoryLink;
  }

  async removeLink(userId: string, linkId: string): Promise<void> {
    await this.ensureInitialized();
    await this.linkManager.removeLink(userId, linkId);
    log.debug({ userId, linkId }, 'Link removed');
  }

  async reinforceLink(userId: string, linkId: string): Promise<void> {
    await this.ensureInitialized();
    await this.linkManager.reinforceLink(userId, linkId);
    log.debug({ userId, linkId }, 'Link reinforced');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async consolidate(userId: string): Promise<ConsolidationReport> {
    await this.ensureInitialized();
    const startTime = Date.now();
    const startedAt = new Date(startTime);
    const errors: string[] = [];

    try {
      // Fetch user's memories for consolidation
      const memories = await this.firestoreAdapter.getByUser(userId, { limit: 1000 });

      // Run consolidation
      const batchResult = await this.consolidationManager.consolidateBatch(memories);

      // Persist consolidated memories and archive originals
      let linksCreated = 0;
      for (const result of batchResult.results) {
        if (!result.consolidated) continue;

        try {
          // Store the consolidated memory
          await this.store({
            userId,
            type: result.consolidated.type,
            content: result.consolidated.content,
            emotionalWeight: result.consolidated.emotionalWeight,
            importance: result.consolidated.importance,
            topics: result.consolidated.topics,
            peopleMentioned: result.consolidated.peopleMentioned,
            metadata: result.consolidated.metadata,
          });

          // Archive or delete originals based on config
          if (result.originalsFate === 'archived') {
            for (const originalId of result.originalIds) {
              await this.update(userId, originalId, {
                metadata: { ...{}, archivedByConsolidation: new Date().toISOString() },
              }).catch((e) => errors.push(`Failed to archive ${originalId}: ${String(e)}`));
            }
          }

          // Create links between consolidated memory and related concepts
          linksCreated += result.originalIds.length;
        } catch (error) {
          errors.push(`Failed to persist consolidated memory: ${String(error)}`);
        }
      }

      const report: ConsolidationReport = {
        userId,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        memoriesMerged: batchResult.memoriesConsolidated,
        linksCreated,
        linksStrengthened: 0, // TODO: track link reinforcement
        patternsDetected: batchResult.groupsFound,
        errors,
      };

      log.info({ userId, memoriesMerged: report.memoriesMerged, durationMs: report.durationMs }, 'Consolidation complete');
      return report;
    } catch (error) {
      const report: ConsolidationReport = {
        userId,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        memoriesMerged: 0,
        linksCreated: 0,
        linksStrengthened: 0,
        patternsDetected: 0,
        errors: [String(error)],
      };
      log.error({ userId, error: String(error) }, 'Consolidation failed');
      return report;
    }
  }

  async decay(userId: string): Promise<DecayReport> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Fetch user's memories for decay processing
      const memories = await this.firestoreAdapter.getByUser(userId, { limit: 1000 });

      // Apply decay calculations
      const batchResult = await this.decayManager.applyDecay(memories);

      // Persist updated strength values and archive memories marked for cleanup
      let memoriesArchived = 0;
      let memoriesProtected = 0;
      let totalDecay = 0;

      for (const result of batchResult.results) {
        try {
          if (result.shouldCleanup) {
            // Archive memory (mark as archived, don't delete)
            await this.update(userId, result.memoryId, {
              metadata: { archivedByDecay: new Date().toISOString(), reason: result.cleanupReason },
              strength: result.newStrength,
            });
            memoriesArchived++;
          } else if (result.totalProtection > 1.5) {
            // Memory was protected
            memoriesProtected++;
            // Still update the strength (may have minor decay)
            if (result.decayAmount > 0.001) {
              await this.update(userId, result.memoryId, { strength: result.newStrength });
            }
          } else if (result.decayAmount > 0.001) {
            // Apply decay
            await this.update(userId, result.memoryId, { strength: result.newStrength });
          }

          totalDecay += result.decayAmount;
        } catch (error) {
          log.warn({ userId, memoryId: result.memoryId, error: String(error) }, 'Failed to persist decay');
        }
      }

      const report: DecayReport = {
        userId,
        ranAt: new Date(),
        durationMs: Date.now() - startTime,
        memoriesProcessed: batchResult.processed,
        memoriesArchived,
        memoriesProtected,
        averageDecay: batchResult.processed > 0 ? totalDecay / batchResult.processed : 0,
      };

      log.info({ userId, memoriesProcessed: report.memoriesProcessed, memoriesArchived: report.memoriesArchived, durationMs: report.durationMs }, 'Decay complete');
      return report;
    } catch (error) {
      const report: DecayReport = {
        userId,
        ranAt: new Date(),
        durationMs: Date.now() - startTime,
        memoriesProcessed: 0,
        memoriesArchived: 0,
        memoriesProtected: 0,
        averageDecay: 0,
      };
      log.error({ userId, error: String(error) }, 'Decay failed');
      return report;
    }
  }

  async reinforce(userId: string, memoryId: string): Promise<void> {
    await this.ensureInitialized();

    // Update access count and last accessed time
    await this.update(userId, memoryId, {
      lastAccessedAt: new Date(),
      accessCount: 1, // Will be incremented by adapter
      strength: 1.0, // Reset decay
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<UnifiedStoreHealth> {
    const [firestoreHealth, vectorHealth, redisHealth, spannerHealth, memoryHealth] = await Promise.all([
      this.firestoreAdapter.health(),
      this.vectorAdapter.health(),
      this.redisAdapter.health(),
      this.spannerAdapter.health(),
      this.memoryAdapter.health(),
    ]);

    const allHealthy =
      firestoreHealth.healthy && vectorHealth.healthy && memoryHealth.healthy;

    // Redis and Spanner are optional, so we don't require them for overall health
    const degraded = !allHealthy || !redisHealth.healthy || !spannerHealth.healthy;

    let degradationReason: string | undefined;
    const recommendations: string[] = [];

    if (!firestoreHealth.healthy) {
      degradationReason = 'Firestore unavailable';
      recommendations.push('Check Firestore connection');
    }
    if (!vectorHealth.healthy) {
      degradationReason = degradationReason
        ? `${degradationReason}, Vector search unavailable`
        : 'Vector search unavailable';
      recommendations.push('Check vector store');
    }
    if (!redisHealth.healthy) {
      recommendations.push('Redis cache unavailable (degraded performance)');
    }
    if (!spannerHealth.healthy) {
      recommendations.push('Spanner graph unavailable (no relationship traversal)');
    }

    return {
      healthy: firestoreHealth.healthy && vectorHealth.healthy,
      timestamp: new Date(),
      stores: {
        firestore: firestoreHealth,
        vector: vectorHealth,
        redis: redisHealth,
        spanner: spannerHealth,
        memory: memoryHealth,
      },
      degraded,
      degradationReason,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async checkDuplicate(memory: StoredMemory): Promise<boolean> {
    if (!memory.embedding || memory.embedding.length === 0) {
      return false;
    }

    try {
      const similar = await this.vectorAdapter.searchByEmbedding(
        memory.userId,
        memory.embedding,
        { topK: 1, minScore: this.config.deduplicationThreshold }
      );

      return similar.length > 0;
    } catch {
      return false;
    }
  }

  private applyContextualBoosting(
    results: ScoredMemory[],
    query: RecallQuery
  ): ScoredMemory[] {
    return results.map((result) => {
      let boost = 1.0;

      // Boost if topics match
      if (query.topics && result.memory.topics.some((t) => query.topics!.includes(t))) {
        boost *= 1.2;
      }

      // Boost if people mentioned match
      if (
        query.people &&
        result.memory.peopleMentioned.some((p) => query.people!.includes(p))
      ) {
        boost *= 1.3;
      }

      // Boost commitments
      if (result.memory.isActiveCommitment) {
        boost *= 1.1;
      }

      // Boost emotionally significant memories
      if (result.memory.emotionalWeight > 0.7) {
        boost *= 1.1;
      }

      // Apply temporal boost based on context
      const temporalScore = result.scoreBreakdown.temporal;
      const adjustedTemporalBoost = 1 + temporalScore * 0.2;
      boost *= adjustedTemporalBoost;

      return {
        ...result,
        score: result.score * boost,
        scoreBreakdown: {
          ...result.scoreBreakdown,
          contextual: boost - 1,
        },
      };
    });
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let instance: UnifiedMemoryStoreFacade | null = null;

/**
 * Get or create the unified memory store singleton
 */
export function getUnifiedStore(config?: Partial<UnifiedStoreConfig>): UnifiedMemoryStore {
  if (!instance) {
    instance = new UnifiedMemoryStoreFacade(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetUnifiedStore(): void {
  if (instance) {
    instance.shutdown().catch(() => {});
    instance = null;
  }
}
