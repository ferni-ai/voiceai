/**
 * Vector Store Module
 *
 * Abstraction layer for vector database operations.
 * Supports multiple backends with seamless switching:
 * - Firestore (default, uses native vector search)
 * - Pinecone (dedicated vector DB, coming soon)
 * - Weaviate (open-source vector DB, coming soon)
 * - Qdrant (high-performance vector DB, coming soon)
 * - Memory (in-memory for testing)
 *
 * Usage:
 * ```typescript
 * import { getVectorStore } from './memory/vector-store';
 *
 * const store = getVectorStore(); // Default: Firestore
 *
 * // Upsert vectors
 * await store.upsert({
 *   id: 'vec_123',
 *   vector: [0.1, 0.2, ...],
 *   metadata: { userId, sourceType: 'summary', sourceId: 'sum_456' }
 * });
 *
 * // Search
 * const results = await store.search(queryVector, {
 *   topK: 10,
 *   filter: { userId, sourceType: 'summary' }
 * });
 * ```
 *
 * @module memory/vector-store
 */

// Types
export type {
  VectorStoreBackend,
  VectorDocument,
  VectorMetadata,
  VectorSearchOptions,
  VectorFilter,
  VectorSearchResult,
  UpsertResult,
  DeleteResult,
  VectorStoreHealth,
  IVectorStore,
  VectorStoreConfig,
  FirestoreVectorConfig,
  PineconeVectorConfig,
  WeaviateVectorConfig,
  QdrantVectorConfig,
  MemoryVectorConfig,
} from './types.js';

export { DEFAULT_VECTOR_CONFIG } from './types.js';

// Factory (main entry point)
export {
  getVectorStore,
  getConfiguredBackend,
  createVectorStoreFromEnv,
  closeAllVectorStores,
  getAllVectorStoreHealth,
} from './factory.js';

// Implementations (for advanced usage)
export { FirestoreVectorStore } from './firestore-vector-store.js';
export { MemoryVectorStore } from './memory-vector-store.js';
