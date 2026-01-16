/**
 * Vector Store Factory
 *
 * Creates and manages vector store instances based on configuration.
 * Supports seamless switching between backends (Firestore, Pinecone, etc.)
 *
 * Usage:
 * ```typescript
 * // Get default store (Firestore)
 * const store = getVectorStore();
 *
 * // Get store with specific config
 * const store = getVectorStore({ backend: 'pinecone', ... });
 *
 * // Use the store
 * await store.upsert({ id, vector, metadata });
 * const results = await store.search(queryVector, { topK: 10 });
 * ```
 *
 * @module memory/vector-store/factory
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  IVectorStore,
  VectorStoreConfig,
  VectorStoreBackend,
} from './types.js';
import { DEFAULT_VECTOR_CONFIG } from './types.js';

const log = createLogger({ module: 'vector-store-factory' });

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const instances = new Map<string, IVectorStore>();

/**
 * Generate a cache key for the vector store instance
 */
function getCacheKey(config: VectorStoreConfig): string {
  switch (config.backend) {
    case 'firestore':
      return `firestore:${config.collection}`;
    case 'pinecone':
      return `pinecone:${config.indexName}`;
    case 'weaviate':
      return `weaviate:${config.className}`;
    case 'qdrant':
      return `qdrant:${config.collectionName}`;
    case 'memory':
      return 'memory:default';
    default:
      return `unknown:${Date.now()}`;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Get a vector store instance.
 *
 * Returns singleton instance for each configuration.
 * Default is Firestore backend.
 *
 * @param config - Vector store configuration (optional, defaults to Firestore)
 * @returns Vector store instance
 */
export function getVectorStore(config?: Partial<VectorStoreConfig>): IVectorStore {
  const resolvedConfig: VectorStoreConfig = {
    ...DEFAULT_VECTOR_CONFIG,
    ...config,
  } as VectorStoreConfig;

  const cacheKey = getCacheKey(resolvedConfig);

  // Return existing instance if available
  if (instances.has(cacheKey)) {
    return instances.get(cacheKey)!;
  }

  // Create new instance based on backend
  let store: IVectorStore;

  switch (resolvedConfig.backend) {
    case 'firestore': {
      const { FirestoreVectorStore } = require('./firestore-vector-store.js');
      store = new FirestoreVectorStore(resolvedConfig);
      break;
    }

    case 'pinecone': {
      // TODO: Implement Pinecone adapter when needed
      log.warn('Pinecone backend not yet implemented, falling back to memory');
      const { MemoryVectorStore } = require('./memory-vector-store.js');
      store = new MemoryVectorStore(resolvedConfig);
      break;
    }

    case 'weaviate': {
      // TODO: Implement Weaviate adapter when needed
      log.warn('Weaviate backend not yet implemented, falling back to memory');
      const { MemoryVectorStore } = require('./memory-vector-store.js');
      store = new MemoryVectorStore(resolvedConfig);
      break;
    }

    case 'qdrant': {
      // TODO: Implement Qdrant adapter when needed
      log.warn('Qdrant backend not yet implemented, falling back to memory');
      const { MemoryVectorStore } = require('./memory-vector-store.js');
      store = new MemoryVectorStore(resolvedConfig);
      break;
    }

    case 'memory': {
      const { MemoryVectorStore } = require('./memory-vector-store.js');
      store = new MemoryVectorStore(resolvedConfig);
      break;
    }

    default: {
      log.error({ backend: (resolvedConfig as VectorStoreConfig).backend }, 'Unknown vector store backend');
      const { MemoryVectorStore } = require('./memory-vector-store.js');
      store = new MemoryVectorStore(resolvedConfig);
    }
  }

  // Cache the instance
  instances.set(cacheKey, store);
  log.debug({ backend: store.backend, cacheKey }, 'Created vector store instance');

  return store;
}

/**
 * Get the configured backend from environment variables
 */
export function getConfiguredBackend(): VectorStoreBackend {
  const backend = process.env.VECTOR_STORE_BACKEND as VectorStoreBackend | undefined;

  if (backend && ['firestore', 'pinecone', 'weaviate', 'qdrant', 'memory'].includes(backend)) {
    return backend;
  }

  return 'firestore'; // Default
}

/**
 * Create a vector store from environment configuration
 */
export function createVectorStoreFromEnv(): IVectorStore {
  const backend = getConfiguredBackend();

  switch (backend) {
    case 'pinecone':
      return getVectorStore({
        backend: 'pinecone',
        apiKey: process.env.PINECONE_API_KEY ?? '',
        environment: process.env.PINECONE_ENVIRONMENT ?? '',
        indexName: process.env.PINECONE_INDEX ?? 'ferni-embeddings',
        dimension: parseInt(process.env.VECTOR_DIMENSION ?? '768', 10),
      });

    case 'weaviate':
      return getVectorStore({
        backend: 'weaviate',
        host: process.env.WEAVIATE_HOST ?? 'localhost',
        scheme: (process.env.WEAVIATE_SCHEME as 'http' | 'https') ?? 'http',
        apiKey: process.env.WEAVIATE_API_KEY,
        className: process.env.WEAVIATE_CLASS ?? 'FerniEmbedding',
        dimension: parseInt(process.env.VECTOR_DIMENSION ?? '768', 10),
      });

    case 'qdrant':
      return getVectorStore({
        backend: 'qdrant',
        host: process.env.QDRANT_HOST ?? 'localhost',
        port: parseInt(process.env.QDRANT_PORT ?? '6333', 10),
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: process.env.QDRANT_COLLECTION ?? 'ferni_embeddings',
        dimension: parseInt(process.env.VECTOR_DIMENSION ?? '768', 10),
      });

    case 'memory':
      return getVectorStore({ backend: 'memory' });

    default:
      return getVectorStore({ backend: 'firestore' });
  }
}

/**
 * Close all vector store instances
 */
export async function closeAllVectorStores(): Promise<void> {
  for (const [key, store] of instances.entries()) {
    try {
      await store.close();
      log.debug({ key }, 'Closed vector store');
    } catch (error) {
      log.error({ error: String(error), key }, 'Failed to close vector store');
    }
  }
  instances.clear();
}

/**
 * Get health status for all active vector stores
 */
export async function getAllVectorStoreHealth(): Promise<Map<string, Awaited<ReturnType<IVectorStore['getHealth']>>>> {
  const health = new Map<string, Awaited<ReturnType<IVectorStore['getHealth']>>>();

  for (const [key, store] of instances.entries()) {
    try {
      health.set(key, await store.getHealth());
    } catch (error) {
      health.set(key, {
        healthy: false,
        backend: store.backend,
        vectorCount: 0,
        indexStatus: 'error',
        lastError: String(error),
      });
    }
  }

  return health;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getVectorStore,
  getConfiguredBackend,
  createVectorStoreFromEnv,
  closeAllVectorStores,
  getAllVectorStoreHealth,
};
