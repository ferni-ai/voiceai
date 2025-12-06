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
 */

// Store interfaces and implementations
export { MemoryStore, type QueryOptions, type SearchResult } from './store.js';
export { InMemoryStore, getDefaultStore, resetDefaultStore } from './in-memory-store.js';

// Production stores
export { FirestoreStore, getFirestoreStore, resetFirestoreStore } from './firestore-store.js';
export { PostgresStore, getPostgresStore, resetPostgresStore } from './postgres-store.js';
export { RedisCache, getRedisCache, resetRedisCache } from './redis-cache.js';

// Embeddings
export {
  embed,
  embedBatch,
  cosineSimilarity,
  euclideanDistance,
  findTopK,
  getEmbeddingProvider,
  setEmbeddingProvider,
  OpenAIEmbeddings,
  GoogleEmbeddings,
  VertexAIEmbeddings,
  LocalEmbeddings,
  type EmbeddingProvider,
  type EmbeddingResult,
  type EmbeddingConfig,
} from './embeddings.js';

// Vector store (in-memory fallback)
export {
  VectorStore,
  getVectorStore,
  resetVectorStore,
  type VectorDocument,
  type VectorSearchResult,
  type VectorFilter,
} from './vector-store.js';

// Persistent vector store (Firestore-backed)
export {
  FirestoreVectorStore,
  getFirestoreVectorStore,
  resetFirestoreVectorStore,
} from './firestore-vector-store.js';

// Semantic RAG
export {
  indexPersonaContent,
  indexAllPersonaContent,
  indexConversationSummary,
  semanticSearch,
  getRAGContext,
  formatRAGContext,
  hybridSearch,
  ragLookup,
  setActiveVectorStore,
  type RAGResult,
  type RAGContext,
} from './semantic-rag.js';

// Summarization
export {
  summarizeConversation,
  summarizeWithLLM,
  generateRollingSummary,
  extractOpenQuestions,
  extractFollowUpItems,
  type ConversationTurn,
  type SummarizationOptions,
} from './summarizer.js';

// History tracking
export {
  ConversationHistoryTracker,
  getHistoryTracker,
  removeHistoryTracker,
  getActiveSessionIds,
  type TrackedTurn,
  type SessionHistory,
} from './history.js';

// Key Moment Retrieval
export {
  KeyMomentRetrieval,
  getKeyMomentRetrieval,
  setCurrentSessionMomentsGetter,
  clearCurrentSessionMomentsGetter,
  type KeyMomentMatch,
} from './key-moment-retrieval.js';

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
 */
export async function createStore(type?: StoreType): Promise<MemoryStore> {
  const storeType = type || detectStoreType();

  getLogger().info(`Creating ${storeType} store...`);

  switch (storeType) {
    case 'firestore': {
      const { getFirestoreStore } = await import('./firestore-store.js');
      const store = getFirestoreStore();
      await store.initialize();
      return store;
    }

    case 'postgres': {
      const { getPostgresStore } = await import('./postgres-store.js');
      const store = getPostgresStore();
      await store.initialize();
      return store;
    }

    case 'memory':
    default: {
      const { getDefaultStore } = await import('./in-memory-store.js');
      const store = getDefaultStore();
      await store.initialize();
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

import { getVectorStore, type VectorStore } from './vector-store.js';
import { getFirestoreVectorStore, type FirestoreVectorStore } from './firestore-vector-store.js';
import { indexAllPersonaContent, setActiveVectorStore } from './semantic-rag.js';

export interface MemorySystemConfig {
  store?: MemoryStore;
  storeType?: StoreType;
  enableRedis?: boolean;
  indexPersona?: boolean;
  /** Use persistent Firestore vector store instead of ephemeral in-memory */
  usePersistentVectors?: boolean;
  /** Rehydrate conversation embeddings from Firestore on startup */
  rehydrateConversations?: boolean;
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
 */
export async function initializeMemorySystem(
  config?: MemorySystemConfig
): Promise<MemorySystemResult> {
  getLogger().info('Initializing memory system...');

  const storeType = config?.storeType || detectStoreType();

  // Determine if we should use persistent vectors
  // Default to true in production with Firestore
  const usePersistentVectors =
    config?.usePersistentVectors ??
    (storeType === 'firestore' || process.env.NODE_ENV === 'production');

  // Initialize primary store
  const store = config?.store || (await createStore(storeType));

  // Initialize vector store - use persistent Firestore store in production
  let vectorStore: VectorStore | FirestoreVectorStore;
  if (usePersistentVectors) {
    getLogger().info('Using persistent FirestoreVectorStore');
    const firestoreVectorStore = getFirestoreVectorStore();
    await firestoreVectorStore.initialize();
    vectorStore = firestoreVectorStore;
  } else {
    getLogger().info('Using ephemeral in-memory VectorStore');
    const memoryVectorStore = getVectorStore();
    await memoryVectorStore.initialize();
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
