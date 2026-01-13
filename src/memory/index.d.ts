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
export { getDefaultStore, InMemoryStore, resetDefaultStore } from './in-memory-store.js';
export { MemoryStore, type QueryOptions, type SearchResult } from './store.js';
export { FirestoreStore, getFirestoreStore, resetFirestoreStore } from './firestore-store.js';
export { getPostgresStore, PostgresStore, resetPostgresStore } from './postgres-store.js';
export { getRedisCache, RedisCache, resetRedisCache } from './redis-cache.js';
export { cosineSimilarity, embed, embedBatch, euclideanDistance, findTopK, getEmbeddingProvider, GoogleEmbeddings, LocalEmbeddings, OpenAIEmbeddings, setEmbeddingProvider, VertexAIEmbeddings, type EmbeddingConfig, type EmbeddingProvider, type EmbeddingResult, } from './embeddings.js';
export { isVectorStore, type VectorStoreContract, type VectorDocument, type VectorFilter, type VectorSearchOptions, type VectorSearchResult, type VectorStoreStats, } from './vector-store-interface.js';
export { getVectorStore, resetVectorStore, VectorStore } from './vector-store.js';
export { FirestoreVectorStore, getFirestoreVectorStore, resetFirestoreVectorStore, } from './firestore-vector-store.js';
export { formatRAGContext, getRAGContext, hybridSearch, indexAllPersonaContent, indexConversationSummary, indexPersonaContent, ragLookup, semanticSearch, setActiveVectorStore, type RAGContext, type RAGResult, } from './semantic-rag.js';
export { batchIndexUserMemories, getUserMemoryStats, indexUserMemories, removeUserMemories, type IndexingResult, type UserMemoryCategory, } from './user-memory-indexer.js';
export { extractHumanSignals, mergeSignalsIntoMemory } from './human-signal-extractor.js';
export { extractFollowUpItems, extractOpenQuestions, generateRollingSummary, summarizeConversation, summarizeWithLLM, type ConversationTurn, type SummarizationOptions, } from './summarizer.js';
export { ConversationHistoryTracker, getActiveSessionIds, getHistoryTracker, removeHistoryTracker, type SessionHistory, type TrackedTurn, } from './history.js';
export { clearCurrentSessionMomentsGetter, getKeyMomentRetrieval, KeyMomentRetrieval, setCurrentSessionMomentsGetter, type KeyMomentMatch, } from './key-moment-retrieval.js';
export { buildMemoryIndex, clearMemoryIndex, computeMemoryEmbeddings, getConversationPrimingMemories, getIndexStats, getPersonRelatedMemories, retrieveMemories, searchMemoriesByTopic, type MemoryItem, type RetrievalConfig, type RetrievalContext, type RetrievedMemory, } from './advanced-retrieval.js';
export { all, allSettled, andThen, err, isErr, isOk, map, mapError, memoryError, ok, retry, tryAsync, trySync, unwrap, unwrapOr, type MemoryError, type MemoryErrorType, type Result, } from './result.js';
export { configureEmbeddingCacheMetrics, embedBatchCached, embedCached, EmbeddingCache, getEmbeddingCache, resetEmbeddingCache, type CachedEmbedding, type CacheStats, type EmbeddingCacheConfig, } from './embedding-cache.js';
export { configureSemanticCache, findSimilarCached, storeInSemanticCache, withSemanticCache, clearUserSemanticCache, clearAllSemanticCaches, invalidateSemanticCache, getSemanticCacheStats, resetSemanticCacheStats, getUserCacheInfo, type CachedQuery, type SemanticCacheConfig, type CacheStats as SemanticCacheStats, type CacheLookupResult, } from './semantic-memory-cache.js';
export { configurePredictiveWarming, configureMemoryRetrieval, setupMemoryFetcher, detectTimeSignals, predictQueries, warmCacheForSession, warmCacheForHandoff, type PersonaId as PredictivePersonaId, type TimeOfDay, type DayOfWeek, type SessionSignals, type PredictedQuery, type WarmingResult, type PredictiveCacheConfig, type MemoryRetrievalFn, } from './predictive-cache-warming.js';
export { getMemoryConsolidator, MemoryConsolidator, resetMemoryConsolidator, type ConsolidatedMemory, type ConsolidationConfig, type ConsolidationResult, } from './memory-consolidator.js';
export { getMemoryDecayManager, MemoryDecayManager, resetMemoryDecayManager, type DecayingMemory, type DecayResult, type MemoryDecayConfig, type PruneResult, } from './memory-decay.js';
export { getRetrievalExplainer, resetRetrievalExplainer, RetrievalExplainer, type ConnectionType, type ExplainedMemory, } from './retrieval-explanations.js';
export { getSessionPrimer, resetSessionPrimer, SessionPrimer, type EmotionalContext, type OpenThread, type PendingFollowUp, type RelationshipContext, type SessionPrimingConfig, type SessionPrimingResult, } from './session-priming.js';
export { getMemoryDeduplicator, MemoryDeduplicator, resetMemoryDeduplicator, type DeduplicationConfig, type DeduplicationStats, type DuplicateCheckResult, type MergeResult, } from './memory-deduplication.js';
export { exactJaccardSimilarity, findDuplicatesLSH, isNativeLshAvailable, LSHIndex, type DuplicatePair, type LSHConfig, } from './lsh-deduplication.js';
export { batchEuclideanDistance, batchEuclideanDistanceF32, euclideanDistanceF32, normalizeVector, normalizeVectorF32, batchNormalizeVectorsF32, vectorNormF32, computeCentroidF32, batchCosineSimilarity, isRustAvailable, } from './rust-accelerator.js';
export { checkMemoryHealthAlerts, collectMemoryMetrics, getMemoryMetricsCollector, MemoryMetricsCollector, resetMemoryMetricsCollector, type DeduplicationMetrics, type EmbeddingMetrics, type IndexMetrics, type MemoryMetrics, type MetricAlert, type MetricThresholds, type RetrievalMetrics, type StorageMetrics, } from './memory-metrics.js';
export { clearAccessRecords, getFromHotTier, getMemoriesTiered, getMemoryTiered, getTieredMemoryConfig, getTieredMemoryStats, getUserAccessRecords, recordMemoryAccess, removeFromHotTier, resetTieredMemoryStats, runDemotionCheck, setTieredMemoryConfig, storeInHotTier, type MemoryAccessRecord, type TieredMemoryConfig, type TieredMemoryStats, } from './tiered-memory-storage.js';
export { areEmotionalMemoryEnginesConfigured, clearAllUnifiedEmotionalMemories, clearUnifiedEmotionalMemory, configureEmotionalMemoryEngines, getUnifiedEmotionalMemory, UnifiedEmotionalMemory, type EmotionalBond, type EmotionalCheckIn, type EmotionalContext as UnifiedEmotionalContext, type EmotionalMemoryConfig, type EmotionalMemoryEngineFactories, type EmotionalMoment, type EmotionalPattern, type BondingEngine, type UserEmotionEngine, type RelationshipStage, type UnifiedEmotionalState, type UserEmotionalContext, type UserEmotionalMoment, } from './emotional-memory-unified.js';
export type { MemoryItem as IMemoryItem, RetrievedMemory as IRetrievedMemory, RetrievalContext as IRetrievalContext, ExplainedMemory as IExplainedMemory, ConnectionType as IConnectionType, VectorDocument as IVectorDocument, VectorSearchOptions as IVectorSearchOptions, VectorSearchResult as IVectorSearchResult, DecayResult as IDecayResult, AssociativeTrigger, TriggeredMemory, AssociativeMemoryService, PreferenceDimension, InteractionPreference, ApproachGuidance, CommunicationPreferencesService, PatternType, BehavioralPattern, BehavioralPatternDetector, EmotionalThread, SessionEmotionalContext, EmotionalThreadingService, ExtractedSignals, HumanSignalExtractor, ReferenceStyle, GeneratedReference, NaturalReferenceGenerator, OrchestratedMemory, RecallContext, MemoryOrchestrator, MemoryContainer, MemoryContainerConfig, } from './interfaces/index.js';
export { AssociativeMemory, getAssociativeMemory, saveAssociativeMemory, clearAssociativeMemory, } from './associative-memory.js';
export { CommunicationPreferences, getCommunicationPreferences, resetCommunicationPreferences, } from './communication-preferences.js';
export { LLMSignalExtractor, getLLMSignalExtractor, resetLLMSignalExtractor, configureLLMSignalExtractor, } from './llm-signal-extractor.js';
export { NaturalReferenceGeneratorImpl, getNaturalReferenceGenerator, resetNaturalReferenceGenerator, generateNaturalReference, } from './natural-reference-generator.js';
export { EmotionalThreading, getEmotionalThreading, resetEmotionalThreading, } from './emotional-threading.js';
export { BehavioralPatternDetectorImpl, getBehavioralPatternDetector, loadPatternsFromPersistence, savePatternsToPeristence, resetBehavioralPatternDetector, } from './behavioral-pattern-detector.js';
export { FirestoreMemoryPersistence, getFirestoreMemoryPersistence, resetFirestoreMemoryPersistence, } from './firestore-memory-persistence.js';
export { configureFirestoreExtended, saveSessionState, getSessionState, getRecentSessions, type SessionState, logToolExecution, getToolExecutions, type ToolExecution, savePersonaBond, getPersonaBond, getAllPersonaBonds, type PersonaBond, saveVoiceProfile, getVoiceProfile, type VoiceProfile, logUserIntent, getRecentIntents, type UserIntent, setCachedInsight, getCachedInsight, type CachedInsight, saveQualityMetrics, getQualityMetrics, type QualityMetrics, deleteAllExtendedUserData, } from './firestore-extended-persistence.js';
export { MemoryOrchestratorImpl, getMemoryOrchestrator, resetMemoryOrchestrator, } from './orchestrator.js';
export { routeSignalsToSuperhuman } from './superhuman-signal-router.js';
export { type Entity, type EntityType, type EntitySource, type RelationshipType, type Mention, type MentionType, type ExtractedFact, type EntityRelationship, type EdgeType, type EntityQuery, type EntityQueryResult, type PersonCaptureInput, type CaptureContext, type CaptureResult, createEntity, getEntity, updateEntity, deleteEntity, findEntityByAlias, searchEntities, getAllEntities, getEntitiesByType, createMention, getMentionsForEntity, getRecentMentions, upsertRelationship, getRelationshipsForEntity, recordMention, hasEntityStore, getEntityStoreStats, resolvePerson, mergeEntities, whatDoWeKnowAbout, type ResolvedEntity, isEntityStoreReady, initializeEntityStore, capturePersonEntity, captureMultiplePeople, findContactForTelephony, getAllContacts, getEntityStoreHealth, migrateUser, migrateAllUsers, } from './entity-store/index.js';
import type { MemoryStore } from './store.js';
/**
 * Storage backend type
 */
export type StoreType = 'memory' | 'firestore' | 'postgres';
/**
 * Detect the appropriate store type based on environment
 */
export declare function detectStoreType(): StoreType;
/**
 * Create the appropriate store based on environment
 * @param type - Store type to create
 * @param skipInit - If true, skip initialization (for lazy loading)
 */
export declare function createStore(type?: StoreType, skipInit?: boolean): Promise<MemoryStore>;
/**
 * Check if Redis cache should be enabled
 */
export declare function shouldUseRedis(): boolean;
/**
 * Initialize Redis cache (optional)
 */
export declare function initializeRedisCache(): Promise<ReturnType<typeof import('./redis-cache.js').getRedisCache> | null>;
/**
 * Check if Redis cache is enabled
 */
export declare function isRedisCacheEnabled(): boolean;
import { type FirestoreVectorStore } from './firestore-vector-store.js';
import { type VectorStore } from './vector-store.js';
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
export declare function rehydrateConversationEmbeddings(_store: MemoryStore, _vectorStore: VectorStore | FirestoreVectorStore): Promise<number>;
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
export declare function initializeMemorySystem(config?: MemorySystemConfig): Promise<MemorySystemResult>;
export interface MemorySystemHealth {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    initialized: boolean;
    stores: {
        primary: {
            healthy: boolean;
            type: StoreType;
            details?: string;
        };
        vector: {
            healthy: boolean;
            usingFallback: boolean;
            cacheSize: number;
            details?: string;
        };
        redis: {
            enabled: boolean;
            healthy: boolean;
            details?: string;
        };
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
export declare function getMemorySystemHealth(): Promise<MemorySystemHealth>;
/**
 * Gracefully shut down all memory system components
 */
export declare function shutdownMemorySystem(): Promise<void>;
declare const _default: {
    initializeMemorySystem: typeof initializeMemorySystem;
    shutdownMemorySystem: typeof shutdownMemorySystem;
    getMemorySystemHealth: typeof getMemorySystemHealth;
    createStore: typeof createStore;
    detectStoreType: typeof detectStoreType;
    shouldUseRedis: typeof shouldUseRedis;
    initializeRedisCache: typeof initializeRedisCache;
    rehydrateConversationEmbeddings: typeof rehydrateConversationEmbeddings;
};
export default _default;
//# sourceMappingURL=index.d.ts.map