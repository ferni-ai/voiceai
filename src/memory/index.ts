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
  type VectorDocument,
  type VectorFilter,
  type VectorSearchOptions,
  type VectorSearchResult,
  type VectorStoreContract,
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

// Human Signal Extractor (conversation → human memory)
export { extractHumanSignals, mergeSignalsIntoMemory } from './human-signal-extractor.js';

// Spreading Activation (human-like memory associations)
export {
  getSpreadingActivation,
  SpreadingActivationEngine,
  type ActivationResult,
  type SpreadingConfig,
} from './spreading-activation.js';

// Learning Engine (track user reactions to surfaced memories)
export {
  getLearningEngine,
  LearningEngine,
  resetLearningEngine,
  type MemoryReaction,
  type SurfacingEvent,
  type UserLearnings,
} from './learning-engine.js';

// History Tracker Stubs (legacy - history tracking is now handled by session state)
// These are no-op stubs for backward compatibility
// Uses ConversationTurn from summarizer.ts (re-exported below)
import { type ConversationTurn as SummarizerTurn } from './summarizer.js';

export interface HistoryMetadata {
  startTime?: Date;
  topicsDiscussed?: string[];
  emotionalJourney?: Array<{ emotion: string; timestamp: Date }>;
}

export interface ConversationHistoryTracker {
  sessionId: string;
  userId: string;
  addUserTurn: (content: string, timestamp?: Date) => void;
  addAssistantTurn: (content: string, timestamp?: Date) => void;
  getTurnCount: () => number;
  getSessionHistory: () => {
    entries?: SummarizerTurn[];
    turns?: SummarizerTurn[];
    metadata?: HistoryMetadata;
  };
  getRecentHistory: (count: number) => SummarizerTurn[];
  getSimpleTurns: () => SummarizerTurn[];
  getDurationSeconds: () => number;
}

const historyTrackers = new Map<string, ConversationHistoryTracker>();

export function getHistoryTracker(sessionId: string, userId: string): ConversationHistoryTracker {
  const key = `${sessionId}-${userId}`;
  if (!historyTrackers.has(key)) {
    const startTime = new Date();
    const turns: SummarizerTurn[] = [];

    historyTrackers.set(key, {
      sessionId,
      userId,
      addUserTurn(content: string, timestamp?: Date): void {
        turns.push({ role: 'user', content, timestamp: timestamp || new Date() });
      },
      addAssistantTurn(content: string, timestamp?: Date): void {
        turns.push({ role: 'assistant', content, timestamp: timestamp || new Date() });
      },
      getTurnCount(): number {
        return turns.length;
      },
      getSessionHistory(): {
        entries?: SummarizerTurn[];
        turns?: SummarizerTurn[];
        metadata?: HistoryMetadata;
      } {
        return {
          entries: [...turns],
          turns: [...turns],
          metadata: { startTime, topicsDiscussed: [], emotionalJourney: [] },
        };
      },
      getRecentHistory(count: number): SummarizerTurn[] {
        return turns.slice(-count);
      },
      getSimpleTurns(): SummarizerTurn[] {
        return [...turns];
      },
      getDurationSeconds(): number {
        return Math.floor((Date.now() - startTime.getTime()) / 1000);
      },
    });
  }
  return historyTrackers.get(key)!;
}

export function removeHistoryTracker(sessionId: string): void {
  // Remove any trackers with this sessionId
  for (const [key] of historyTrackers) {
    if (key.startsWith(`${sessionId}-`)) {
      historyTrackers.delete(key);
    }
  }
}

// Protection Engine (protect important memories from decay)
export {
  getProtectionEngine,
  ProtectionEngine,
  resetProtectionEngine,
  type ProtectedMemory,
  type ProtectionLevel,
} from './protection-engine.js';

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

// History tracking is handled by session state in services layer

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
  clearAllSemanticCaches,
  clearUserSemanticCache,
  configureSemanticCache,
  findSimilarCached,
  getSemanticCacheStats,
  getUserCacheInfo,
  invalidateSemanticCache,
  resetSemanticCacheStats,
  storeInSemanticCache,
  withSemanticCache,
  type CachedQuery,
  type CacheLookupResult,
  type SemanticCacheConfig,
  type CacheStats as SemanticCacheStats,
} from './semantic-memory-cache.js';

// Predictive Cache Warming (80%+ cache hit rate for anticipated queries)
export {
  configureMemoryRetrieval,
  configurePredictiveWarming,
  detectTimeSignals,
  predictQueries,
  setupMemoryFetcher,
  warmCacheForHandoff,
  warmCacheForSession,
  type DayOfWeek,
  type MemoryRetrievalFn,
  type PredictedQuery,
  type PredictiveCacheConfig,
  type PersonaId as PredictivePersonaId,
  type SessionSignals,
  type TimeOfDay,
  type WarmingResult,
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
  // Cosine similarity (already Rust-accelerated)
  batchCosineSimilarity,
  // Euclidean distance (SIMD-accelerated for batches)
  batchEuclideanDistance,
  batchEuclideanDistanceF32,
  batchNormalizeVectorsF32,
  // Centroid computation (SIMD-accelerated)
  computeCentroidF32,
  euclideanDistanceF32,
  // Native module availability check
  isRustAvailable,
  // Vector normalization (SIMD-accelerated)
  normalizeVector,
  normalizeVectorF32,
  vectorNormF32,
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
  type BondingEngine,
  type EmotionalBond,
  type EmotionalCheckIn,
  type EmotionalMemoryConfig,
  type EmotionalMemoryEngineFactories,
  type EmotionalMoment,
  type EmotionalPattern,
  type RelationshipStage,
  type EmotionalContext as UnifiedEmotionalContext,
  type UnifiedEmotionalState,
  type UserEmotionalContext,
  type UserEmotionalMoment,
  type UserEmotionEngine,
} from './emotional-memory-unified.js';

// ============================================================================
// NEW: ENHANCED HUMAN-CENTRIC MEMORY SYSTEMS
// ============================================================================

// Clean Architecture Interfaces
export type {
  ApproachGuidance,
  AssociativeMemoryService,
  // Associative Memory
  AssociativeTrigger,
  BehavioralPattern,
  BehavioralPatternDetector,
  CommunicationPreferencesService,
  // Emotional Threading
  EmotionalThread,
  EmotionalThreadingService,
  // Signal Extraction
  ExtractedSignals,
  GeneratedReference,
  HumanSignalExtractor,
  ConnectionType as IConnectionType,
  DecayResult as IDecayResult,
  ExplainedMemory as IExplainedMemory,
  // Core types (renamed to avoid conflicts with existing exports)
  MemoryItem as IMemoryItem,
  InteractionPreference,
  RetrievalContext as IRetrievalContext,
  RetrievedMemory as IRetrievedMemory,
  VectorDocument as IVectorDocument,
  VectorSearchOptions as IVectorSearchOptions,
  VectorSearchResult as IVectorSearchResult,
  MemoryOrchestrator,
  NaturalReferenceGenerator,
  // Orchestrator
  OrchestratedMemory,
  // Behavioral Patterns
  PatternType,
  // Communication Preferences
  PreferenceDimension,
  RecallContext,
  // Natural References
  ReferenceStyle,
  SessionEmotionalContext,
  TriggeredMemory,
} from './interfaces/index.js';

// Associative Memory (human-like memory triggers)
export {
  AssociativeMemory,
  clearAssociativeMemory,
  getAssociativeMemory,
  saveAssociativeMemory,
} from './associative-memory.js';

// Communication Preferences (how users like to be approached)
export {
  CommunicationPreferences,
  getCommunicationPreferences,
  resetCommunicationPreferences,
} from './communication-preferences.js';

// LLM Signal Extraction (smarter than regex)
export {
  configureLLMSignalExtractor,
  getLLMSignalExtractor,
  LLMSignalExtractor,
  resetLLMSignalExtractor,
} from './llm-signal-extractor.js';

// Natural Reference Generator (human-sounding memory callbacks)
export {
  generateNaturalReference,
  getNaturalReferenceGenerator,
  NaturalReferenceGeneratorImpl,
  resetNaturalReferenceGenerator,
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
  resetBehavioralPatternDetector,
  savePatternsToPeristence,
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
  // GDPR
  deleteAllExtendedUserData,
  getAllPersonaBonds,
  getCachedInsight,
  getPersonaBond,
  getQualityMetrics,
  getRecentIntents,
  getRecentSessions,
  getSessionState,
  getToolExecutions,
  getVoiceProfile,
  // Tool execution logs
  logToolExecution,
  // User intents
  logUserIntent,
  // Persona bonds
  savePersonaBond,
  // Quality metrics
  saveQualityMetrics,
  // Session state
  saveSessionState,
  // Voice profile
  saveVoiceProfile,
  // Superhuman cache
  setCachedInsight,
  type CachedInsight,
  type PersonaBond,
  type QualityMetrics,
  type SessionState,
  type ToolExecution,
  type UserIntent,
  type VoiceProfile,
} from './firestore-extended-persistence.js';

// Memory Orchestrator (unified entry point)
export {
  getMemoryOrchestrator,
  MemoryOrchestratorImpl,
  resetMemoryOrchestrator,
} from './orchestrator.js';

// Superhuman Signal Router (routes extracted signals to superhuman services)
export { routeSignalsToSuperhuman } from './superhuman-signal-router.js';

// ============================================================================
// UNIFIED MEMORY STORE (Superhuman Memory Phase 1)
// ============================================================================
//
// The unified memory store provides a single interface for all memory operations
// across multiple storage backends (Firestore, Vector, Redis, In-Memory).
//
// Usage:
//   import { getUnifiedStore } from './memory/unified-store';
//   const store = getUnifiedStore();
//   await store.initialize();
//   const memory = await store.store({ userId, type: 'entity', content: '...' });
//   const result = await store.recall({ userId, query: '...' });
//
// This is part of the Superhuman Memory implementation (Phase 1).
// See docs/plans/SUPERHUMAN-MEMORY-IMPLEMENTATION-PLAN.md

export {
  // Main entry point
  getUnifiedStore,
  resetUnifiedStore,
  UnifiedMemoryStoreFacade,

  // Configuration
  DEFAULT_CONFIG,

  // Adapters (for advanced use cases)
  FirestoreAdapter,
  getFirestoreAdapter,
  VectorAdapter,
  getVectorAdapter,
  RedisAdapter,
  getRedisAdapter,
  MemoryAdapter,
  getMemoryAdapter,
} from './unified-store/index.js';

// Types from unified store
export type {
  UnifiedMemoryStore,
  UnifiedStoreConfig,
  UnifiedStoreHealth,
  StoredMemory,
  MemoryInput,
  MemoryType as UnifiedMemoryType,
  RecallQuery,
  RecallResult,
  SearchParams as UnifiedSearchParams,
  SearchResult as UnifiedSearchResult,
  ScoredMemory,
  MemoryLink,
  MemoryLinkInput,
  MemoryLinkType,
  ConsolidationReport as UnifiedConsolidationReport,
  DecayReport as UnifiedDecayReport,
  StoreHealth,
  MemoryStoreAdapter,
  VectorStoreAdapter as UnifiedVectorStoreAdapter,
  CacheStoreAdapter,
} from './unified-store/index.js';

// Graph module exports
export {
  LINK_TYPE_CONFIGS,
  LINK_DETECTION_RULES,
  detectLinks,
  applyLinkDecay,
  calculateReinforcementBoost,
  cosineSimilarity as linkCosineSimilarity,
  FirestoreLinkStore,
  getFirestoreLinkStore,
  LinkManager,
  getLinkManager,
} from './unified-store/graph/index.js';

export type {
  LinkTypeConfig,
  LinkDetectionRule,
  LinkManagerConfig,
  GraphTraversalResult,
  MaintenanceReport as LinkMaintenanceReport,
} from './unified-store/graph/index.js';

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
  captureMultiplePeople,
  capturePersonEntity,
  // Storage
  createEntity,
  createMention,
  deleteEntity,
  findContactForTelephony,
  findEntityByAlias,
  getAllContacts,
  getAllEntities,
  getEntitiesByType,
  getEntity,
  getEntityStoreHealth,
  getEntityStoreStats,
  getMentionsForEntity,
  getRecentMentions,
  getRelationshipsForEntity,
  hasEntityStore,
  initializeEntityStore,
  // Integration
  isEntityStoreReady,
  mergeEntities,
  migrateAllUsers,
  // Migration
  migrateUser,
  recordMention,
  // Resolver
  resolvePerson,
  searchEntities,
  updateEntity,
  upsertRelationship,
  whatDoWeKnowAbout,
  type CaptureContext,
  type CaptureResult,
  type EdgeType,
  // Types
  type Entity,
  type EntityQuery,
  type EntityQueryResult,
  type EntityRelationship,
  type EntitySource,
  type EntityType,
  type ExtractedFact,
  type Mention,
  type MentionType,
  type PersonCaptureInput,
  type RelationshipType,
  type ResolvedEntity,
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

export default {
  initializeMemorySystem,
  shutdownMemorySystem,
  getMemorySystemHealth,
  createStore,
  detectStoreType,
  shouldUseRedis,
  initializeRedisCache,
  rehydrateConversationEmbeddings,
};
