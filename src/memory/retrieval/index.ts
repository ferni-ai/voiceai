/**
 * Unified Memory Retrieval (Clean Architecture)
 *
 * Single entry point for all memory retrieval operations.
 * Combines semantic search, context retrieval, and memory surfacing.
 *
 * Architecture:
 * ```
 * Query
 *   │
 *   ▼
 * retrieveContext() ─────────────────┐
 *   │                                 │
 *   ├─→ Semantic Search (vectors)     │
 *   ├─→ Entity Store (graph)          │
 *   ├─→ STM Buffer (recent)           │
 *   └─→ Memory Graph (associations)   │
 *         │                           │
 *         ▼                           │
 *   Ranked & Merged Results           │
 *         │                           │
 *         ▼                           │
 *   Natural Explanations              │
 * ```
 *
 * @module memory/retrieval
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { RetrievalContext, RetrievedMemory } from '../interfaces/index.js';

const log = createLogger({ module: 'MemoryRetrieval' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Query options for memory retrieval
 */
export interface RetrievalOptions {
  /** Maximum number of results */
  topK?: number;
  /** Minimum relevance score (0-1) */
  minScore?: number;
  /** Include associative memories (spreading activation) */
  includeAssociative?: boolean;
  /** Include recent STM (short-term memory) */
  includeSTM?: boolean;
  /** Include entity relationships */
  includeRelationships?: boolean;
  /** Generate natural language explanations */
  generateExplanations?: boolean;
  /** Filter by memory types */
  types?: Array<'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event'>;
  /** Filter by persona */
  personaId?: string;
}

/**
 * Unified retrieval result
 */
export interface RetrievalResult {
  /** Retrieved memories */
  memories: RetrievedMemory[];
  /** Entity matches (from entity store) */
  entities: EntityMatch[];
  /** STM context (if included) */
  stmContext?: string;
  /** Query metadata */
  metadata: {
    query: string;
    totalResults: number;
    sources: string[];
    retrievalTimeMs: number;
  };
}

/**
 * Entity match from retrieval
 */
export interface EntityMatch {
  id: string;
  name: string;
  type: string;
  relevance: number;
  summary?: string;
  lastSeen?: Date;
}

// ============================================================================
// WRITE-THROUGH CACHE (fixes race condition: retrieval before indexing)
// ============================================================================

/**
 * Cache for recently written memories to fix the race condition where
 * retrieval happens before async indexing completes.
 *
 * Structure: userId -> Map<memoryId, {content, timestamp, score, type}>
 * TTL: 30 seconds (enough time for indexing to complete)
 */
const recentWritesCache = new Map<string, Map<string, RecentWrite>>();
const RECENT_WRITE_TTL_MS = 30 * 1000; // 30 seconds

interface RecentWrite {
  content: string;
  timestamp: number;
  type: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Add a memory to the write-through cache.
 * Call this when writing a memory to ensure it's immediately retrievable.
 */
export function cacheRecentWrite(
  userId: string,
  memoryId: string,
  content: string,
  type: string,
  metadata?: Record<string, unknown>
): void {
  if (!recentWritesCache.has(userId)) {
    recentWritesCache.set(userId, new Map());
  }
  const userCache = recentWritesCache.get(userId)!;
  userCache.set(memoryId, {
    content,
    timestamp: Date.now(),
    type,
    score: 0.95, // High score for recent writes
    metadata,
  });

  // Cleanup old entries
  for (const [id, write] of userCache.entries()) {
    if (Date.now() - write.timestamp > RECENT_WRITE_TTL_MS) {
      userCache.delete(id);
    }
  }
}

/**
 * Get recent writes that match a query (simple substring match).
 * Returns memories written in the last 30 seconds that may not be indexed yet.
 */
function getRecentWrites(userId: string, query: string): RetrievedMemory[] {
  const userCache = recentWritesCache.get(userId);
  if (!userCache) return [];

  const now = Date.now();
  const queryLower = query.toLowerCase();
  const results: RetrievedMemory[] = [];

  for (const [id, write] of userCache.entries()) {
    // Skip expired entries
    if (now - write.timestamp > RECENT_WRITE_TTL_MS) continue;

    // Simple relevance: check if query terms appear in content
    const contentLower = write.content.toLowerCase();
    if (contentLower.includes(queryLower) || queryLower.split(' ').some((term) => contentLower.includes(term))) {
      // Convert to RetrievedMemory format with proper MemoryItem structure
      results.push({
        item: {
          id,
          type: (write.type as 'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event') || 'moment',
          content: write.content,
          timestamp: new Date(write.timestamp),
          emotionalWeight: (write.metadata?.emotionalWeight as number) || 0.5,
          relevanceDecay: 0, // No decay for recent writes
          baseImportance: 0.8, // High importance for recent writes
          source: {
            collection: 'recent_writes_cache',
            documentId: id,
          },
        },
        score: write.score,
        scoreBreakdown: {
          semantic: 0.8,
          temporal: 1.0, // Maximum temporal score for recent
          emotional: 0.5,
          contextual: 0.7,
        },
        reason: 'Recently captured from conversation',
      });
    }
  }

  return results;
}

// ============================================================================
// UNIFIED RETRIEVAL
// ============================================================================

/**
 * Retrieve relevant memories for a query.
 *
 * This is the SINGLE ENTRY POINT for memory retrieval.
 * Combines multiple retrieval sources:
 * - Semantic search (vector similarity)
 * - Entity store (knowledge graph)
 * - STM buffer (recent conversation)
 * - Memory graph (associations)
 * - Recent writes (write-through cache)
 */
export async function retrieveContext(
  userId: string,
  query: string,
  context?: Partial<RetrievalContext>,
  options?: RetrievalOptions
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const sources: string[] = [];
  const memories: RetrievedMemory[] = [];
  const entities: EntityMatch[] = [];
  let stmContext: string | undefined;

  const topK = options?.topK ?? 10;
  const minScore = options?.minScore ?? 0.3;

  // 0. RECENT WRITES CACHE (fixes race condition)
  // Check for memories written in the last 30 seconds that may not be indexed yet
  const recentWrites = getRecentWrites(userId, query);
  if (recentWrites.length > 0) {
    memories.push(...recentWrites);
    sources.push('recent-write');
  }

  // 1. SEMANTIC SEARCH (primary retrieval)
  try {
    const { retrieveMemories } = await import('../advanced-retrieval.js');
    const semanticResults = await retrieveMemories(userId, {
      query,
      currentTopic: context?.currentTopic,
      currentEmotion: context?.currentEmotion,
      personaId: context?.personaId || options?.personaId,
      conversationTurn: context?.conversationTurn,
      recentTopics: context?.recentTopics,
    });

    if (semanticResults.length > 0) {
      memories.push(...semanticResults.slice(0, topK));
      sources.push('semantic');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Semantic search unavailable');
  }

  // 2. ENTITY STORE SEARCH
  try {
    const { isEntityStoreReady, retrieveMemoriesUnified } =
      await import('../entity-store/integration.js');
    if (isEntityStoreReady()) {
      const entityResults = await retrieveMemoriesUnified(userId, query);

      // Extract entities from the unified retrieval results
      if (entityResults.entities && Array.isArray(entityResults.entities)) {
        for (const entityResult of entityResults.entities) {
          const e = entityResult.entity;
          entities.push({
            id: e?.id || 'unknown',
            name: e?.canonicalName || query,
            type: e?.type || 'unknown',
            relevance: e?.salienceScore || 0.5,
            lastSeen: e?.lastSeen ? new Date(e.lastSeen) : undefined,
          });
        }
      }

      if (entities.length > 0) {
        sources.push('entity-store');
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Entity store search unavailable');
  }

  // 3. STM BUFFER (recent conversation context)
  // Query STM if not explicitly disabled - sessionId is sufficient (conversationTurn not required)
  const sessionId = (context as { sessionId?: string })?.sessionId;
  if (options?.includeSTM !== false && sessionId) {
    try {
      const { buildSTMContext } = await import('../dynamic/stm-buffer.js');
      const stm = buildSTMContext(sessionId);
      stmContext = stm ?? undefined;
      if (stmContext) {
        sources.push('stm');
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'STM buffer unavailable');
    }
  }

  // 4. ASSOCIATIVE MEMORY (spreading activation)
  if (options?.includeAssociative && memories.length > 0) {
    try {
      const { getSpreadingActivation } = await import('../spreading-activation.js');
      const activation = getSpreadingActivation();

      // Use top memory as seed for activation spread
      const seedMemoryId = memories[0]?.item?.source?.documentId;
      if (seedMemoryId) {
        const activated = await activation.spreadFromMemory(userId, seedMemoryId);
        if (activated.length > 0) {
          sources.push('associative');
          // Activated memories are added with lower scores
          // (they're related but not directly matched)
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Associative memory unavailable');
    }
  }

  // 5. NATURAL LANGUAGE QUERY (knowledge graph)
  if (options?.includeRelationships) {
    try {
      const { isKnowledgeCaptureReady, executeNaturalQuery } =
        await import('../knowledge-graph/index.js');
      if (isKnowledgeCaptureReady()) {
        const nlResult = await executeNaturalQuery(userId, query);
        // Check if we got any meaningful results (entity, facts, or mentions)
        if (
          nlResult &&
          (nlResult.entity || nlResult.facts?.length > 0 || nlResult.mentions?.length > 0)
        ) {
          sources.push('knowledge-graph');
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Knowledge graph query unavailable');
    }
  }

  // Filter by minimum score
  const filteredMemories = memories.filter((m) => m.score >= minScore);

  return {
    memories: filteredMemories,
    entities,
    stmContext,
    metadata: {
      query,
      totalResults: filteredMemories.length + entities.length,
      sources,
      retrievalTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Quick semantic search (for simple queries)
 */
export async function semanticSearch(
  userId: string,
  query: string,
  topK = 5
): Promise<RetrievedMemory[]> {
  const result = await retrieveContext(userId, query, undefined, {
    topK,
    includeAssociative: false,
    includeSTM: false,
    includeRelationships: false,
  });
  return result.memories;
}

/**
 * Entity lookup (find person/place/thing)
 */
export async function findEntity(userId: string, query: string): Promise<EntityMatch | null> {
  const result = await retrieveContext(userId, query, undefined, {
    topK: 1,
    includeAssociative: false,
    includeSTM: false,
  });
  return result.entities[0] ?? null;
}

/**
 * Get recent conversation context
 */
export async function getRecentContext(sessionId: string, userId: string): Promise<string | null> {
  try {
    const { buildSTMContext } = await import('../dynamic/stm-buffer.js');
    return buildSTMContext(sessionId);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get recent context');
    return null;
  }
}

// ============================================================================
// PROACTIVE SURFACING
// ============================================================================

/**
 * Get memories that should be proactively surfaced
 */
export async function getProactiveSuggestions(
  userId: string,
  currentTurn: string,
  context: {
    sessionId: string;
    personaId: string;
    turnNumber: number;
    currentTopic?: string;
    currentEmotion?: string;
    sessionTopics?: string[];
  }
): Promise<RetrievedMemory[]> {
  try {
    const { checkProactiveSurfacing } = await import('../entity-store/integration.js');
    const suggestions = await checkProactiveSurfacing(userId, currentTurn, {
      sessionId: context.sessionId,
      personaId: context.personaId,
      turnNumber: context.turnNumber,
      surfacingCountThisSession: 0,
      sessionTopics: context.sessionTopics || [],
      detectedEmotion: context.currentEmotion,
    });

    // Convert SurfacingOpportunity to RetrievedMemory format
    return suggestions.map((suggestion) => ({
      item: {
        id: suggestion.entity.id,
        type: suggestion.entity.type as RetrievedMemory['item']['type'],
        content: suggestion.naturalPhrasing,
        timestamp: suggestion.entity.lastSeen || new Date(),
        emotionalWeight: suggestion.receptivityScore || 0.5,
        relevanceDecay: 0,
        baseImportance: suggestion.receptivityScore || 0.5,
        source: {
          collection: 'entity_store',
          documentId: suggestion.entity.id,
        },
      },
      score: suggestion.receptivityScore || 0.5,
      scoreBreakdown: {
        semantic: 0,
        temporal: 0,
        emotional: 0,
        contextual: suggestion.receptivityScore || 0.5,
      },
      reason: String(suggestion.type),
      triggerType: 'associative' as const,
    }));
  } catch (error) {
    log.debug({ error: String(error) }, 'Proactive surfacing unavailable');
    return [];
  }
}

// ============================================================================
// CACHING (Performance Optimization)
// ============================================================================

/**
 * Simple LRU cache for retrieval results
 */
class RetrievalCache {
  private cache = new Map<string, { result: RetrievalResult; timestamp: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 100, ttlMs = 30000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  private makeKey(userId: string, query: string, options?: RetrievalOptions): string {
    return `${userId}:${query}:${JSON.stringify(options || {})}`;
  }

  get(userId: string, query: string, options?: RetrievalOptions): RetrievalResult | null {
    const key = this.makeKey(userId, query, options);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(
    userId: string,
    query: string,
    options: RetrievalOptions | undefined,
    result: RetrievalResult
  ): void {
    const key = this.makeKey(userId, query, options);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return { size: this.cache.size, maxSize: this.maxSize, ttlMs: this.ttlMs };
  }
}

let retrievalCacheInstance: RetrievalCache | null = null;

/**
 * Get the shared retrieval cache
 */
export function getRetrievalCache(maxSize?: number, ttlMs?: number): RetrievalCache {
  if (!retrievalCacheInstance) {
    retrievalCacheInstance = new RetrievalCache(maxSize, ttlMs);
  }
  return retrievalCacheInstance;
}

/**
 * Cached retrieval - checks cache before hitting storage
 */
export async function retrieveContextCached(
  userId: string,
  query: string,
  context?: Partial<RetrievalContext>,
  options?: RetrievalOptions & { bypassCache?: boolean }
): Promise<RetrievalResult> {
  const cache = getRetrievalCache();

  // Check cache first (unless bypassed)
  if (!options?.bypassCache) {
    const cached = cache.get(userId, query, options);
    if (cached) {
      log.debug({ userId, query }, 'Retrieval cache hit');
      return cached;
    }
  }

  // Cache miss - do actual retrieval
  const result = await retrieveContext(userId, query, context, options);

  // Store in cache
  cache.set(userId, query, options, result);

  return result;
}

/**
 * Clear the retrieval cache (useful after writes)
 */
export function clearRetrievalCache(): void {
  if (retrievalCacheInstance) {
    retrievalCacheInstance.clear();
  }
}

/**
 * Get retrieval cache statistics
 */
export function getRetrievalCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return getRetrievalCache().getStats();
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Memory interfaces (for consumers that need RetrievedMemory type)
export type { RetrievedMemory } from '../interfaces/index.js';

// Advanced retrieval functions
export {
  retrieveMemories,
  buildMemoryIndex,
  getConversationPrimingMemories,
  getPersonRelatedMemories,
  searchMemoriesByTopic,
  clearMemoryIndex,
  getIndexStats,
  type MemoryItem,
  type RetrievalConfig,
} from '../advanced-retrieval.js';

// Semantic RAG
export { semanticSearch as semanticRagSearch } from '../semantic-rag.js';

// Memory explanations
export { getRetrievalExplainer } from '../retrieval-explanations.js';

// Natural reference generation
export { getNaturalReferenceGenerator } from '../natural-reference-generator.js';

// Hybrid continuity retrieval (Firestore + Spanner + Vector)
export {
  retrieveContinuityBundle,
  formatContinuityForLLM,
  getInjectedMemories,
  type ContinuityBundle,
  type ThreadSummary,
  type AnchorSummary,
  type SemanticMatch,
  type RetrievalMetadata,
  type RetrievalOptions as ContinuityRetrievalOptions,
  type InjectedMemory,
} from './hybrid-continuity-retrieval.js';

// Semantic memory search (for continuity bundle integration)
export {
  searchMemories,
  searchAnchors,
  searchSessionSummaries,
  searchFacts,
  indexMemory,
  indexMemoriesBatch,
  removeIndexedMemory,
  toSemanticMatches,
  type SemanticSearchOptions,
  type SemanticSearchResult,
  type SemanticSearchMetrics,
  type MemorySourceType,
} from './semantic-memory-search.js';

// Recall attribution (track memory usage in responses)
export {
  parseAttributions,
  containsMemoryReferences,
  extractMemoryTags,
  aggregateAttributionStats,
  type AttributionResult,
  type AttributionSummary,
} from './recall-attribution.js';

// Injected memory store (for attribution tracking across turns)
export {
  setInjectedMemories,
  getAndClearInjectedMemories,
  peekInjectedMemories,
  clearSessionMemories,
  getStoreStats as getInjectedMemoryStoreStats,
  cleanupExpiredSessions,
} from './injected-memory-store.js';

// Memory feedback loop (boost/decay based on usage)
export {
  applyAttributionFeedback,
  calculateSignificanceBoost,
  calculateSignificanceDecay,
  adjustScoreForUsage,
} from './memory-feedback.js';

// ============================================================================
// HYBRID SEARCH (BM25 + Vector + RRF)
// ============================================================================

// BM25 keyword search
export {
  BM25Index,
  searchEntitiesBM25,
  getMemoryBM25Index,
  clearMemoryBM25Index,
  type BM25SearchOptions,
  type BM25Document,
  type BM25SearchResult,
  type BM25IndexStats,
} from './bm25-search.js';

// Tokenization
export {
  tokenize,
  tokenizeForIndex,
  tokenizeForQuery,
  tokenizeName,
  calculateTermFrequency,
  stem,
  STOP_WORDS,
  type TokenizeOptions,
} from './tokenizer.js';

// Rank fusion
export {
  reciprocalRankFusion,
  fuseSearchResults,
  weightedScoreFusion,
  teamDraftInterleave,
  type RankedItem,
  type FusedResult,
  type RankFusionOptions,
} from './rank-fusion.js';

// Hybrid search orchestration
export {
  hybridSearch,
  findEntityHybrid,
  bm25OnlySearch,
  vectorOnlySearch,
  type HybridSearchOptions,
  type HybridSearchResult,
  type HybridSearchMetrics,
} from './hybrid-search.js';

// Cross-encoder neural reranking
export {
  Reranker,
  getReranker,
  rerankDocuments,
  rerankHybridResults,
  // Providers
  GeminiCrossEncoder,
  LocalCrossEncoder,
  HeuristicCrossEncoder,
  // Types
  type CrossEncoderProvider,
  type RerankDocument,
  type RerankResult,
  type CrossEncoderOptions,
  type RerankOptions,
  type CrossEncoderMetrics,
} from './cross-encoder.js';

// ============================================================================
// TURN MEMORY RETRIEVAL (Phase 9 - Real-Time Memory Integration)
// ============================================================================

export {
  retrieveForTurn,
  formatMemoryContextForPrompt,
  formatProactiveMemory,
  cleanupTurnRetrieval,
  clearSessionSurfacingHistory,
  getTurnRetrievalStats,
  setTurnRetrievalConfig,
  getTurnRetrievalConfig,
  type TurnRetrievalInput,
  type RetrievedMemoryForTurn,
  type MemoryContext,
  type TurnRetrievalMetrics,
  type TurnRetrievalConfig,
} from './turn-memory-retrieval.js';

// ============================================================================
// CONFIDENCE SCORING (Phase 16 - Memory Confidence & Attribution)
// ============================================================================

export {
  calculateConfidence,
  calculateBatchConfidence,
  filterByConfidence,
  levelToMinScore,
  setConfidenceConfig,
  getConfidenceConfig,
  type MemoryConfidence,
  type ConfidenceLevel,
  type ConfidenceInput,
  type ConfidenceBreakdown,
  type ConfidenceFactor,
  type ConfidenceConfig,
} from './confidence-scoring.js';

// Attribution Builder
export {
  buildAttribution,
  buildBatchAttributions,
  quickAttribution,
  getTimePhraseForDate,
  buildCorrectionAcknowledgment,
  buildDisputeResponse,
  type MemoryAttribution,
  type AttributionInput,
} from './attribution-builder.js';
