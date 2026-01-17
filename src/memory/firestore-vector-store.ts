/**
 * Firestore Vector Store
 *
 * Re-exports from the modular firestore-vector-store/ directory.
 * Maintained for backward compatibility.
 *
 * @see firestore-vector-store/index.ts for full implementation
 * @module memory/firestore-vector-store
 */

// Re-export everything from the modular implementation
export {
  // Types
  type FirestoreVectorConfig,
  type FirestoreInstance,
  type CollectionReference,
  type FindNearestOptions,
  type DocumentReference,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Query,
  type FieldVector,
  type VectorStoreHealth,
  type FallbackCacheEntry,
  type RecoveryState,
  type RecoveryCallbacks,

  // Constants
  DEFAULT_COLLECTION_NAME,
  DEFAULT_EMBEDDING_DIMENSION,
  MAX_FALLBACK_CACHE_SIZE,
  RECOVERY_INTERVAL_MS,
  MAX_RECOVERY_ATTEMPTS,
  FIRESTORE_BATCH_SIZE,

  // Helpers
  extractEmbedding,
  matchesFilter,

  // Classes
  FallbackCache,
  RecoveryManager,
  FirestoreVectorStore,

  // Functions
  migrateCacheToFirestore,
  getFirestoreVectorStore,
  resetFirestoreVectorStore,
} from './firestore-vector-store/index.js';

// Re-export default for backward compatibility
export { default } from './firestore-vector-store/index.js';
