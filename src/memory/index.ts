/**
 * Memory Module
 *
 * Comprehensive memory system for the voice AI agent.
 * Provides persistent user profiles, semantic search, and conversation history.
 *
 * Store Selection (auto-selected based on environment):
 * - Development: InMemoryStore (fast, ephemeral)
 * - Production: FirestoreStore (Google Cloud) or PostgresStore (self-hosted)
 * - Redis: Optional cache layer for sessions
 *
 * New in v2:
 * - Result types for better error handling
 * - Embedding caching for performance
 * - Memory consolidation for long-term users
 * - Graceful forgetting with decay curves
 * - Natural language retrieval explanations
 * - Enhanced session priming
 * - Semantic deduplication
 * - Comprehensive metrics
 */

// Store interfaces and implementations
export { getDefaultStore, InMemoryStore, resetDefaultStore } from './in-memory-store.js';
export { MemoryStore, type QueryOptions, type SearchResult } from './store.js';

// Production stores
export { FirestoreStore, getFirestoreStore, resetFirestoreStore } from './firestore-store.js';
export { getPostgresStore, PostgresStore, resetPostgresStore } from './postgres-store.js';
export { getRedisCache, RedisCache, resetRedisCache } from './redis-cache.js';

// Embeddings
export {
  cosineSimilarity,
  embed,
  embedBatch,
  euclideanDistance,
  findTopK,
  getEmbeddingProvider,
  GoogleEmbeddings,
  LocalEmbeddings,
  OpenAIEmbeddings,
  setEmbeddingProvider,
  VertexAIEmbeddings,
  type EmbeddingConfig,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embeddings.js';

// Internal import for embedding provider validation
import { getEmbeddingProvider as getInternalEmbeddingProvider } from './embeddings.js';

// Vector store interface (unified)
export {
  isVectorStore,
  type VectorStoreContract,
  type VectorDocument,
  type VectorFilter,
  type VectorSearchOptions,
  type VectorSearchResult,
  type VectorStoreStats,
} from './vector-store-interface.js';

// Vector store (in-memory fallback)
export { getVectorStore, resetVectorStore, VectorStore } from './vector-store.js';

// Persistent vector store (Firestore-backed)
export {
  FirestoreVectorStore,
  getFirestoreVectorStore,
  resetFirestoreVectorStore,
} from './firestore-vector-store.js';

// Semantic RAG
export {
  formatRAGContext,
  getRAGContext,
  hybridSearch,
  indexAllPersonaContent,
  indexConversationSummary,
  indexPersonaContent,
  ragLookup,
  semanticSearch,
  setActiveVectorStore,
  type RAGContext,
  type RAGResult,
} from './semantic-rag.js';

// User Memory Indexer (comprehensive user data vectorization)
export {
  batchIndexUserMemories,
  getUserMemoryStats,
  indexUserMemories,
  removeUserMemories,
  type IndexingResult,
  type UserMemoryCategory,
} from './user-memory-indexer.js';

// Human Signal Extractor (conversation → human memory)
export { extractHumanSignals, mergeSignalsIntoMemory } from './human-signal-extractor.js';

// Summarization
export {
  extractFollowUpItems,
  extractOpenQuestions,
  generateRollingSummary,
  summarizeConversation,
  summarizeWithLLM,
  type ConversationTurn,
  type SummarizationOptions,
} from './summarizer.js';

// History tracking
export {
  ConversationHistoryTracker,
  getActiveSessionIds,
  getHistoryTracker,
  removeHistoryTracker,
  type SessionHistory,
  type TrackedTurn,
} from './history.js';

// Key Moment Retrieval
export {
  clearCurrentSessionMomentsGetter,
  getKeyMomentRetrieval,
  KeyMomentRetrieval,
  setCurrentSessionMomentsGetter,
  type KeyMomentMatch,
} from './key-moment-retrieval.js';

// Advanced Memory Retrieval (semantic, temporal, emotional scoring)
export {
  buildMemoryIndex,
  clearMemoryIndex,
  computeMemoryEmbeddings,
  getConversationPrimingMemories,
  getIndexStats,
  getPersonRelatedMemories,
  retrieveMemories,
  searchMemoriesByTopic,
  type MemoryItem,
  type RetrievalConfig,
  type RetrievalContext,
  type RetrievedMemory,
} from './advanced-retrieval.js';

// ============================================================================
// NEW v2 MODULES
// ============================================================================

// Result Type Pattern (error handling)
export {
  all,
  allSettled,
  andThen,
  err,
  isErr,
  isOk,
  map,
  mapError,
  memoryError,
  ok,
  retry,
  tryAsync,
  trySync,
  unwrap,
  unwrapOr,
  type MemoryError,
  type MemoryErrorType,
  type Result,
} from './result.js';

// Embedding Cache (performance)
export {
  configureEmbeddingCacheMetrics,
  embedBatchCached,
  embedCached,
  EmbeddingCache,
  getEmbeddingCache,
  resetEmbeddingCache,
  type CachedEmbedding,
  type CacheStats,
  type EmbeddingCacheConfig,
} from './embedding-cache.js';

// Semantic Memory Cache (performance - "Better than Human" optimization)
export {
  configureSemanticCache,
  findSimilarCached,
  storeInSemanticCache,
  withSemanticCache,
  clearUserSemanticCache,
  clearAllSemanticCaches,
  invalidateSemanticCache,
  getSemanticCacheStats,
  resetSemanticCacheStats,
  getUserCacheInfo,
  type CachedQuery,
  type SemanticCacheConfig,
  type CacheStats as SemanticCacheStats,
  type CacheLookupResult,
} from './semantic-memory-cache.js';

// Predictive Cache Warming (80%+ cache hit rate for anticipated queries)
export {
  configurePredictiveWarming,
  configureMemoryRetrieval,
  setupMemoryFetcher,
  detectTimeSignals,
  predictQueries,
  warmCacheForSession,
  warmCacheForHandoff,
  type PersonaId as PredictivePersonaId,
  type TimeOfDay,
  type DayOfWeek,
  type SessionSignals,
  type PredictedQuery,
  type WarmingResult,
  type PredictiveCacheConfig,
  type MemoryRetrievalFn,
} from './predictive-cache-warming.js';

// Memory Consolidation (long-term memory management)
export {
  getMemoryConsolidator,
  MemoryConsolidator,
  resetMemoryConsolidator,
  type ConsolidatedMemory,
  type ConsolidationConfig,
  type ConsolidationResult,
} from './memory-consolidator.js';

// Memory Decay (graceful forgetting)
export {
  getMemoryDecayManager,
  MemoryDecayManager,
  resetMemoryDecayManager,
  type DecayingMemory,
  type DecayResult,
  type MemoryDecayConfig,
  type PruneResult,
} from './memory-decay.js';

// Retrieval Explanations (natural language reasoning)
export {
  getRetrievalExplainer,
  resetRetrievalExplainer,
  RetrievalExplainer,
  type ConnectionType,
  type ExplainedMemory,
} from './retrieval-explanations.js';

// Session Priming (cross-session continuity)
export {
  getSessionPrimer,
  resetSessionPrimer,
  SessionPrimer,
  type EmotionalContext,
  type OpenThread,
  type PendingFollowUp,
  type RelationshipContext,
  type SessionPrimingConfig,
  type SessionPrimingResult,
} from './session-priming.js';

// Memory Deduplication (data quality)
export {
  getMemoryDeduplicator,
  MemoryDeduplicator,
  resetMemoryDeduplicator,
  type DeduplicationConfig,
  type DeduplicationStats,
  type DuplicateCheckResult,
  type MergeResult,
} from './memory-deduplication.js';

// LSH Deduplication (O(n) approximate matching)
export {
  exactJaccardSimilarity,
  findDuplicatesLSH,
  isNativeLshAvailable,
  LSHIndex,
  type DuplicatePair,
  type LSHConfig,
} from './lsh-deduplication.js';

// ============================================================================
// RUST-ACCELERATED OPERATIONS (SIMD-optimized for batch processing)
// ============================================================================

export {
  // Euclidean distance (SIMD-accelerated for batches)
  batchEuclideanDistance,
  batchEuclideanDistanceF32,
  euclideanDistanceF32,

  // Vector normalization (SIMD-accelerated)
  normalizeVector,
  normalizeVectorF32,
  batchNormalizeVectorsF32,
  vectorNormF32,

  // Centroid computation (SIMD-accelerated)
  computeCentroidF32,

  // Cosine similarity (already Rust-accelerated)
  batchCosineSimilarity,

  // Native module availability check
  isRustAvailable,
} from './rust-accelerator.js';

// Memory Metrics (observability)
export {
  checkMemoryHealthAlerts,
  collectMemoryMetrics,
  getMemoryMetricsCollector,
  MemoryMetricsCollector,
  resetMemoryMetricsCollector,
  type DeduplicationMetrics,
  type EmbeddingMetrics,
  type IndexMetrics,
  type MemoryMetrics,
  type MetricAlert,
  type MetricThresholds,
  type RetrievalMetrics,
  type StorageMetrics,
} from './memory-metrics.js';

// Tiered Memory Storage (Phase 2.3 optimization - 10x faster hot data retrieval)
export {
  clearAccessRecords,
  getFromHotTier,
  getMemoriesTiered,
  getMemoryTiered,
  getTieredMemoryConfig,
  getTieredMemoryStats,
  getUserAccessRecords,
  recordMemoryAccess,
  removeFromHotTier,
  resetTieredMemoryStats,
  runDemotionCheck,
  setTieredMemoryConfig,
  storeInHotTier,
  type MemoryAccessRecord,
  type TieredMemoryConfig,
  type TieredMemoryStats,
} from './tiered-memory-storage.js';

// ============================================================================
// UNIFIED EMOTIONAL MEMORY (coordinates user emotions + bonding)
// ============================================================================

export {
  areEmotionalMemoryEnginesConfigured,
  clearAllUnifiedEmotionalMemories,
  clearUnifiedEmotionalMemory,
  configureEmotionalMemoryEngines,
  getUnifiedEmotionalMemory,
  UnifiedEmotionalMemory,
  type EmotionalBond,
  type EmotionalCheckIn,
  type EmotionalContext as UnifiedEmotionalContext,
  type EmotionalMemoryConfig,
  type EmotionalMemoryEngineFactories,
  type EmotionalMoment,
  type EmotionalPattern,
  type BondingEngine,
  type UserEmotionEngine,
  type RelationshipStage,
  type UnifiedEmotionalState,
  type UserEmotionalContext,
  type UserEmotionalMoment,
} from './emotional-memory-unified.js';

// ============================================================================
// NEW: ENHANCED HUMAN-CENTRIC MEMORY SYSTEMS
// ============================================================================

// Clean Architecture Interfaces
export type {
  // Core types (renamed to avoid conflicts with existing exports)
  MemoryItem as IMemoryItem,
  RetrievedMemory as IRetrievedMemory,
  RetrievalContext as IRetrievalContext,
  ExplainedMemory as IExplainedMemory,
  ConnectionType as IConnectionType,
  VectorDocument as IVectorDocument,
  VectorSearchOptions as IVectorSearchOptions,
  VectorSearchResult as IVectorSearchResult,
  DecayResult as IDecayResult,
  // Associative Memory
  AssociativeTrigger,
  TriggeredMemory,
  AssociativeMemoryService,
  // Communication Preferences
  PreferenceDimension,
  InteractionPreference,
  ApproachGuidance,
  CommunicationPreferencesService,
  // Behavioral Patterns
  PatternType,
  BehavioralPattern,
  BehavioralPatternDetector,
  // Emotional Threading
  EmotionalThread,
  SessionEmotionalContext,
  EmotionalThreadingService,
  // Signal Extraction
  ExtractedSignals,
  HumanSignalExtractor,
  // Natural References
  ReferenceStyle,
  GeneratedReference,
  NaturalReferenceGenerator,
  // Orchestrator
  OrchestratedMemory,
  RecallContext,
  MemoryOrchestrator,
  // Container
  MemoryContainer,
  MemoryContainerConfig,
} from './interfaces/index.js';

// Associative Memory (human-like memory triggers)
export {
  AssociativeMemory,
  getAssociativeMemory,
  saveAssociativeMemory,
  clearAssociativeMemory,
} from './associative-memory.js';

// Communication Preferences (how users like to be approached)
export {
  CommunicationPreferences,
  getCommunicationPreferences,
  resetCommunicationPreferences,
} from './communication-preferences.js';

// LLM Signal Extraction (smarter than regex)
export {
  LLMSignalExtractor,
  getLLMSignalExtractor,
  resetLLMSignalExtractor,
  configureLLMSignalExtractor,
} from './llm-signal-extractor.js';

// Natural Reference Generator (human-sounding memory callbacks)
export {
  NaturalReferenceGeneratorImpl,
  getNaturalReferenceGenerator,
  resetNaturalReferenceGenerator,
  generateNaturalReference,
} from './natural-reference-generator.js';

// Emotional Threading (cross-session emotional continuity)
export {
  EmotionalThreading,
  getEmotionalThreading,
  resetEmotionalThreading,
} from './emotional-threading.js';

// Behavioral Pattern Detector (meta-patterns across conversations)
export {
  BehavioralPatternDetectorImpl,
  getBehavioralPatternDetector,
  loadPatternsFromPersistence,
  savePatternsToPeristence,
  resetBehavioralPatternDetector,
} from './behavioral-pattern-detector.js';

// Firestore Memory Persistence
export {
  FirestoreMemoryPersistence,
  getFirestoreMemoryPersistence,
  resetFirestoreMemoryPersistence,
} from './firestore-memory-persistence.js';

// Extended Firestore Persistence (sessions, tool logs, bonds, voice, intents, cache, metrics)
export {
  // Configuration
  configureFirestoreExtended,
  // Session state
  saveSessionState,
  getSessionState,
  getRecentSessions,
  type SessionState,
  // Tool execution logs
  logToolExecution,
  getToolExecutions,
  type ToolExecution,
  // Persona bonds
  savePersonaBond,
  getPersonaBond,
  getAllPersonaBonds,
  type PersonaBond,
  // Voice profile
  saveVoiceProfile,
  getVoiceProfile,
  type VoiceProfile,
  // User intents
  logUserIntent,
  getRecentIntents,
  type UserIntent,
  // Superhuman cache
  setCachedInsight,
  getCachedInsight,
  type CachedInsight,
  // Quality metrics
  saveQualityMetrics,
  getQualityMetrics,
  type QualityMetrics,
  // GDPR
  deleteAllExtendedUserData,
} from './firestore-extended-persistence.js';

// Memory Orchestrator (unified entry point)
export {
  MemoryOrchestratorImpl,
  getMemoryOrchestrator,
  resetMemoryOrchestrator,
} from './orchestrator.js';

// Superhuman Signal Router (routes extracted signals to superhuman services)
export { routeSignalsToSuperhuman } from './superhuman-signal-router.js';

// ============================================================================
// UNIFIED ENTITY STORE (Better Than Human Memory)
// ============================================================================

// The unified entity store replaces fragmented collections:
// - user_contacts, contact_relationships, relationship_network
// - relationship_nodes, guest_profiles, network/relationships
//
// All people, places, events, and concepts are now stored as unified entities
// with deduplication, alias resolution, and cross-domain queries.

export {
  // Types
  type Entity,
  type EntityType,
  type EntitySource,
  type RelationshipType,
  type Mention,
  type MentionType,
  type ExtractedFact,
  type EntityRelationship,
  type EdgeType,
  type EntityQuery,
  type EntityQueryResult,
  type PersonCaptureInput,
  type CaptureContext,
  type CaptureResult,
  // Storage
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  findEntityByAlias,
  searchEntities,
  getAllEntities,
  getEntitiesByType,
  createMention,
  getMentionsForEntity,
  getRecentMentions,
  upsertRelationship,
  getRelationshipsForEntity,
  recordMention,
  hasEntityStore,
  getEntityStoreStats,
  // Resolver
  resolvePerson,
  mergeEntities,
  whatDoWeKnowAbout,
  type ResolvedEntity,
  // Integration
  isEntityStoreReady,
  initializeEntityStore,
  capturePersonEntity,
  captureMultiplePeople,
  findContactForTelephony,
  getAllContacts,
  getEntityStoreHealth,
  // Migration
  migrateUser,
  migrateAllUsers,
} from './entity-store/index.js';

// ============================================================================
// STORE TYPE DETECTION
// ============================================================================

import { getLogger } from '../utils/safe-logger.js';
import type { MemoryStore } from './store.js';

/**
 * Storage backend type
 */
export type StoreType = 'memory' | 'firestore' | 'postgres';

/**
 * Detect the appropriate store type based on environment
 */
export function detectStoreType(): StoreType {
  // Explicit override
  const explicit = process.env.MEMORY_STORE_TYPE as StoreType | undefined;
  if (explicit && ['memory', 'firestore', 'postgres'].includes(explicit)) {
    return explicit;
  }

  // Auto-detect based on available credentials
  if (process.env.NODE_ENV === 'production') {
    // Prefer Firestore if Google Cloud project is set
    if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT) {
      return 'firestore';
    }
    // Fall back to Postgres if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
      return 'postgres';
    }
  }

  // Default to in-memory for development
  return 'memory';
}

/**
 * Create the appropriate store based on environment
 * @param type - Store type to create
 * @param skipInit - If true, skip initialization (for lazy loading)
 */
export async function createStore(type?: StoreType, skipInit = false): Promise<MemoryStore> {
  const storeType = type || detectStoreType();

  getLogger().info({ storeType, lazy: skipInit }, `Creating ${storeType} store...`);

  switch (storeType) {
    case 'firestore': {
      const { getFirestoreStore } = await import('./firestore-store.js');
      const store = getFirestoreStore();
      if (!skipInit) {
        await store.initialize();
      }
      // Store will auto-initialize on first use if skipInit=true
      return store;
    }

    case 'postgres': {
      const { getPostgresStore } = await import('./postgres-store.js');
      const store = getPostgresStore();
      if (!skipInit) {
        await store.initialize();
      }
      return store;
    }

    case 'memory':
    default: {
      const { getDefaultStore } = await import('./in-memory-store.js');
      const store = getDefaultStore();
      if (!skipInit) {
        await store.initialize();
      }
      return store;
    }
  }
}

// ============================================================================
// REDIS CACHE INTEGRATION
// ============================================================================

let redisCacheEnabled = false;

/**
 * Check if Redis cache should be enabled
 */
export function shouldUseRedis(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Initialize Redis cache (optional)
 */
export async function initializeRedisCache(): Promise<ReturnType<
  typeof import('./redis-cache.js').getRedisCache
> | null> {
  if (!shouldUseRedis()) {
    getLogger().info('Redis not configured, skipping cache layer');
    return null;
  }

  try {
    const { getRedisCache } = await import('./redis-cache.js');
    const cache = getRedisCache();
    await cache.initialize();
    redisCacheEnabled = true;
    getLogger().info('Redis cache enabled');
    return cache;
  } catch (error) {
    getLogger().warn(`Failed to initialize Redis cache: ${error}`);
    return null;
  }
}

/**
 * Check if Redis cache is enabled
 */
export function isRedisCacheEnabled(): boolean {
  return redisCacheEnabled;
}

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

import { getFirestoreVectorStore, type FirestoreVectorStore } from './firestore-vector-store.js';
import { indexAllPersonaContent, setActiveVectorStore } from './semantic-rag.js';
import { getVectorStore, type VectorStore } from './vector-store.js';

export interface MemorySystemConfig {
  store?: MemoryStore;
  storeType?: StoreType;
  enableRedis?: boolean;
  indexPersona?: boolean;
  /** Use persistent Firestore vector store instead of ephemeral in-memory */
  usePersistentVectors?: boolean;
  /** Rehydrate conversation embeddings from Firestore on startup */
  rehydrateConversations?: boolean;
  /** Skip Firestore initialization for lazy loading (connects on first use) */
  skipFirestoreInit?: boolean;
}

export interface MemorySystemResult {
  store: MemoryStore;
  vectorStore: VectorStore | FirestoreVectorStore;
  redisCache: ReturnType<typeof import('./redis-cache.js').getRedisCache> | null;
  storeType: StoreType;
  usePersistentVectors: boolean;
}

// ============================================================================
// REHYDRATION - DEPRECATED
// ============================================================================
//
// ⚠️ THIS FUNCTION IS DEPRECATED AND SHOULD NOT BE USED
//
// Historical context (Dec 2024):
// - This function was designed for in-memory VectorStore in development
// - In production, we use FirestoreVectorStore which is PERSISTENT
// - Embeddings are stored directly in Firestore's `vectors` collection
// - They survive restarts - NO REHYDRATION NEEDED
//
// Why it was removed:
// 1. UNNECESSARY: FirestoreVectorStore already persists embeddings
// 2. DOESN'T SCALE: O(users × summaries) queries at startup
// 3. BLOCKS STARTUP: Prevented workers from accepting calls
// 4. CAUSED OUTAGE: Dec 2024 startup hang incident
//
// If you need embeddings for a specific user, load them on-demand:
// - User connects → Load their embeddings into session cache
// - NOT: Startup → Load ALL users' embeddings
//
// See: docs/architecture/MEMORY-MANAGEMENT.md
// ============================================================================

/**
 * @deprecated DO NOT USE - FirestoreVectorStore is persistent, no rehydration needed.
 *
 * This function only existed for the in-memory VectorStore used in development.
 * In production, embeddings are stored in Firestore and persist across restarts.
 *
 * If you need to pre-warm embeddings for a specific user, use:
 * - `loadUserEmbeddingsIntoSession(userId)` (when user connects)
 *
 * NOT this function (which tried to load ALL users at startup).
 */
export async function rehydrateConversationEmbeddings(
  _store: MemoryStore,
  _vectorStore: VectorStore | FirestoreVectorStore
): Promise<number> {
  getLogger().warn(
    '⚠️ rehydrateConversationEmbeddings() is DEPRECATED and does nothing. ' +
      'FirestoreVectorStore is persistent - no rehydration needed. ' +
      'This function will be removed in a future version.'
  );
  return 0;
}

// Cache for memory system result (idempotent initialization)
let cachedMemorySystem: MemorySystemResult | null = null;
let initializingPromise: Promise<MemorySystemResult> | null = null;

/**
 * Validate that embedding provider dimensions match vector store configuration.
 * Logs a warning if there's a mismatch, which could cause silent search quality issues.
 *
 * Known dimensions:
 * - Google text-embedding-004: 768
 * - OpenAI text-embedding-3-small: 1536
 * - OpenAI text-embedding-3-large: 3072
 * - Local hash fallback: 384
 */
function validateEmbeddingDimensions(usePersistentVectors: boolean): void {
  try {
    const provider = getInternalEmbeddingProvider();
    const providerDimensions = provider.dimensions;
    const providerModel = provider.model;

    // FirestoreVectorStore defaults to 768 (Google's text-embedding-004)
    const vectorStoreDimensions = usePersistentVectors ? 768 : 768;

    if (providerDimensions !== vectorStoreDimensions) {
      getLogger().warn(
        {
          providerModel,
          providerDimensions,
          vectorStoreDimensions,
          usePersistentVectors,
          risk: 'SEARCH_QUALITY_DEGRADED',
          recommendation:
            providerDimensions === 1536
              ? 'Consider using GOOGLE_API_KEY for matching dimensions, or update Firestore vector index'
              : 'Ensure embedding provider and vector store dimensions match',
        },
        '⚠️ Embedding dimension mismatch detected - semantic search quality may be affected'
      );
    } else {
      getLogger().debug(
        { providerModel, dimensions: providerDimensions },
        'Embedding dimensions validated successfully'
      );
    }
  } catch (error) {
    // Don't fail initialization if validation fails - just log
    getLogger().debug({ error: String(error) }, 'Could not validate embedding dimensions');
  }
}

/**
 * Initialize the complete memory system
 *
 * Auto-selects store based on environment:
 * - Development: InMemoryStore
 * - Production with GCP: FirestoreStore
 * - Production with Postgres: PostgresStore
 *
 * Vector Store Selection:
 * - Production: FirestoreVectorStore (persistent, survives restarts)
 * - Development: VectorStore (ephemeral, in-memory)
 *
 * Optional Redis cache for sessions.
 *
 * NOTE: This function is idempotent - subsequent calls return cached result.
 */
export async function initializeMemorySystem(
  config?: MemorySystemConfig
): Promise<MemorySystemResult> {
  // Return cached result if already initialized
  if (cachedMemorySystem) {
    getLogger().debug('Memory system already initialized, returning cached result');
    return cachedMemorySystem;
  }

  // If initialization is in progress, wait for it
  if (initializingPromise) {
    return initializingPromise;
  }

  // Start initialization
  initializingPromise = doInitializeMemorySystem(config);
  try {
    cachedMemorySystem = await initializingPromise;
    return cachedMemorySystem;
  } finally {
    initializingPromise = null;
  }
}

async function doInitializeMemorySystem(config?: MemorySystemConfig): Promise<MemorySystemResult> {
  getLogger().info('Initializing memory system...');

  const storeType = config?.storeType || detectStoreType();

  // Determine if we should use persistent vectors
  // Default to true in production with Firestore
  const usePersistentVectors =
    config?.usePersistentVectors ??
    (storeType === 'firestore' || process.env.NODE_ENV === 'production');

  // Initialize primary store
  // With skipFirestoreInit=true, skip the blocking initialize() call
  const skipInit = config?.skipFirestoreInit === true;
  const store = config?.store || (await createStore(storeType, skipInit));

  // Initialize vector store - use persistent Firestore store in production
  // With skipFirestoreInit=true, skip the blocking initialize() call - it happens on first use
  let vectorStore: VectorStore | FirestoreVectorStore;

  if (usePersistentVectors) {
    getLogger().info({ lazy: skipInit }, 'Using persistent FirestoreVectorStore');
    const firestoreVectorStore = getFirestoreVectorStore();
    if (!skipInit) {
      await firestoreVectorStore.initialize();
    }
    // Store will auto-initialize on first use if skipInit=true
    vectorStore = firestoreVectorStore;
  } else {
    getLogger().info('Using ephemeral in-memory VectorStore');
    const memoryVectorStore = getVectorStore();
    if (!skipInit) {
      await memoryVectorStore.initialize();
    }
    vectorStore = memoryVectorStore;
  }

  // Set the active vector store for semantic RAG operations
  setActiveVectorStore(vectorStore);

  // Validate embedding dimensions match between provider and vector store
  validateEmbeddingDimensions(usePersistentVectors);

  // Initialize Redis cache (if available)
  let redisCache: ReturnType<typeof import('./redis-cache.js').getRedisCache> | null = null;
  if (config?.enableRedis !== false) {
    redisCache = await initializeRedisCache();
  }

  // PERFORMANCE OPTIMIZATION: Enable embedding cache persistence when Redis is available
  // Embeddings are expensive (~50-100ms per generation) but stable for the same text.
  // With Redis persistence, embeddings survive container restarts and are shared across instances.
  if (redisCache && redisCache.isConnected()) {
    try {
      const { getEmbeddingCache } = await import('./embedding-cache.js');
      const embeddingCache = getEmbeddingCache({
        persistentCache: true,
        redisUrl:
          process.env.REDIS_URL ||
          `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
        ttlMs: 24 * 60 * 60 * 1000, // 24 hours - embeddings don't change
        maxSize: 15000, // Increased for production traffic
      });
      getLogger().info('🚀 Embedding cache persistence enabled via Redis');
    } catch (error) {
      getLogger().debug(
        { error: String(error) },
        'Embedding cache Redis persistence not available'
      );
    }
  }

  // Index persona content
  if (config?.indexPersona !== false) {
    try {
      await indexAllPersonaContent(vectorStore as VectorStore);
      getLogger().info('Persona content indexed');
    } catch (error) {
      getLogger().warn(
        `Failed to index persona content (embeddings may not be available): ${error}`
      );
    }
  }

  // NOTE: Rehydration is deprecated and disabled.
  // FirestoreVectorStore is persistent - embeddings survive restarts.
  // The rehydrateConversations config option is kept for backward compatibility
  // but does nothing. See rehydrateConversationEmbeddings() JSDoc for details.

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 ENTITY STORE: Initialize unified Better Than Human memory
  // This is the new entity-centric memory system that eliminates fragmentation
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { initializeEntityStoreIntegration } = await import('./entity-store/integration.js');
    await initializeEntityStoreIntegration();
    getLogger().info('✅ Entity store (Better Than Human memory) initialized');
  } catch (error) {
    // Non-fatal - legacy memory system will continue to work
    getLogger().warn(
      { error: String(error) },
      '⚠️ Entity store initialization failed (legacy memory will be used)'
    );
  }

  getLogger().info(
    `Memory system initialized (store: ${storeType}, vectors: ${usePersistentVectors ? 'persistent' : 'ephemeral'}, redis: ${!!redisCache})`
  );

  return { store, vectorStore, redisCache, storeType, usePersistentVectors };
}

// ============================================================================
// HEALTH CHECK HELPER
// ============================================================================

export interface MemorySystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  initialized: boolean;
  stores: {
    primary: { healthy: boolean; type: StoreType; details?: string };
    vector: { healthy: boolean; usingFallback: boolean; cacheSize: number; details?: string };
    redis: { enabled: boolean; healthy: boolean; details?: string };
  };
  embedding: {
    provider: string;
    dimensions: number;
    dimensionMatch: boolean;
  };
}

/**
 * Get unified health status of all memory system components.
 * Useful for monitoring dashboards and alerting.
 */
export async function getMemorySystemHealth(): Promise<MemorySystemHealth> {
  const isInit = cachedMemorySystem !== null;

  // Default unhealthy state if not initialized
  if (!isInit) {
    return {
      overall: 'unhealthy',
      initialized: false,
      stores: {
        primary: { healthy: false, type: 'memory', details: 'Not initialized' },
        vector: { healthy: false, usingFallback: true, cacheSize: 0, details: 'Not initialized' },
        redis: { enabled: false, healthy: false, details: 'Not initialized' },
      },
      embedding: {
        provider: 'unknown',
        dimensions: 0,
        dimensionMatch: false,
      },
    };
  }

  const { storeType, vectorStore, usePersistentVectors } = cachedMemorySystem!;

  // Check vector store health
  let vectorHealth: MemorySystemHealth['stores']['vector'];
  if ('getHealth' in vectorStore && typeof vectorStore.getHealth === 'function') {
    const health = vectorStore.getHealth() as {
      healthy: boolean;
      usingFallback: boolean;
      cacheSize: number;
      fallbackReason?: string;
    };
    vectorHealth = {
      healthy: health.healthy,
      usingFallback: health.usingFallback,
      cacheSize: health.cacheSize,
      details: health.usingFallback ? health.fallbackReason : undefined,
    };
  } else {
    vectorHealth = { healthy: true, usingFallback: false, cacheSize: 0 };
  }

  // Check embedding provider
  const provider = getInternalEmbeddingProvider();
  const providerDimensions = provider.dimensions;
  const expectedDimensions = usePersistentVectors ? 768 : 768;
  const dimensionMatch = providerDimensions === expectedDimensions;

  // Determine overall health
  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (vectorHealth.usingFallback) {
    overall = 'degraded';
  }
  if (!dimensionMatch) {
    overall = overall === 'healthy' ? 'degraded' : overall;
  }
  if (!vectorHealth.healthy && !vectorHealth.usingFallback) {
    overall = 'unhealthy';
  }

  return {
    overall,
    initialized: true,
    stores: {
      primary: { healthy: true, type: storeType },
      vector: vectorHealth,
      redis: {
        enabled: redisCacheEnabled,
        healthy: redisCacheEnabled, // Assume healthy if enabled
      },
    },
    embedding: {
      provider: provider.model,
      dimensions: providerDimensions,
      dimensionMatch,
    },
  };
}

// ============================================================================
// SHUTDOWN HELPER
// ============================================================================

/**
 * Gracefully shut down all memory system components
 */
export async function shutdownMemorySystem(): Promise<void> {
  getLogger().info('Shutting down memory system...');

  // Clear cached memory system
  cachedMemorySystem = null;
  initializingPromise = null;

  // Close Redis
  if (redisCacheEnabled) {
    try {
      const { resetRedisCache } = await import('./redis-cache.js');
      await resetRedisCache();
    } catch (error) {
      getLogger().warn(`Error closing Redis: ${error}`);
    }
  }

  // Close primary store based on type
  const storeType = detectStoreType();

  try {
    switch (storeType) {
      case 'firestore': {
        const { resetFirestoreStore } = await import('./firestore-store.js');
        await resetFirestoreStore();
        break;
      }
      case 'postgres': {
        const { resetPostgresStore } = await import('./postgres-store.js');
        resetPostgresStore();
        break;
      }
      case 'memory':
      default: {
        const { resetDefaultStore } = await import('./in-memory-store.js');
        await resetDefaultStore();
        break;
      }
    }
  } catch (error) {
    getLogger().warn(`Error closing store: ${error}`);
  }

  // Reset vector stores (both ephemeral and persistent)
  try {
    const { resetVectorStore } = await import('./vector-store.js');
    resetVectorStore();
  } catch (error) {
    getLogger().warn(`Error closing ephemeral vector store: ${error}`);
  }

  try {
    const { resetFirestoreVectorStore } = await import('./firestore-vector-store.js');
    void resetFirestoreVectorStore();
  } catch (error) {
    getLogger().warn(`Error closing Firestore vector store: ${error}`);
  }

  getLogger().info('Memory system shut down');
}

// ============================================================================
// MEMORY GRAPH & LIFECYCLE (Phase 2 Human-Like Memory)
// ============================================================================

// Memory Graph - Stores associative links between memories
export {
  getMemoryGraph,
  resetMemoryGraph,
  MemoryGraph,
  type LinkType,
  type MemoryLink,
  type SpreadingActivationResult,
} from './memory-graph.js';

// Spreading Activation - Human-like memory recall through graph traversal
export {
  getSpreadingActivation,
  resetSpreadingActivation,
  type ActivationResult,
  type SpreadingConfig,
} from './spreading-activation.js';

// Protection Engine - Protects important memories from decay
export {
  getProtectionEngine,
  resetProtectionEngine,
  type ProtectionLevel,
  type ProtectedMemory,
  type ProtectionConfig,
} from './protection-engine.js';

// Lifecycle Integration - Bridges lifecycle engines to storage
export {
  runLifecycleMaintenance,
  saveMemory,
  getUserMemories,
  reinforceMemory,
  createLinksForNewMemory,
  type LifecycleResult,
  type StoredMemoryDocument,
} from './lifecycle-integration.js';

// Learning Engine - Adapts based on user reactions to surfaced memories
export {
  getLearningEngine,
  resetLearningEngine,
  LearningEngine,
  type MemoryReaction,
  type SurfacingEvent,
  type UserLearnings,
  type LearningConfig,
} from './learning-engine.js';

// ============================================================================
// STORE FACTORIES (Convenience accessors)
// ============================================================================

// Store Factory - Auto-selects store based on environment
export { getStore, resetStore, setStore, getStoreSync } from './store-factory.js';

// Firestore Factory - Direct Firestore access (for legacy code)
export { getFirestore } from './firestore-factory.js';

// ============================================================================
// UNIFIED CAPTURE (Clean Architecture Entry Point - January 2026)
// ============================================================================

// Single entry point for all memory capture
export {
  captureTurnUnified,
  captureBatchUnified,
  type CaptureInput,
  type CaptureResultUnified,
} from './capture/index.js';

// ============================================================================
// UNIFIED PERSISTENCE (Clean Architecture Storage Layer)
// ============================================================================

// Unified access to all storage backends
export {
  getStore as getUnifiedStore,
  getFirestore as getUnifiedFirestore,
  getVectorStore as getUnifiedVectorStore,
  getRedisCache as getUnifiedRedisCache,
  saveDocument,
  getDocument,
  deleteDocument,
  queryDocuments,
  addVectorDocument,
  searchVectors,
  getPersistenceHealth,
} from './persistence/index.js';

// ============================================================================
// UNIFIED INITIALIZATION (Clean Architecture System Management)
// ============================================================================

// System initialization and health
export {
  initializeMemory,
  isInitialized,
  getSystem,
  getHealth,
  isHealthy,
  getStoreHealth,
  getVectorHealth,
  getRedisHealth,
  shutdown,
  detectStoreType as detectStoreTypeClean,
  shouldUseRedis as shouldUseRedisClean,
  shouldUsePersistentVectors,
  type InitConfig,
  type MemorySystem,
  type HealthStatus,
} from './init/index.js';

// ============================================================================
// UNIFIED RETRIEVAL (Clean Architecture Query Layer)
// ============================================================================

// Single entry point for memory retrieval
export {
  retrieveContext,
  semanticSearch as unifiedSemanticSearch,
  findEntity,
  getRecentContext,
  getProactiveSuggestions,
  type RetrievalOptions,
  type RetrievalResult,
  type EntityMatch,
} from './retrieval/index.js';

// ============================================================================
// MEMORY FACADE (Recommended Public API)
// ============================================================================

/**
 * 🌟 RECOMMENDED: The Memory facade provides the simplest, cleanest interface
 * for interacting with the memory system. Use this for new code.
 *
 * ```typescript
 * import { Memory } from './memory/index.js';
 *
 * await Memory.initialize();
 * await Memory.capture({ userId, sessionId, transcript, turnNumber });
 * const context = await Memory.retrieve(userId, query);
 * ```
 *
 * @see facade.ts for full documentation
 */
export { Memory, MemoryFacade } from './facade.js';
export type {
  CaptureInput as FacadeCaptureInput,
  CaptureResultUnified as FacadeCaptureResult,
} from './facade.js';

// ============================================================================
// DYNAMIC MEMORY (L1/L2/L3 Architecture - January 2026)
// ============================================================================

// Fast Capture - Real-time regex extraction (< 50ms)
export {
  fastCapture,
  detectEntityMentions,
  detectEmotionSignals,
  detectTopicHints,
  detectDateSignals,
  detectRelationshipSignals,
  type FastCaptureInput,
  type FastCaptureResult,
  type EntityMention,
  type EmotionSignal,
  type DateSignal,
  type RelationshipSignal,
} from './dynamic/fast-capture.js';

// STM Buffer - In-memory short-term context
export {
  recordTurn as recordSTMTurn,
  getSTMBuffer,
  cleanupSession as clearSTMSession,
  wasEntityMentioned,
  getEmotionalTrajectory,
  buildSTMContext,
  getFrequentEntities,
  getRecentTopics,
  getRecentTurns,
  getEntityMentionInfo,
  isTopicContinuing,
  cleanupExpiredSessions,
  getSTMStats,
  configureSTMBuffer,
  type TurnMemory,
  type EntityFrequency,
  type SessionSTM,
} from './dynamic/stm-buffer.js';

// STM Promotion - Session-end promotion to Firestore
export {
  onSessionEnd,
  promoteSessionToFirestore,
  configurePromotion,
  type PromotionConfig,
  type PromotionResult,
  type PromotedEntity,
  type PromotedEmotionalArc,
  type PromotedTopicPattern,
} from './dynamic/stm-promotion.js';

// Deep Extraction Worker - Async LLM-powered extraction
export {
  startDeepExtractionWorker,
  getDeepExtractionWorker,
  DeepExtractionWorker,
  type DeepExtractionJob,
  type ExtractedEntity as DynamicExtractedEntity,
  type ExtractedFact as DynamicExtractedFact,
  type ExtractedRelationship as DynamicExtractedRelationship,
  type ExtractionResult as DynamicExtractionResult,
} from './dynamic/deep-extraction-worker.js';

// Firestore-Spanner Sync - Background sync to L3
export {
  startSyncService,
  stopSyncService,
  getSyncStats,
  runSyncCycle,
  isSyncServiceRunning,
  configureSyncService,
  type SyncConfig,
  type SyncResult,
  type SyncStats,
} from './dynamic/firestore-spanner-sync.js';

// Dynamic Memory Metrics
export {
  getDynamicMemoryMetrics,
  getMetricsSummary,
  logMetrics as logDynamicMetrics,
  recordFastCapture,
  recordSTMState,
  recordPromotion,
  recordDeepExtraction,
  recordQueueDepth,
  recordFirestoreWrite,
  recordFirestoreRead,
  recordSyncCycle,
  resetMetrics as resetDynamicMetrics,
  type DynamicMemoryMetrics,
} from './dynamic/metrics.js';

// ============================================================================
// KNOWLEDGE GRAPH (Unified Memory Intelligence)
// ============================================================================

// Re-export everything from knowledge-graph module
export {
  // Types
  type Entity as KGEntity,
  type EntityType as KGEntityType,
  type Relationship as KGRelationship,
  type RelationshipType as KGRelationshipType,
  type Fact as KGFact,
  type FactSource,
  type TemporalMention,
  type Correlation,
  type CorrelationType,
  type EntityQuery as KGEntityQuery,
  type EntityQueryResult as KGEntityQueryResult,
  type EntityProfile,
  type ConsolidationResult as KGConsolidationResult,
  type DecayConfig as KGDecayConfig,
  type SurfacingRecommendation,
  type SurfacingReason,
  // Extractors
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
  // Services
  captureTurn,
  captureBatch,
  initializeKnowledgeCapture,
  setKnowledgeCaptureEnabled,
  isKnowledgeCaptureReady,
  type TurnCaptureInput,
  type CaptureResult as KnowledgeCaptureResult,
  executeNaturalQuery,
  detectQueryType,
  getUnifiedQueryEngine,
  type UnifiedQueryEngine,
  type QueryType,
  type QueryOptions as KGQueryOptions,
  type NaturalQueryResult,
  // Integration
  integrateContact,
  integrateCommitment,
  integrateRelationshipMention,
  processConversationTurn,
  syncFromSuperhumanService,
  migrateUserData,
  // Proactive Surfacing
  getProactiveSurfacingEngine,
  // Consolidation
  getConsolidationEngine,
  // Storage - Insights
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
  // Storage - Threads
  createThread,
  updateThread as updateKGThread,
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
  // Knowledge Graph Singleton
  getKnowledgeGraph,
  type KnowledgeGraph,
} from './knowledge-graph/index.js';

// ============================================================================
// SPANNER GRAPH (L3 Long-Term Memory)
// ============================================================================

export {
  // Schema and config
  SPANNER_CONFIG,
  TABLE_DDL,
  GRAPH_DDL,
  type GraphEntity,
  type GraphFact,
  type GraphRelationship,
  type EntityWithFacts,
  type RelationshipResult,
  // Client operations
  initializeSpanner,
  isSpannerReady,
  upsertEntity as spannerUpsertEntity,
  insertFact as spannerInsertFact,
  insertRelationship as spannerInsertRelationship,
  linkFactToEntity,
  getEntitiesByUser,
  getEntityByName,
  closeSpanner,
  // Graph queries
  getEntityWithFacts,
  getEntityRelationships,
  getExtendedNetwork,
  findEntitiesWithFactPattern,
  getImportantPeople,
} from './spanner-graph/index.js';

export default {
  initializeMemorySystem,
  shutdownMemorySystem,
  getMemorySystemHealth,
  createStore,
  detectStoreType,
  shouldUseRedis,
  initializeRedisCache,
  // NOTE: rehydrateConversationEmbeddings is deprecated and removed from default export
  // The function still exists for backward compatibility but does nothing.
};
