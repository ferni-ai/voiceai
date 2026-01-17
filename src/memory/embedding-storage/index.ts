/**
 * Embedding Storage Module
 *
 * Separated embedding storage for:
 * - Reduced document sizes
 * - Future vector DB migration
 * - Improved query performance
 *
 * @module memory/embedding-storage
 */

// Types
export type {
  StoredEmbedding,
  EmbeddingSourceType,
  EmbeddingReference,
  EmbeddingSearchResult,
  EmbeddingStorageConfig,
  EmbeddingStorageHealth,
  IEmbeddingStorage,
  MigrationStatus,
  MigrationResult,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

// Firestore implementation
export {
  FirestoreEmbeddingStorage,
  getEmbeddingStorage,
} from './firestore-embedding-storage.js';

// Migration utilities
export {
  migrateSummaryEmbeddings,
  cleanupMigratedEmbeddings,
  rollbackMigration,
  runBatchMigration,
} from './migration.js';
