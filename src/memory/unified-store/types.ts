/**
 * Unified Memory Store Types
 *
 * Single interface for all memory operations across Firestore, Vector, Redis, and In-Memory stores.
 * Part of the Superhuman Memory implementation (Phase 1).
 *
 * Philosophy: The memory system should feel like a caring friend's mind -
 * naturally surfacing relevant context without feeling like a database query.
 *
 * @module memory/unified-store/types
 */

import type { Entity, EntityType, EntitySearchOptions, EntityRelationship, EdgeType } from '../entity-store/types.js';
import type { MemoryItem, RetrievedMemory, RetrievalContext, VectorDocument } from '../interfaces/index.js';

// ============================================================================
// CORE UNIFIED MEMORY TYPES
// ============================================================================

/**
 * Memory types supported by the unified store
 */
export type MemoryType =
  | 'entity'         // Entity from entity-store
  | 'fact'           // Extracted fact
  | 'moment'         // Key moment
  | 'commitment'     // Promise or commitment
  | 'preference'     // User preference
  | 'summary'        // Conversation summary
  | 'insight'        // Generated insight
  | 'signal'         // Human signal (dream, fear, value, etc.)
  | 'topic';         // Topic of conversation

/**
 * Input for storing a new memory
 */
export interface MemoryInput {
  /** User ID (required) */
  userId: string;

  /** Memory type */
  type: MemoryType;

  /** Main content */
  content: string;

  /** Memory subtype for more specific classification */
  subtype?: string;

  /** Pre-computed embedding (optional, will compute if not provided) */
  embedding?: number[];

  /** Emotional weight (0-1) */
  emotionalWeight?: number;

  /** Base importance (0-1) */
  importance?: number;

  /** Related topics */
  topics?: string[];

  /** Related persona IDs */
  personaIds?: string[];

  /** People mentioned */
  peopleMentioned?: string[];

  /** Is this a commitment? */
  isCommitment?: boolean;

  /** Source session ID */
  sessionId?: string;

  /** Source conversation ID */
  conversationId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Stored memory with all computed fields
 */
export interface StoredMemory {
  /** Unique identifier */
  id: string;

  /** User ID */
  userId: string;

  /** Memory type */
  type: MemoryType;

  /** Subtype for more specific classification */
  subtype?: string;

  /** Main content */
  content: string;

  /** Embedding vector */
  embedding: number[];

  /** When created */
  createdAt: Date;

  /** When last accessed */
  lastAccessedAt: Date;

  /** When last updated */
  updatedAt: Date;

  /** Access count */
  accessCount: number;

  /** Emotional weight (0-1) */
  emotionalWeight: number;

  /** Current strength (after decay) */
  strength: number;

  /** Base importance (0-1) */
  importance: number;

  /** Is this protected from decay? */
  isProtected: boolean;

  /** Is this an active commitment? */
  isActiveCommitment: boolean;

  /** Related topics */
  topics: string[];

  /** Related persona IDs */
  personaIds: string[];

  /** People mentioned */
  peopleMentioned: string[];

  /** Source session ID */
  sessionId?: string;

  /** Source conversation ID */
  conversationId?: string;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Storage layer (for debugging) */
  storageLayer: 'firestore' | 'vector' | 'redis' | 'memory';
}

// ============================================================================
// RECALL & SEARCH
// ============================================================================

/**
 * Query for recalling memories
 */
export interface RecallQuery {
  /** User ID (required) */
  userId: string;

  /** Natural language query */
  query: string;

  /** Pre-computed query embedding (optional) */
  queryEmbedding?: number[];

  /** Filter by memory types */
  types?: MemoryType[];

  /** Filter by topics */
  topics?: string[];

  /** Filter by people mentioned */
  people?: string[];

  /** Filter by persona */
  personaId?: string;

  /** Time range filter */
  timeRange?: {
    start?: Date;
    end?: Date;
  };

  /** Maximum results */
  limit?: number;

  /** Minimum relevance score (0-1) */
  minScore?: number;

  /** Include linked memories via graph */
  includeLinked?: boolean;

  /** Maximum graph hops for linked memories */
  maxGraphHops?: number;

  /** Current conversation context for boosting */
  context?: RetrievalContext;
}

/**
 * Result of a recall operation
 */
export interface RecallResult {
  /** Retrieved memories with scores */
  memories: ScoredMemory[];

  /** Total count (before limit) */
  totalCount: number;

  /** Query processing time (ms) */
  queryTimeMs: number;

  /** Which stores were queried */
  storesQueried: string[];

  /** Debug information */
  debug?: {
    embeddingTimeMs?: number;
    searchTimeMs?: number;
    rerankTimeMs?: number;
    graphExpansionTimeMs?: number;
  };
}

/**
 * Memory with relevance score
 */
export interface ScoredMemory {
  /** The memory */
  memory: StoredMemory;

  /** Overall relevance score (0-1) */
  score: number;

  /** Score breakdown for explainability */
  scoreBreakdown: {
    /** Semantic similarity score */
    semantic: number;
    /** Temporal relevance score */
    temporal: number;
    /** Emotional relevance score */
    emotional: number;
    /** Contextual relevance score */
    contextual: number;
    /** Graph/associative relevance score */
    associative?: number;
  };

  /** Why this memory was retrieved */
  reason: string;

  /** How the memory was triggered */
  triggerType: 'semantic' | 'associative' | 'temporal' | 'emotional' | 'commitment' | 'keyword';

  /** Graph path if retrieved via links */
  graphPath?: string[];
}

/**
 * Search parameters for more advanced queries
 */
export interface SearchParams {
  /** User ID (required) */
  userId: string;

  /** Vector embedding to search for */
  embedding?: number[];

  /** Text query (will be embedded) */
  text?: string;

  /** Filter by types */
  types?: MemoryType[];

  /** Custom filters */
  filters?: Record<string, unknown>;

  /** Maximum results */
  topK?: number;

  /** Minimum score threshold */
  minScore?: number;

  /** Use hybrid search (vector + keyword) */
  hybrid?: boolean;

  /** Apply cross-encoder reranking */
  rerank?: boolean;
}

/**
 * Search result
 */
export interface SearchResult {
  /** Found memories */
  results: ScoredMemory[];

  /** Total matches */
  totalMatches: number;

  /** Search time (ms) */
  searchTimeMs: number;
}

// ============================================================================
// MEMORY LINKS (GRAPH)
// ============================================================================

/**
 * Types of links between memories
 */
export type MemoryLinkType =
  | 'causal'       // "Because of" / "Led to"
  | 'temporal'     // "Before" / "After"
  | 'emotional'    // Similar emotional context
  | 'person'       // Same person mentioned
  | 'topic'        // Same topic domain
  | 'narrative'    // Same life chapter
  | 'semantic'     // High embedding similarity
  | 'reinforced';  // Repeatedly accessed together

/**
 * Link between two memories
 */
export interface MemoryLink {
  /** Unique identifier */
  id: string;

  /** Source memory ID */
  sourceId: string;

  /** Target memory ID */
  targetId: string;

  /** Link type */
  type: MemoryLinkType;

  /** Link strength (0-1) */
  weight: number;

  /** Is this bidirectional? */
  bidirectional: boolean;

  /** When first linked */
  createdAt: Date;

  /** When last reinforced */
  lastReinforced: Date;

  /** How many times reinforced */
  reinforcementCount: number;

  /** Link metadata */
  metadata: {
    /** How was this link detected */
    detectedBy: 'auto' | 'manual' | 'llm';
    /** Detection confidence */
    confidence: number;
    /** Additional context */
    context?: string;
  };
}

/**
 * Input for creating a memory link
 */
export interface MemoryLinkInput {
  /** Source memory ID */
  sourceId: string;

  /** Target memory ID */
  targetId: string;

  /** Link type */
  type: MemoryLinkType;

  /** Initial weight (0-1, default 0.5) */
  weight?: number;

  /** Is this bidirectional? */
  bidirectional?: boolean;

  /** How was this detected */
  detectedBy?: 'auto' | 'manual' | 'llm';

  /** Detection confidence */
  confidence?: number;

  /** Additional context */
  context?: string;
}

// ============================================================================
// LIFECYCLE OPERATIONS
// ============================================================================

/**
 * Consolidation report
 */
export interface ConsolidationReport {
  /** User ID */
  userId: string;

  /** When started */
  startedAt: Date;

  /** When completed */
  completedAt: Date;

  /** Duration (ms) */
  durationMs: number;

  /** Memories merged due to similarity */
  memoriesMerged: number;

  /** Links created */
  linksCreated: number;

  /** Links strengthened */
  linksStrengthened: number;

  /** Patterns detected */
  patternsDetected: number;

  /** Errors encountered */
  errors: string[];
}

/**
 * Decay report
 */
export interface DecayReport {
  /** User ID */
  userId: string;

  /** When ran */
  ranAt: Date;

  /** Duration (ms) */
  durationMs: number;

  /** Memories processed */
  memoriesProcessed: number;

  /** Memories archived (below threshold) */
  memoriesArchived: number;

  /** Memories strengthened (protected) */
  memoriesProtected: number;

  /** Average decay applied */
  averageDecay: number;
}

// ============================================================================
// HEALTH & STATUS
// ============================================================================

/**
 * Store health status
 */
export interface StoreHealth {
  /** Is the store healthy? */
  healthy: boolean;

  /** Store name */
  name: string;

  /** Is the store initialized? */
  initialized: boolean;

  /** Current latency (ms) */
  latencyMs: number;

  /** Error rate (0-1) */
  errorRate: number;

  /** Last error message */
  lastError?: string;

  /** Last successful operation */
  lastSuccess?: Date;
}

/**
 * Overall unified store health
 */
export interface UnifiedStoreHealth {
  /** Overall healthy status */
  healthy: boolean;

  /** Timestamp */
  timestamp: Date;

  /** Individual store health */
  stores: {
    firestore: StoreHealth;
    vector: StoreHealth;
    redis: StoreHealth;
    spanner: StoreHealth;
    memory: StoreHealth;
  };

  /** Degradation mode? */
  degraded: boolean;

  /** Degradation reason */
  degradationReason?: string;

  /** Recommendations */
  recommendations?: string[];
}

// ============================================================================
// ADAPTER INTERFACES
// ============================================================================

/**
 * Base adapter interface that all storage adapters must implement
 */
export interface MemoryStoreAdapter {
  /** Adapter name */
  readonly name: string;

  /** Initialize the adapter */
  initialize(): Promise<void>;

  /** Check if initialized */
  isInitialized(): boolean;

  /** Store a memory */
  store(memory: StoredMemory): Promise<void>;

  /** Get a memory by ID */
  get(userId: string, memoryId: string): Promise<StoredMemory | null>;

  /** Update a memory */
  update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void>;

  /** Delete a memory */
  delete(userId: string, memoryId: string): Promise<void>;

  /** Search memories */
  search(params: SearchParams): Promise<ScoredMemory[]>;

  /** Get health status */
  health(): Promise<StoreHealth>;

  /** Shutdown the adapter */
  shutdown(): Promise<void>;
}

/**
 * Vector-capable adapter (for semantic search)
 */
export interface VectorStoreAdapter extends MemoryStoreAdapter {
  /** Search by embedding */
  searchByEmbedding(
    userId: string,
    embedding: number[],
    options?: { topK?: number; minScore?: number }
  ): Promise<ScoredMemory[]>;

  /** Add embedding to a memory */
  addEmbedding(userId: string, memoryId: string, embedding: number[]): Promise<void>;
}

/**
 * Cache-capable adapter (for fast retrieval)
 */
export interface CacheStoreAdapter extends MemoryStoreAdapter {
  /** Get from cache with TTL */
  getWithTTL(key: string): Promise<{ value: StoredMemory | null; ttl: number }>;

  /** Set with TTL */
  setWithTTL(key: string, value: StoredMemory, ttlSeconds: number): Promise<void>;

  /** Invalidate cache */
  invalidate(pattern: string): Promise<number>;

  /** Get cache stats */
  getCacheStats(): Promise<{ hits: number; misses: number; size: number }>;
}

// ============================================================================
// UNIFIED STORE INTERFACE
// ============================================================================

/**
 * The main unified memory store interface
 *
 * Single entry point for all memory operations across storage backends.
 */
export interface UnifiedMemoryStore {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store a new memory
   * Handles embedding, deduplication, and multi-store persistence
   */
  store(input: MemoryInput): Promise<StoredMemory>;

  /**
   * Recall memories relevant to a query
   * Uses semantic search, graph expansion, and intelligent ranking
   */
  recall(query: RecallQuery): Promise<RecallResult>;

  /**
   * Get a specific memory by ID
   */
  get(userId: string, memoryId: string): Promise<StoredMemory | null>;

  /**
   * Update an existing memory
   */
  update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void>;

  /**
   * Delete a memory
   */
  delete(userId: string, memoryId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Advanced search with filters
   */
  search(params: SearchParams): Promise<SearchResult>;

  /**
   * Search by embedding similarity
   */
  searchSimilar(
    userId: string,
    embedding: number[],
    options?: { topK?: number; minScore?: number; types?: MemoryType[] }
  ): Promise<ScoredMemory[]>;

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get links for a memory
   */
  getLinks(userId: string, memoryId: string, type?: MemoryLinkType): Promise<MemoryLink[]>;

  /**
   * Add a link between memories
   */
  addLink(userId: string, link: MemoryLinkInput): Promise<MemoryLink>;

  /**
   * Remove a link
   */
  removeLink(userId: string, linkId: string): Promise<void>;

  /**
   * Reinforce a link (increase weight)
   */
  reinforceLink(userId: string, linkId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run consolidation for a user (merge similar, detect patterns)
   */
  consolidate(userId: string): Promise<ConsolidationReport>;

  /**
   * Run decay for a user (reduce strength over time)
   */
  decay(userId: string): Promise<DecayReport>;

  /**
   * Reinforce a memory (increase strength, reset decay)
   */
  reinforce(userId: string, memoryId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get health status of all stores
   */
  health(): Promise<UnifiedStoreHealth>;

  /**
   * Initialize all stores
   */
  initialize(): Promise<void>;

  /**
   * Shutdown all stores
   */
  shutdown(): Promise<void>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for the unified memory store
 */
export interface UnifiedStoreConfig {
  /** Firestore project ID */
  firestoreProjectId?: string;

  /** Firestore database ID */
  firestoreDatabaseId?: string;

  /** Redis connection URL */
  redisUrl?: string;

  /** Redis cache TTL (seconds) */
  redisCacheTtl?: number;

  /** Embedding model to use */
  embeddingModel?: string;

  /** Embedding dimension */
  embeddingDimension?: number;

  /** Enable deduplication on store */
  enableDeduplication?: boolean;

  /** Similarity threshold for deduplication */
  deduplicationThreshold?: number;

  /** Enable automatic link detection */
  enableAutoLinking?: boolean;

  /** Default decay rate (per day) */
  defaultDecayRate?: number;

  /** Emotional weight multiplier for decay resistance */
  emotionalDecayMultiplier?: number;

  /** Feature flags */
  features?: {
    useRedisCache?: boolean;
    useVectorSearch?: boolean;
    useGraphExpansion?: boolean;
    useHybridSearch?: boolean;
    useSpannerGraph?: boolean;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: UnifiedStoreConfig = {
  embeddingModel: 'text-embedding-3-small',
  embeddingDimension: 1536,
  redisCacheTtl: 3600, // 1 hour
  enableDeduplication: true,
  deduplicationThreshold: 0.92,
  enableAutoLinking: true,
  defaultDecayRate: 0.1,
  emotionalDecayMultiplier: 2.0,
  features: {
    useRedisCache: true,
    useVectorSearch: true,
    useGraphExpansion: true,
    useHybridSearch: true,
    useSpannerGraph: false, // opt-in; idle Spanner is expensive (~$65/mo)
  },
};
