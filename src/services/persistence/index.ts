/**
 * Unified Persistence Layer
 *
 * Provides a consistent pattern for persisting in-memory data to Firestore.
 * All services that need persistence should use this layer.
 *
 * Features:
 * - Debounced batch writes for efficiency
 * - Graceful shutdown with flush
 * - Startup rehydration
 * - Memory cleanup utilities
 * - Write-through for critical data
 *
 * @module PersistenceLayer
 */

import { createLogger } from '../../utils/safe-logger.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

const log = createLogger({ module: 'PersistenceLayer' });

// ============================================================================
// TYPES
// ============================================================================

export interface PersistenceConfig {
  /** Collection name in Firestore (under bogle_users/{userId}) */
  collection: string;

  /** Document ID (defaults to 'data') */
  documentId?: string;

  /** How often to batch sync (ms) - default 5000 */
  syncIntervalMs?: number;

  /** Max pending changes before forcing sync - default 20 */
  maxPendingChanges?: number;

  /** Whether to use root collection (not under bogle_users) */
  useRootCollection?: boolean;
}

export interface PersistenceStore<T> {
  /** Get data for a user */
  get: (userId: string) => Promise<T | null>;

  /** Set data for a user (queued for batch write) */
  set: (userId: string, data: T) => void;

  /** Set data and write immediately */
  setImmediate: (userId: string, data: T) => Promise<void>;

  /** Delete data for a user */
  delete: (userId: string) => Promise<void>;

  /** Mark data as dirty (needs sync) */
  markDirty: (userId: string) => void;

  /** Flush all pending changes */
  flush: () => Promise<void>;

  /** Flush changes for a specific user */
  flushUser: (userId: string) => Promise<void>;

  /** Load data from Firestore into memory */
  load: (userId: string) => Promise<T | null>;

  /** Clear memory cache for user */
  clearCache: (userId: string) => void;

  /** Clear all memory caches */
  clearAllCaches: () => void;

  /** Get stats about memory usage */
  getStats: () => { cached: number; dirty: number };

  /** Shutdown (flush and cleanup) */
  shutdown: () => Promise<void>;
}

// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================

let db: FirestoreType | null = null;
let dbInitAttempted = false;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitAttempted) return null;

  dbInitAttempted = true;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Persistence layer Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for persistence layer');
    return null;
  }
}

// ============================================================================
// PERSISTENCE STORE FACTORY
// ============================================================================

const activeStores: Array<{ name: string; store: PersistenceStore<unknown> }> = [];

/**
 * Create a persistence store for a specific data type
 */
export function createPersistenceStore<T>(config: PersistenceConfig): PersistenceStore<T> {
  const {
    collection,
    documentId = 'data',
    syncIntervalMs = 5000,
    maxPendingChanges = 20,
    useRootCollection = false,
  } = config;

  // In-memory cache
  const cache = new Map<string, T>();
  const dirty = new Set<string>();
  let syncTimer: NodeJS.Timeout | null = null;
  let isShutdown = false;

  // Start sync interval
  const startSyncInterval = () => {
    if (syncTimer) return;
    syncTimer = setInterval(() => {
      void flushAll();
    }, syncIntervalMs);
  };

  const stopSyncInterval = () => {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  };

  // Flush all dirty data
  const flushAll = async (): Promise<void> => {
    if (dirty.size === 0) return;

    const firestore = await getFirestore();
    if (!firestore) return;

    const toFlush = Array.from(dirty);
    dirty.clear();

    try {
      const batch = firestore.batch();
      let batchCount = 0;

      for (const userId of toFlush) {
        const data = cache.get(userId);
        if (!data) continue;

        const docRef = useRootCollection
          ? firestore.collection(collection).doc(userId)
          : firestore.collection('bogle_users').doc(userId).collection(collection).doc(documentId);

        batch.set(
          docRef,
          removeUndefined({
            ...data,
            _updatedAt: new Date().toISOString(),
            _userId: userId,
          }),
          { merge: true }
        );

        batchCount++;

        // Firestore batch limit is 500
        if (batchCount >= 450) {
          await batch.commit();
          log.debug({ collection, count: batchCount }, 'Batch committed (limit reached)');
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        log.debug({ collection, count: batchCount }, 'Persistence batch committed');
      }
    } catch (error) {
      // Re-add failed users to dirty set
      toFlush.forEach((userId) => dirty.add(userId));
      log.error({ error, collection }, 'Failed to flush persistence batch');
    }
  };

  // Flush a single user
  const flushUser = async (userId: string): Promise<void> => {
    if (!dirty.has(userId)) return;

    const firestore = await getFirestore();
    if (!firestore) return;

    const data = cache.get(userId);
    if (!data) {
      dirty.delete(userId);
      return;
    }

    try {
      const docRef = useRootCollection
        ? firestore.collection(collection).doc(userId)
        : firestore.collection('bogle_users').doc(userId).collection(collection).doc(documentId);

      await docRef.set(
        cleanForFirestore({
          ...data,
          _updatedAt: new Date().toISOString(),
          _userId: userId,
        }),
        { merge: true }
      );

      dirty.delete(userId);
      log.debug({ collection, userId }, 'User data persisted');
    } catch (error) {
      log.error({ error, collection, userId }, 'Failed to persist user data');
    }
  };

  // Load from Firestore
  const load = async (userId: string): Promise<T | null> => {
    // Check cache first
    if (cache.has(userId)) {
      return cache.get(userId)!;
    }

    const firestore = await getFirestore();
    if (!firestore) return null;

    try {
      const docRef = useRootCollection
        ? firestore.collection(collection).doc(userId)
        : firestore.collection('bogle_users').doc(userId).collection(collection).doc(documentId);

      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as T;
      cache.set(userId, data);
      return data;
    } catch (error) {
      log.error({ error, collection, userId }, 'Failed to load user data');
      return null;
    }
  };

  // Start the sync interval
  startSyncInterval();

  const store: PersistenceStore<T> = {
    get: async (userId: string) => {
      if (cache.has(userId)) {
        return cache.get(userId)!;
      }
      return load(userId);
    },

    set: (userId: string, data: T) => {
      if (isShutdown) {
        log.warn({ collection, userId }, 'Attempted to set data after shutdown');
        return;
      }
      cache.set(userId, data);
      dirty.add(userId);

      // Force flush if too many pending changes
      if (dirty.size >= maxPendingChanges) {
        void flushAll();
      }
    },

    setImmediate: async (userId: string, data: T) => {
      cache.set(userId, data);
      dirty.add(userId);
      await flushUser(userId);
    },

    delete: async (userId: string) => {
      cache.delete(userId);
      dirty.delete(userId);

      const firestore = await getFirestore();
      if (!firestore) return;

      try {
        const docRef = useRootCollection
          ? firestore.collection(collection).doc(userId)
          : firestore.collection('bogle_users').doc(userId).collection(collection).doc(documentId);

        await docRef.delete();
        log.debug({ collection, userId }, 'User data deleted');
      } catch (error) {
        log.error({ error, collection, userId }, 'Failed to delete user data');
      }
    },

    markDirty: (userId: string) => {
      if (cache.has(userId)) {
        dirty.add(userId);
      }
    },

    flush: flushAll,

    flushUser,

    load,

    clearCache: (userId: string) => {
      cache.delete(userId);
      dirty.delete(userId);
    },

    clearAllCaches: () => {
      cache.clear();
      dirty.clear();
    },

    getStats: () => ({
      cached: cache.size,
      dirty: dirty.size,
    }),

    shutdown: async () => {
      isShutdown = true;
      stopSyncInterval();
      await flushAll();
      cache.clear();
      dirty.clear();
      log.info({ collection }, 'Persistence store shutdown complete');
    },
  };

  // Track store for global shutdown
  activeStores.push({ name: collection, store: store as PersistenceStore<unknown> });

  return store;
}

// ============================================================================
// GLOBAL LIFECYCLE
// ============================================================================

/**
 * Initialize all persistence stores
 * Call this at application startup
 */
export async function initializePersistence(): Promise<void> {
  await getFirestore();
  log.info('Persistence layer initialized');
}

/**
 * Shutdown all persistence stores
 * Call this at application shutdown
 */
export async function shutdownPersistence(): Promise<void> {
  log.info({ storeCount: activeStores.length }, 'Shutting down persistence layer...');

  await Promise.all(
    activeStores.map(async ({ name, store }) => {
      try {
        await store.shutdown();
      } catch (error) {
        log.error({ error, name }, 'Failed to shutdown store');
      }
    })
  );

  activeStores.length = 0;
  log.info('Persistence layer shutdown complete');
}

/**
 * Flush all pending changes across all stores
 */
export async function flushAllStores(): Promise<void> {
  await Promise.all(activeStores.map(async ({ store }) => store.flush()));
}

/**
 * Get stats for all stores
 */
export function getAllStats(): Record<string, { cached: number; dirty: number }> {
  const stats: Record<string, { cached: number; dirty: number }> = {};
  for (const { name, store } of activeStores) {
    stats[name] = store.getStats();
  }
  return stats;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createPersistenceStore,
  initializePersistence,
  shutdownPersistence,
  flushAllStores,
  getAllStats,
};
