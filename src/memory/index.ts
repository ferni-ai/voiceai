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

/**
 * Rehydrate conversation embeddings from Firestore into vector store
 * This ensures semantic search works across server restarts
 */
export async function rehydrateConversationEmbeddings(
  store: MemoryStore,
  vectorStore: VectorStore | FirestoreVectorStore
): Promise<number> {
  getLogger().info('Rehydrating conversation embeddings from storage...');

  let rehydratedCount = 0;

  try {
    // Get all user profiles (with pagination for scale)
    const profiles = await store.listProfiles({ limit: 500 });

    for (const profile of profiles) {
      try {
        // Get summaries for this user
        const summaries = await store.getSummaries(profile.id, { limit: 100 });

        for (const summary of summaries) {
          // Only rehydrate if summary has an embedding
          if (summary.embedding && summary.embedding.length > 0) {
            const summaryText = [
              ...summary.mainTopics,
              ...summary.keyPoints,
              summary.emotionalArc,
            ].join(' ');

            // Add to vector store (either persistent or in-memory)
            if ('addDocument' in vectorStore) {
              await vectorStore.addDocument({
                id: `conversation_${summary.id}`,
                text: summaryText,
                embedding: summary.embedding,
                metadata: {
                  source: 'conversation',
                  category: 'summary',
                  userId: profile.id,
                  topics: summary.mainTopics,
                  timestamp: summary.timestamp,
                },
              });
              rehydratedCount++;
            }
          }
        }
      } catch (profileError) {
        getLogger().debug(`Error rehydrating for user ${profile.id}: ${profileError}`);
      }
    }

    getLogger().info(`Rehydrated ${rehydratedCount} conversation embeddings`);
  } catch (error) {
    getLogger().warn(`Conversation rehydration failed (non-blocking): ${error}`);
  }

  return rehydratedCount;
}

// Cache for memory system result (idempotent initialization)
let cachedMemorySystem: MemorySystemResult | null = null;
let initializingPromise: Promise<MemorySystemResult> | null = null;

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

  // Initialize Redis cache (if available)
  let redisCache: ReturnType<typeof import('./redis-cache.js').getRedisCache> | null = null;
  if (config?.enableRedis !== false) {
    redisCache = await initializeRedisCache();
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

  // Rehydrate conversation embeddings from storage
  // This ensures semantic search for past conversations works after restart
  if (config?.rehydrateConversations !== false) {
    try {
      const rehydrated = await rehydrateConversationEmbeddings(store, vectorStore);
      if (rehydrated > 0) {
        getLogger().info(`Rehydrated ${rehydrated} conversation embeddings for semantic search`);
      }
    } catch (error) {
      getLogger().warn(`Conversation embedding rehydration failed (non-blocking): ${error}`);
    }
  }

  getLogger().info(
    `Memory system initialized (store: ${storeType}, vectors: ${usePersistentVectors ? 'persistent' : 'ephemeral'}, redis: ${!!redisCache})`
  );

  return { store, vectorStore, redisCache, storeType, usePersistentVectors };
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

export default {
  initializeMemorySystem,
  shutdownMemorySystem,
  createStore,
  detectStoreType,
  shouldUseRedis,
  initializeRedisCache,
  rehydrateConversationEmbeddings,
};
