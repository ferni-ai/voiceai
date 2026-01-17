/**
 * Vector Store Types
 *
 * Abstraction layer for vector database operations.
 * Supports multiple backends:
 * - Firestore (current, uses native findNearest)
 * - Pinecone (future, dedicated vector DB)
 * - Weaviate (future, open-source vector DB)
 * - Qdrant (future, high-performance vector DB)
 *
 * @module memory/vector-store/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Supported vector store backends
 */
export type VectorStoreBackend =
  | 'firestore'  // Firestore native vector search
  | 'pinecone'   // Pinecone vector DB
  | 'weaviate'   // Weaviate vector DB
  | 'qdrant'     // Qdrant vector DB
  | 'memory';    // In-memory (testing)

/**
 * Vector document to store
 */
export interface VectorDocument {
  id: string;
  vector: number[];
  metadata: VectorMetadata;
  namespace?: string; // For multi-tenant isolation
}

/**
 * Metadata attached to vectors
 */
export interface VectorMetadata {
  userId: string;
  sourceType: string;
  sourceId: string;
  content?: string;      // Original text (for reranking)
  createdAt: string;
  expiresAt?: string;
  [key: string]: unknown; // Additional metadata
}

/**
 * Search query options
 */
export interface VectorSearchOptions {
  topK: number;
  namespace?: string;
  filter?: VectorFilter;
  includeMetadata?: boolean;
  includeVector?: boolean;
  minScore?: number;      // Minimum similarity score (0-1)
}

/**
 * Filter for vector search
 */
export interface VectorFilter {
  userId?: string;
  sourceType?: string | string[];
  sourceId?: string;
  createdAfter?: string;
  createdBefore?: string;
  [key: string]: unknown;
}

/**
 * Search result
 */
export interface VectorSearchResult {
  id: string;
  score: number;          // Similarity score (0-1, higher = more similar)
  metadata: VectorMetadata;
  vector?: number[];      // Only if includeVector=true
}

/**
 * Batch upsert result
 */
export interface UpsertResult {
  upsertedCount: number;
  ids: string[];
}

/**
 * Delete result
 */
export interface DeleteResult {
  deletedCount: number;
}

/**
 * Vector store health status
 */
export interface VectorStoreHealth {
  healthy: boolean;
  backend: VectorStoreBackend;
  vectorCount: number;
  indexStatus: 'ready' | 'building' | 'error';
  latencyMs?: number;
  lastError?: string;
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Vector store interface
 *
 * All vector database backends implement this interface,
 * allowing seamless migration between providers.
 */
export interface IVectorStore {
  /**
   * Get the backend type
   */
  readonly backend: VectorStoreBackend;

  /**
   * Upsert a single vector
   */
  upsert(doc: VectorDocument): Promise<string>;

  /**
   * Upsert multiple vectors (batch)
   */
  upsertBatch(docs: VectorDocument[]): Promise<UpsertResult>;

  /**
   * Search for similar vectors
   */
  search(
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;

  /**
   * Get a vector by ID
   */
  get(id: string, namespace?: string): Promise<VectorDocument | null>;

  /**
   * Delete a vector by ID
   */
  delete(id: string, namespace?: string): Promise<boolean>;

  /**
   * Delete vectors by filter
   */
  deleteByFilter(filter: VectorFilter, namespace?: string): Promise<DeleteResult>;

  /**
   * Delete all vectors in a namespace (use with caution!)
   */
  deleteNamespace(namespace: string): Promise<DeleteResult>;

  /**
   * Get health status
   */
  getHealth(): Promise<VectorStoreHealth>;

  /**
   * Close connections (cleanup)
   */
  close(): Promise<void>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Common configuration for all vector stores
 */
export interface VectorStoreConfigBase {
  backend: VectorStoreBackend;
  dimension: number;        // Vector dimension (e.g., 768 for text-embedding-004)
  defaultNamespace?: string;
  enableCache?: boolean;
  cacheMaxSize?: number;
  cacheTTLMs?: number;
}

/**
 * Firestore-specific configuration
 */
export interface FirestoreVectorConfig extends VectorStoreConfigBase {
  backend: 'firestore';
  collection: string;       // Collection path
  distanceType?: 'cosine' | 'euclidean' | 'dot_product';
}

/**
 * Pinecone-specific configuration
 */
export interface PineconeVectorConfig extends VectorStoreConfigBase {
  backend: 'pinecone';
  apiKey: string;
  environment: string;
  indexName: string;
  projectId?: string;
}

/**
 * Weaviate-specific configuration
 */
export interface WeaviateVectorConfig extends VectorStoreConfigBase {
  backend: 'weaviate';
  host: string;
  scheme: 'http' | 'https';
  apiKey?: string;
  className: string;
}

/**
 * Qdrant-specific configuration
 */
export interface QdrantVectorConfig extends VectorStoreConfigBase {
  backend: 'qdrant';
  host: string;
  port: number;
  apiKey?: string;
  collectionName: string;
  grpc?: boolean;
}

/**
 * In-memory configuration (for testing)
 */
export interface MemoryVectorConfig extends VectorStoreConfigBase {
  backend: 'memory';
  maxVectors?: number;
}

/**
 * Union of all vector store configurations
 */
export type VectorStoreConfig =
  | FirestoreVectorConfig
  | PineconeVectorConfig
  | WeaviateVectorConfig
  | QdrantVectorConfig
  | MemoryVectorConfig;

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_VECTOR_CONFIG: FirestoreVectorConfig = {
  backend: 'firestore',
  collection: 'bogle_users/{userId}/embeddings',
  dimension: 768,
  distanceType: 'cosine',
  enableCache: true,
  cacheMaxSize: 1000,
  cacheTTLMs: 5 * 60 * 1000, // 5 minutes
};
