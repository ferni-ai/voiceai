/**
 * Embedding Storage Types
 *
 * Type definitions for the separated embedding storage system.
 * Embeddings are stored separately from their source documents to:
 * - Reduce document sizes (embeddings are ~6KB each)
 * - Enable future migration to vector databases
 * - Improve query performance for non-embedding operations
 *
 * @module memory/embedding-storage/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Source type for embeddings
 */
export type EmbeddingSourceType =
  | 'summary'           // Conversation summaries
  | 'memory'            // Memory entries
  | 'entity'            // Named entities
  | 'topic'             // Topic embeddings
  | 'trigger'           // Associative triggers
  | 'pattern'           // Behavioral patterns
  | 'voice_profile';    // Voice enrollment

/**
 * Stored embedding document
 */
export interface StoredEmbedding {
  id: string;
  userId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  vector: number[];
  dimension: number;
  model: string;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Embedding reference stored in source documents
 */
export interface EmbeddingReference {
  hasEmbedding: true;
  embeddingId: string;
  embeddingVersion: number;
}

/**
 * Search result with score
 */
export interface EmbeddingSearchResult {
  embedding: StoredEmbedding;
  score: number;
  distance: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface EmbeddingStorageConfig {
  collectionName: string;
  defaultModel: string;
  defaultDimension: number;
  maxBatchSize: number;
  enableCache: boolean;
  cacheMaxSize: number;
  cacheTTLMs: number;
}

export const DEFAULT_CONFIG: EmbeddingStorageConfig = {
  collectionName: 'embeddings',
  defaultModel: 'text-embedding-004',
  defaultDimension: 768,
  maxBatchSize: 100,
  enableCache: true,
  cacheMaxSize: 1000,
  cacheTTLMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// MIGRATION TYPES
// ============================================================================

/**
 * Migration status for a single document
 */
export interface MigrationStatus {
  userId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  status: 'pending' | 'migrated' | 'failed' | 'skipped';
  error?: string;
  migratedAt?: Date;
}

/**
 * Batch migration result
 */
export interface MigrationResult {
  success: boolean;
  processed: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ sourceId: string; error: string }>;
  durationMs: number;
}

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

/**
 * Embedding storage interface for different backends
 */
export interface IEmbeddingStorage {
  // Store operations
  store(embedding: Omit<StoredEmbedding, 'id' | 'createdAt'>): Promise<string>;
  storeBatch(embeddings: Array<Omit<StoredEmbedding, 'id' | 'createdAt'>>): Promise<string[]>;

  // Retrieve operations
  get(embeddingId: string): Promise<StoredEmbedding | null>;
  getBySource(userId: string, sourceType: EmbeddingSourceType, sourceId: string): Promise<StoredEmbedding | null>;
  getBatch(embeddingIds: string[]): Promise<StoredEmbedding[]>;

  // Search operations
  search(userId: string, queryVector: number[], limit: number, sourceTypes?: EmbeddingSourceType[]): Promise<EmbeddingSearchResult[]>;

  // Delete operations
  delete(embeddingId: string): Promise<boolean>;
  deleteBySource(userId: string, sourceType: EmbeddingSourceType, sourceId: string): Promise<boolean>;
  deleteExpired(): Promise<number>;

  // Health operations
  getHealth(): Promise<EmbeddingStorageHealth>;
}

/**
 * Health status for embedding storage
 */
export interface EmbeddingStorageHealth {
  healthy: boolean;
  backend: 'firestore' | 'pinecone' | 'memory';
  totalEmbeddings: number;
  cacheHitRate: number;
  lastCleanupAt: Date | null;
  errors: number;
}
