/**
 * Firestore Vector Store
 *
 * Production-grade persistent vector storage using Google Cloud Firestore's
 * native vector search capabilities. Replaces the ephemeral in-memory VectorStore.
 *
 * Features:
 * - Persistent vector storage (survives restarts)
 * - Native KNN similarity search
 * - Automatic embedding generation
 * - User-scoped and global document support
 * - Seamless fallback to in-memory when Firestore unavailable
 * - Automatic recovery attempts
 *
 * Requires:
 * - @google-cloud/firestore >= 7.1.0 (for vector search)
 * - A Firestore vector index (created via gcloud or Firebase console)
 *
 * Index Creation (run once):
 * ```
 * gcloud firestore indexes composite create \
 *   --collection-group=vectors \
 *   --query-scope=COLLECTION \
 *   --field-config=vector-config='{"dimension":"768","flat":{}}',field-path=embedding
 * ```
 *
 * @module memory/firestore-vector-store
 */
export type { FirestoreVectorConfig, FirestoreInstance, CollectionReference, FindNearestOptions, DocumentReference, DocumentSnapshot, QuerySnapshot, Query, FieldVector, VectorStoreHealth, FallbackCacheEntry, } from './types.js';
export { DEFAULT_COLLECTION_NAME, DEFAULT_EMBEDDING_DIMENSION, MAX_FALLBACK_CACHE_SIZE, RECOVERY_INTERVAL_MS, MAX_RECOVERY_ATTEMPTS, FIRESTORE_BATCH_SIZE, } from './types.js';
export { extractEmbedding, matchesFilter } from './helpers.js';
export { FallbackCache } from './fallback-cache.js';
export { RecoveryManager, migrateCacheToFirestore } from './recovery.js';
export type { RecoveryState, RecoveryCallbacks } from './recovery.js';
export { VectorSearchCache, getVectorSearchCache, resetVectorSearchCache, } from './search-cache.js';
export { FirestoreVectorStore } from './core.js';
import { FirestoreVectorStore } from './core.js';
/**
 * Get the default Firestore vector store instance.
 */
export declare function getFirestoreVectorStore(): FirestoreVectorStore;
/**
 * Reset the default store (for testing).
 */
export declare function resetFirestoreVectorStore(): void;
export default FirestoreVectorStore;
//# sourceMappingURL=index.d.ts.map