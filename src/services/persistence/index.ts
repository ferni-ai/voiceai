/**
 * Unified Persistence Layer
 *
 * Provides a consistent pattern for persisting in-memory data to Firestore.
 * All services that need persistence should use this layer.
 *
 * Features: debounced batch writes, flush on shutdown, startup rehydration, memory cleanup,
 * write-through for critical data, and MINOR_CARE's hold by default (holdWrites).
 * @module PersistenceLayer
 */

import { createLogger } from '../../utils/safe-logger.js';
import { userHeld } from '../../utils/minor-care.js';
import { isSharedPlaceholderId } from '../../utils/synthetic-user.js';
import { heldFields } from './held-fields.js';
import { updateIfUnchangedFor, type UpdateIfUnchanged } from './update-if-unchanged.js';
import { timestampsToDates } from './timestamps.js';
export { timestampsToDates };
import { readGuard, ReadFailedWriteError, type WriteOptions } from './read-guard.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { getFirestoreDatabase } from '../../config/environment.js';

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
  /**
   * MINOR_CARE, on by default (userHeld): a held caller under 18's data is never cached or written,
   * here or later in this process. Opt out with () => false only for data that isn't theirs to
   * withhold: credentials, push endpoints, billing.
   */
  holdWrites?: (userId: string) => boolean;
  /** For a held user, the fields that still persist (merge write); default: none (held-fields.ts) */
  whenHeld?: (data: never) => Record<string, unknown> | null;
}

export interface LoadOptions {
  fresh?: boolean;
  strict?: boolean | 'read'; // 'read': throws on a failed read only, not when Firestore is absent
}

export interface PersistenceStore<T> {
  /** Get data for a user */
  get: (userId: string) => Promise<T | null>;
  /** Set data for a user (queued for batch write). The read guard doesn't apply here yet */
  set: (userId: string, data: T, options?: WriteOptions) => void;
  /** Set data and write immediately; rejects (ReadFailedWriteError) while the last load failed */
  setImmediate: (userId: string, data: T, options?: WriteOptions) => Promise<void>;
  /** update() only while the doc is what the caller read; never recreates it (update-if-unchanged.ts) */
  updateIfUnchanged: UpdateIfUnchanged<T>;
  /** The latest load for this user failed (read-guard.ts) */
  readFailed: (userId: string) => boolean;
  /** Delete data for a user */
  delete: (userId: string) => Promise<void>;
  /** Mark data as dirty (needs sync) */
  markDirty: (userId: string) => void;
  /** Flush all pending changes */
  flush: () => Promise<void>;
  /** Flush changes for a specific user */
  flushUser: (userId: string) => Promise<void>;
  /**
   * Load data from Firestore into memory. `fresh` skips a clean cache entry, for
   * data another process may have changed (unflushed local writes still win).
   * `strict` throws when Firestore can't be read instead of answering null.
   */
  load: (userId: string, options?: LoadOptions) => Promise<T | null>;
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
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitAttempted) return null;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  dbInitAttempted = true;

  try {
    const { sharedFirestore } = await import('../../utils/shared-firestore.js');
    db = sharedFirestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: getFirestoreDatabase(),
      // A nested `undefined` that slips past cleanForFirestore (e.g. inside an array of
      // records) must not fail the whole batch. getFirestoreDb's client: same settings.
      ignoreUndefinedProperties: true,
    });
    log.info('Persistence layer Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for persistence layer');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// PERSISTENCE STORE FACTORY
// ============================================================================

const activeStores: Array<{ name: string; store: PersistenceStore<unknown> }> = [];

export function createPersistenceStore<T>(config: PersistenceConfig): PersistenceStore<T> {
  const {
    collection,
    documentId = 'data',
    syncIntervalMs = 5000,
    maxPendingChanges = 20,
    useRootCollection = false,
    holdWrites = userHeld,
    whenHeld,
  } = config;

  // In-memory cache
  const cache = new Map<string, T>();
  const dirty = new Set<string>();
  const intervalName = `persistence-sync-${collection}`;
  // Held once: dropped on every set and sync until clearCache (a purge that also forgot the user
  // upstream, so what is set next is read back from storage, not the held call's).
  const tainted = new Set<string>();
  const held = (userId: string): boolean =>
    (tainted.has(userId) || holdWrites(userId)) &&
    (tainted.add(userId), cache.delete(userId), true);
  const heldParts = heldFields<T>(whenHeld, syncIntervalMs);
  // PRIVACY: a placeholder id (anonymous, unknown, default, shared, blank) is one bucket every caller
  // without an id shares, so under bogle_users it is never cached, read or written.
  const shared = (userId: string): boolean => !useRootCollection && isSharedPlaceholderId(userId);
  let isShutdown = false;
  const refFor = (firestore: FirestoreType, userId: string) =>
    useRootCollection
      ? firestore.collection(collection).doc(userId)
      : firestore.collection('bogle_users').doc(userId).collection(collection).doc(documentId);
  const guard = readGuard(collection); // a failed load: no write may replace what wasn't read

  // Start sync interval using managed interval
  const startSyncInterval = () => {
    registerInterval(
      intervalName,
      () => {
        void flushAll();
      },
      syncIntervalMs
    );
  };

  const stopSyncInterval = () => {
    clearNamedInterval(intervalName);
  };

  // One flush at a time per store: a tick waits for the running one; a forced flush runs after it
  let flushing: Promise<void> | undefined;
  const flushAll = async (force = false): Promise<void> => {
    while (flushing) {
      if (!force) return flushing;
      await flushing;
    }
    flushing = flushOnce(force).finally(() => (flushing = undefined));
    return flushing;
  };
  // Forced (shutdown, explicit flush): held parts ignore their backoff
  const flushOnce = async (force: boolean): Promise<void> => {
    if (dirty.size === 0 && !heldParts.owed()) return;

    const firestore = await getFirestore();
    if (!firestore) return;

    const toFlush = Array.from(dirty).filter((userId) => !held(userId));
    dirty.clear();

    const docRefFor = (userId: string) => refFor(firestore, userId);

    // Deep-clean before every write: Firestore rejects `undefined` anywhere in the tree, even
    // inside arrays (`events[].estimatedValueCents`). `ignoreUndefinedProperties` on the client
    // is the primary guard; this is defense in depth and matches flushUser()'s Date handling.
    const toDoc = (userId: string, data: unknown) =>
      cleanForFirestore({
        ...(data as Record<string, unknown>),
        _updatedAt: new Date().toISOString(),
        _userId: userId,
      });
    const setPart = (u: string, part: unknown) => docRefFor(u).set(toDoc(u, part), { merge: true });
    await heldParts.write(setPart, dirty, force, (u) => docRefFor(u).delete());

    try {
      let batch = firestore.batch();
      let batchCount = 0;

      for (const userId of toFlush) {
        const data = cache.get(userId);
        if (!data) continue;

        batch.set(docRefFor(userId), toDoc(userId, data), { merge: true });
        batchCount++;

        // Firestore batch limit is 500; a committed WriteBatch can't be reused, so start afresh.
        if (batchCount >= 450) {
          await batch.commit();
          log.debug({ collection, count: batchCount }, 'Batch committed (limit reached)');
          batch = firestore.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        log.debug({ collection, count: batchCount }, 'Persistence batch committed');
      }
    } catch (error) {
      // A batch commit is all-or-nothing, so one bad document fails them all: retry each one
      // alone so a single bad user can't block everyone else's data from persisting.
      log.error(
        { error, collection, count: toFlush.length },
        'Persistence batch failed; retrying documents individually'
      );

      await Promise.all(
        toFlush.map(async (userId) => {
          const data = cache.get(userId);
          if (!data) return;

          try {
            await docRefFor(userId).set(toDoc(userId, data), { merge: true });
          } catch (docError) {
            // Only the genuinely bad document stays dirty for the next cycle.
            dirty.add(userId);
            log.error(
              { error: docError, collection, userId },
              'Failed to persist individual document after batch failure'
            );
          }
        })
      );
    }
  };

  // Flush a single user
  const flushUser = async (userId: string): Promise<void> => {
    if (!dirty.has(userId) || held(userId)) return;

    const firestore = await getFirestore();
    if (!firestore) return;

    const data = cache.get(userId);
    if (!data) {
      dirty.delete(userId);
      return;
    }

    try {
      await refFor(firestore, userId).set(
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
  const load = async (userId: string, options?: LoadOptions): Promise<T | null> => {
    if (shared(userId)) return null;
    // Check cache first
    if (cache.has(userId) && (!options?.fresh || dirty.has(userId))) {
      return cache.get(userId)!;
    }

    const firestore = await getFirestore();
    if (!firestore && options?.strict === true) throw new Error(`No Firestore (${collection})`);
    if (!firestore) return cache.get(userId) ?? null;

    const gen = guard.begin(userId);
    try {
      const doc = await refFor(firestore, userId).get();
      const data = doc.exists ? (timestampsToDates(doc.data()) as T) : undefined;
      guard.settle(userId, gen, true); // a read counts as good only once its data converted
      if (data === undefined) {
        cache.delete(userId);
        return null;
      }
      cache.set(userId, data);
      return data;
    } catch (error) {
      log.error({ error, collection, userId }, 'Failed to load user data');
      guard.settle(userId, gen, false);
      if (options?.strict) throw error;
      return null;
    }
  };

  // Start the sync interval
  startSyncInterval();

  const store: PersistenceStore<T> = {
    get: async (userId: string) => {
      if (shared(userId)) return null;
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
      if (shared(userId)) return;
      if (held(userId)) return void (heldParts.keep(userId, data) && dirty.add(userId));
      cache.set(userId, data);
      dirty.add(userId);

      // Force flush if too many pending changes
      if (dirty.size >= maxPendingChanges) {
        void flushAll();
      }
    },

    setImmediate: async (userId: string, data: T, options?: WriteOptions) => {
      if (guard.refuses(userId, options)) throw new ReadFailedWriteError(collection, userId);
      if (held(userId)) return void (heldParts.keep(userId, data) && dirty.add(userId));
      if (shared(userId)) return; // a shared id is never held (minor-care sharedId)
      cache.set(userId, data);
      dirty.add(userId);
      await flushUser(userId);
    },

    updateIfUnchanged: updateIfUnchangedFor(
      { cache, dirty, collection, getFirestore, refFor },
      (u) => held(u) || shared(u)
    ),

    delete: async (userId: string) => {
      if (shared(userId)) return; // never touches the shared doc; removing it is a human decision
      cache.delete(userId);
      dirty.delete(userId);
      heldParts.forget(userId, true); // a pending held part, even one in flight, never outlives this
      await heldParts.settled(userId); // a held write in flight lands before the delete, not after

      const firestore = await getFirestore();
      if (!firestore) return;

      try {
        await refFor(firestore, userId).delete();
        heldParts.documentDeleted(userId); // only now is a pending compensating delete moot
        log.debug({ collection, userId }, 'User data deleted');
      } catch (error) {
        log.error({ error, collection, userId }, 'Failed to delete user data');
      }
    },

    readFailed: (userId: string) => guard.failed(userId),
    markDirty: (userId: string) => {
      if (cache.has(userId)) {
        dirty.add(userId);
      }
    },

    flush: () => flushAll(true),

    flushUser,

    load,

    clearCache: (userId: string) => {
      cache.delete(userId);
      dirty.delete(userId);
      tainted.delete(userId); // still held: the next set taints it again
      heldParts.forget(userId);
    },

    clearAllCaches: () => {
      cache.clear();
      dirty.clear();
      heldParts.forget();
    },

    getStats: () => ({
      cached: cache.size,
      dirty: dirty.size,
    }),

    shutdown: async () => {
      isShutdown = true;
      stopSyncInterval();
      await heldParts.capped(flushAll(true)); // at most 10 s on a hung held write
      heldParts.reportPending(collection);
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

/** Initialize all persistence stores; call at application startup */
export async function initializePersistence(): Promise<void> {
  await getFirestore();
  log.info('Persistence layer initialized');
}

/** Shutdown all persistence stores; call at application shutdown */
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

/** Flush all pending changes across all stores */
export async function flushAllStores(): Promise<void> {
  await Promise.all(activeStores.map(async ({ store }) => store.flush()));
}

/** Get stats for all stores */
export function getAllStats(): Record<string, { cached: number; dirty: number }> {
  const stats: Record<string, { cached: number; dirty: number }> = {};
  for (const { name, store } of activeStores) {
    stats[name] = store.getStats();
  }
  return stats;
}

export default {
  createPersistenceStore,
  initializePersistence,
  shutdownPersistence,
  flushAllStores,
  getAllStats,
};
