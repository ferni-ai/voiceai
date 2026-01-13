/**
 * Firestore Vector Store Types
 *
 * Type definitions for the Firestore vector store implementation.
 *
 * @module memory/firestore-vector-store/types
 */
// ============================================================================
// DEFAULTS
// ============================================================================
export const DEFAULT_COLLECTION_NAME = 'vectors';
export const DEFAULT_EMBEDDING_DIMENSION = 768; // Google's text-embedding-004
export const MAX_FALLBACK_CACHE_SIZE = 10_000;
export const RECOVERY_INTERVAL_MS = 60_000;
export const MAX_RECOVERY_ATTEMPTS = 10;
export const FIRESTORE_BATCH_SIZE = 500;
//# sourceMappingURL=types.js.map