/**
 * Unified Persistence Layer (Clean Architecture)
 *
 * Single access point for all memory persistence operations.
 * Abstracts multiple storage backends:
 *
 * - Firestore (primary document store)
 * - FirestoreVectorStore (embeddings)
 * - Redis (optional cache layer)
 * - Spanner (L3 graph storage - future)
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────┐
 * │              Unified Persistence                │
 * │                  (this module)                  │
 * ├─────────────────────────────────────────────────┤
 * │                                                 │
 * │  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
 * │  │ Firestore│ │  Vector  │ │      Redis      │ │
 * │  │  Store   │ │  Store   │ │     (cache)     │ │
 * │  └──────────┘ └──────────┘ └─────────────────┘ │
 * │        │            │              │           │
 * │        └────────────┼──────────────┘           │
 * │                     │                          │
 * │              ┌──────▼──────┐                   │
 * │              │  Entity     │                   │
 * │              │   Store     │                   │
 * │              └─────────────┘                   │
 * └─────────────────────────────────────────────────┘
 * ```
 *
 * @module memory/persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { MemoryStore } from '../store.js';

const log = createLogger({ module: 'PersistenceLayer' });

// ============================================================================
// STORE ACCESS
// ============================================================================

// Lazy import to avoid circular dependencies
let cachedStore: MemoryStore | null = null;
let storePromise: Promise<MemoryStore> | null = null;

/**
 * Get the primary memory store (auto-selects based on environment)
 * Uses store-factory for selection logic.
 */
export async function getStore(): Promise<MemoryStore> {
  if (cachedStore) return cachedStore;
  if (storePromise) return storePromise;

  storePromise = (async () => {
    const { getStore: getStoreFromFactory } = await import('../store-factory.js');
    cachedStore = await getStoreFromFactory();
    return cachedStore;
  })();

  return storePromise;
}

/**
 * Get Firestore instance directly (for advanced queries)
 */
export async function getFirestore() {
  const { getFirestore: getFs } = await import('../firestore-factory.js');
  return getFs();
}

/**
 * Get Firestore Vector Store (for semantic search)
 */
export async function getVectorStore() {
  const { getFirestoreVectorStore } = await import('../firestore-vector-store/index.js');
  return getFirestoreVectorStore();
}

/**
 * Get Redis cache (if available)
 */
export async function getRedisCache() {
  const { getRedisCache: getRedis, isRedisCacheEnabled } = await import('../index.js');
  if (!isRedisCacheEnabled()) {
    return null;
  }
  return getRedis();
}

// ============================================================================
// UNIFIED DOCUMENT OPERATIONS
// ============================================================================

/**
 * Save a document to the user's collection
 */
export async function saveDocument<T extends object>(
  userId: string,
  collection: string,
  docId: string,
  data: T
): Promise<void> {
  const db = await getFirestore();
  if (!db) {
    log.warn('Firestore not available, skipping document save');
    return;
  }

  await db
    .collection('bogle_users')
    .doc(userId)
    .collection(collection)
    .doc(docId)
    .set(data, { merge: true });
}

/**
 * Get a document from the user's collection
 */
export async function getDocument<T>(
  userId: string,
  collection: string,
  docId: string
): Promise<T | null> {
  const db = await getFirestore();
  if (!db) {
    log.warn('Firestore not available');
    return null;
  }

  const doc = await db
    .collection('bogle_users')
    .doc(userId)
    .collection(collection)
    .doc(docId)
    .get();

  if (!doc.exists) return null;
  return doc.data() as T;
}

/**
 * Delete a document from the user's collection
 */
export async function deleteDocument(
  userId: string,
  collection: string,
  docId: string
): Promise<void> {
  const db = await getFirestore();
  if (!db) return;

  await db.collection('bogle_users').doc(userId).collection(collection).doc(docId).delete();
}

/**
 * Query documents from the user's collection
 */
export async function queryDocuments<T>(
  userId: string,
  collection: string,
  query?: {
    field?: string;
    op?: FirebaseFirestore.WhereFilterOp;
    value?: unknown;
    limit?: number;
    orderBy?: { field: string; direction: 'asc' | 'desc' };
  }
): Promise<T[]> {
  const db = await getFirestore();
  if (!db) return [];

  let ref: FirebaseFirestore.Query = db
    .collection('bogle_users')
    .doc(userId)
    .collection(collection);

  if (query?.field && query.op && query.value !== undefined) {
    ref = ref.where(query.field, query.op, query.value);
  }

  if (query?.orderBy) {
    ref = ref.orderBy(query.orderBy.field, query.orderBy.direction);
  }

  if (query?.limit) {
    ref = ref.limit(query.limit);
  }

  const snapshot = await ref.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
}

// ============================================================================
// UNIFIED VECTOR OPERATIONS
// ============================================================================

/**
 * Add a document with embedding to the vector store
 */
export async function addVectorDocument(
  id: string,
  text: string,
  metadata: {
    source: string;
    category?: string;
    userId?: string;
    timestamp?: Date;
    [key: string]: unknown;
  }
): Promise<void> {
  const vectorStore = await getVectorStore();
  await vectorStore.addDocument({ id, text, metadata });
}

/**
 * Search for similar documents
 */
export async function searchVectors(
  query: string,
  options?: {
    topK?: number;
    filter?: Record<string, unknown>;
    minScore?: number;
  }
): Promise<
  Array<{
    id: string;
    text: string;
    score: number;
    metadata: Record<string, unknown>;
  }>
> {
  const vectorStore = await getVectorStore();
  const results = await vectorStore.search(query, options);
  return results.map((r) => ({
    id: r.document.id,
    text: r.document.text,
    score: r.score,
    metadata: r.document.metadata,
  }));
}

// ============================================================================
// HEALTH & STATUS
// ============================================================================

/**
 * Get persistence layer health status
 */
export async function getPersistenceHealth(): Promise<{
  firestore: { healthy: boolean; error?: string };
  vectorStore: { healthy: boolean; usingFallback: boolean; cacheSize: number };
  redis: { enabled: boolean; healthy: boolean };
}> {
  // Check Firestore
  let firestoreHealthy = false;
  let firestoreError: string | undefined;
  try {
    const db = await getFirestore();
    firestoreHealthy = !!db;
  } catch (error) {
    firestoreError = String(error);
  }

  // Check Vector Store
  let vectorHealth = { healthy: false, usingFallback: true, cacheSize: 0 };
  try {
    const vectorStore = await getVectorStore();
    if ('getHealth' in vectorStore && typeof vectorStore.getHealth === 'function') {
      const health = vectorStore.getHealth() as {
        healthy: boolean;
        usingFallback: boolean;
        cacheSize: number;
      };
      vectorHealth = health;
    }
  } catch {
    // Use default unhealthy state
  }

  // Check Redis
  let redisEnabled = false;
  let redisHealthy = false;
  try {
    const { isRedisCacheEnabled } = await import('../index.js');
    redisEnabled = isRedisCacheEnabled();
    redisHealthy = redisEnabled; // Assume healthy if enabled
  } catch {
    // Redis check failed
  }

  return {
    firestore: { healthy: firestoreHealthy, error: firestoreError },
    vectorStore: vectorHealth,
    redis: { enabled: redisEnabled, healthy: redisHealthy },
  };
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Firestore store
export { FirestoreStore, getFirestoreStore, resetFirestoreStore } from '../firestore-store.js';

// Postgres store
export { PostgresStore, getPostgresStore, resetPostgresStore } from '../postgres-store.js';

// In-memory store
export { InMemoryStore, getDefaultStore, resetDefaultStore } from '../in-memory-store.js';

// Vector store
export {
  FirestoreVectorStore,
  getFirestoreVectorStore,
  resetFirestoreVectorStore,
} from '../firestore-vector-store/index.js';

// Extended persistence
export {
  saveSessionState,
  getSessionState,
  getRecentSessions,
  logToolExecution,
  getToolExecutions,
  savePersonaBond,
  getPersonaBond,
  getAllPersonaBonds,
  saveVoiceProfile,
  getVoiceProfile,
  logUserIntent,
  getRecentIntents,
  setCachedInsight,
  getCachedInsight,
  saveQualityMetrics,
  getQualityMetrics,
  deleteAllExtendedUserData,
  type SessionState,
  type ToolExecution,
  type PersonaBond,
  type VoiceProfile,
  type UserIntent,
  type CachedInsight,
  type QualityMetrics,
} from '../firestore-extended-persistence.js';
