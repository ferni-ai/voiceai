/**
 * Persistence Layer Tests
 *
 * Tests for the unified persistence layer that provides consistent
 * patterns for persisting in-memory data to Firestore.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock firestore-utils with a real (deep/recursive) cleanForFirestore —
// tests below rely on it actually stripping `undefined` nested inside
// arrays (e.g. `events[].estimatedValueCents`), not just a shallow
// top-level stand-in. Mirrors utils/firestore-utils.ts's cleanForFirestore
// (same approach src/tests/setup.ts's global mock uses) rather than
// `vi.importActual`, which is async and this file has no need for it.
//
// Duck-typed only (no `instanceof FieldValue`): this file's own
// `vi.mock('@google-cloud/firestore', ...)` below doesn't export
// `FieldValue`, so importing the real class here would resolve to
// `undefined` and make `instanceof` throw a TypeError on every call —
// which is exactly what happened and made every test below silently fall
// through to the catch-and-retry path instead of exercising the real
// behavior (no FieldValue instances appear in this file's test data, so
// duck-typing alone is never even exercised here — it's just structural
// parity with the real isFirestoreFieldValue()).
function isFirestoreFieldValueForMock(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
  const looksLikeTransform =
    typeof ctorName === 'string' && (ctorName === 'FieldValue' || ctorName.endsWith('Transform'));
  const hasIsEqual = typeof (value as { isEqual?: unknown }).isEqual === 'function';
  return looksLikeTransform && hasIsEqual;
}

function cleanForFirestoreForMock<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString() as T;
  if (isFirestoreFieldValueForMock(obj)) return obj;
  if (Array.isArray(obj)) return obj.map((item) => cleanForFirestoreForMock(item)) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = cleanForFirestoreForMock(value);
      }
    }
    return result as T;
  }
  return obj;
}

function removeUndefinedForMock<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: cleanForFirestoreForMock,
  removeUndefined: removeUndefinedForMock,
  deepRemoveUndefined: cleanForFirestoreForMock,
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock Firestore
const mockBatch = {
  set: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

const mockDocRef = {
  get: vi.fn().mockResolvedValue({ exists: false }),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
};

const mockCollection = vi.fn(() => ({
  doc: vi.fn(() => ({
    ...mockDocRef,
    collection: vi.fn(() => ({
      doc: vi.fn(() => mockDocRef),
    })),
  })),
}));

// `vi.fn(() => ({...}))` (an arrow-function implementation) is NOT
// constructible — `new Firestore(...)` would throw "is not a constructor"
// and silently fall back to the "Firestore unavailable" no-op path,
// meaning flush()/flushUser() would never actually exercise batch.set /
// batch.commit. Use a real `function` so `new Firestore(...)` works.
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(function FirestoreMock() {
    return {
      collection: mockCollection,
      batch: () => mockBatch,
    };
  }),
}));

import { createPersistenceStore, type PersistenceConfig, type PersistenceStore } from '../index.js';

describe('PersistenceLayer', () => {
  // Test data type
  interface TestData {
    name: string;
    value: number;
    items?: string[];
  }

  const testUserId = `persist-test-user-${Date.now()}`;
  let store: PersistenceStore<TestData>;

  beforeEach(() => {
    vi.clearAllMocks();

    const config: PersistenceConfig = {
      collection: 'test_data',
      documentId: 'data',
      syncIntervalMs: 100,
      maxPendingChanges: 5,
    };

    store = createPersistenceStore<TestData>(config);
  });

  afterEach(async () => {
    await store.shutdown();
  });

  describe('createPersistenceStore', () => {
    it('should create a store with required methods', () => {
      expect(store).toBeDefined();
      expect(store.get).toBeDefined();
      expect(store.set).toBeDefined();
      expect(store.setImmediate).toBeDefined();
      expect(store.delete).toBeDefined();
      expect(store.markDirty).toBeDefined();
      expect(store.flush).toBeDefined();
      expect(store.flushUser).toBeDefined();
      expect(store.load).toBeDefined();
      expect(store.clearCache).toBeDefined();
      expect(store.clearAllCaches).toBeDefined();
      expect(store.getStats).toBeDefined();
      expect(store.shutdown).toBeDefined();
    });

    it('should create store with custom config', () => {
      const customConfig: PersistenceConfig = {
        collection: 'custom_collection',
        documentId: 'custom_doc',
        syncIntervalMs: 5000,
        maxPendingChanges: 20,
        useRootCollection: true,
      };

      const customStore = createPersistenceStore<TestData>(customConfig);
      expect(customStore).toBeDefined();

      // Cleanup
      void customStore.shutdown();
    });
  });

  describe('set and get', () => {
    it('should store data in cache', async () => {
      const data: TestData = { name: 'test', value: 42 };

      store.set(testUserId, data);

      // Get from cache should return immediately
      const cached = await store.get(testUserId);
      expect(cached).toEqual(data);
    });

    it('should update existing data', async () => {
      store.set(testUserId, { name: 'first', value: 1 });
      store.set(testUserId, { name: 'second', value: 2 });

      const cached = await store.get(testUserId);
      expect(cached).toEqual({ name: 'second', value: 2 });
    });

    it('should return null for non-existent user', async () => {
      const result = await store.get('non-existent-user');

      // Without Firestore connection, should return null
      expect(result).toBeNull();
    });
  });

  describe('markDirty', () => {
    it('should mark user data as needing sync', () => {
      const data: TestData = { name: 'dirty', value: 99 };
      store.set(testUserId, data);

      store.markDirty(testUserId);

      const stats = store.getStats();
      expect(stats.dirty).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific user', async () => {
      store.set(testUserId, { name: 'cached', value: 1 });

      store.clearCache(testUserId);

      const stats = store.getStats();
      // Cache should be smaller after clearing
      expect(stats).toBeDefined();
    });

    it('should handle clearing non-existent user', () => {
      expect(() => {
        store.clearCache('non-existent-user');
      }).not.toThrow();
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all cached data', () => {
      store.set('user1', { name: 'one', value: 1 });
      store.set('user2', { name: 'two', value: 2 });
      store.set('user3', { name: 'three', value: 3 });

      store.clearAllCaches();

      const stats = store.getStats();
      expect(stats.cached).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats object', () => {
      const stats = store.getStats();

      expect(stats).toHaveProperty('cached');
      expect(stats).toHaveProperty('dirty');
      expect(typeof stats.cached).toBe('number');
      expect(typeof stats.dirty).toBe('number');
    });

    it('should track cached and dirty counts', () => {
      store.set('user1', { name: 'one', value: 1 });
      store.set('user2', { name: 'two', value: 2 });

      const stats = store.getStats();
      expect(stats.cached).toBe(2);
      expect(stats.dirty).toBe(2);
    });
  });

  describe('flush', () => {
    it('should not throw when called', async () => {
      store.set(testUserId, { name: 'flush-test', value: 100 });

      await expect(store.flush()).resolves.not.toThrow();
    });
  });

  describe('flushUser', () => {
    it('should not throw when called', async () => {
      store.set(testUserId, { name: 'flush-user-test', value: 200 });

      await expect(store.flushUser(testUserId)).resolves.not.toThrow();
    });

    it('should handle non-existent user', async () => {
      await expect(store.flushUser('non-existent')).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should remove data from cache', async () => {
      store.set(testUserId, { name: 'to-delete', value: 0 });

      await store.delete(testUserId);

      // Cache should be cleared
      store.clearCache(testUserId);
    });

    it('should handle deleting non-existent user', async () => {
      await expect(store.delete('non-existent-user')).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should complete without error', async () => {
      await expect(store.shutdown()).resolves.not.toThrow();
    });

    it('should stop accepting new writes after shutdown', async () => {
      await store.shutdown();

      // Set after shutdown should be ignored (not throw)
      expect(() => {
        store.set(testUserId, { name: 'after-shutdown', value: -1 });
      }).not.toThrow();
    });
  });

  describe('load', () => {
    it('should return cached data if available', async () => {
      const data: TestData = { name: 'cached', value: 42 };
      store.set(testUserId, data);

      const loaded = await store.load(testUserId);

      expect(loaded).toEqual(data);
    });

    it('should return null if not in cache and Firestore unavailable', async () => {
      const loaded = await store.load('unknown-user');

      expect(loaded).toBeNull();
    });

    it('fresh: re-reads a clean cached entry that another process may have changed', async () => {
      await store.setImmediate(testUserId, { name: 'stale', value: 1 });
      mockDocRef.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ name: 'new', value: 2 }),
      });

      const loaded = await store.load(testUserId, { fresh: true });

      expect(loaded).toMatchObject({ name: 'new', value: 2 });
      expect(await store.get(testUserId)).toMatchObject({ name: 'new', value: 2 });
    });

    it('fresh: evicts the cache when the document is gone', async () => {
      await store.setImmediate(testUserId, { name: 'gone', value: 1 });
      mockDocRef.get.mockResolvedValueOnce({ exists: false });

      expect(await store.load(testUserId, { fresh: true })).toBeNull();
    });

    it('fresh: unflushed local writes win over Firestore', async () => {
      store.set(testUserId, { name: 'local', value: 3 });

      const loaded = await store.load(testUserId, { fresh: true });

      expect(loaded).toEqual({ name: 'local', value: 3 });
      expect(mockDocRef.get).not.toHaveBeenCalled();
    });
  });

  describe('setImmediate', () => {
    it('should store data and flush immediately', async () => {
      const data: TestData = { name: 'immediate', value: 999 };

      await store.setImmediate(testUserId, data);

      const cached = await store.get(testUserId);
      expect(cached).toEqual(data);
    });
  });

  describe('config defaults', () => {
    it('should use default documentId', () => {
      const minimalStore = createPersistenceStore<TestData>({
        collection: 'minimal_test',
      });

      expect(minimalStore).toBeDefined();
      void minimalStore.shutdown();
    });

    it('should use default sync interval', () => {
      const defaultStore = createPersistenceStore<TestData>({
        collection: 'default_test',
      });

      expect(defaultStore).toBeDefined();
      void defaultStore.shutdown();
    });
  });

  describe('batch limits', () => {
    it('should handle many pending changes', () => {
      // Add many items (more than maxPendingChanges)
      for (let i = 0; i < 10; i++) {
        store.set(`user-${i}`, { name: `user-${i}`, value: i });
      }

      const stats = store.getStats();
      expect(stats.cached).toBe(10);
    });
  });

  describe('resilience: undefined values and per-document isolation', () => {
    // Regression test for the 2026-10-03 dev-call incident: every batch
    // flush failed with "Cannot use 'undefined' as a Firestore value (found
    // in field 'events.0.estimatedValueCents')" because a record nested
    // inside an array had an explicit `undefined` field, and the old
    // top-level-only `removeUndefined()` on the batch path didn't catch it.
    interface EventRecord {
      id: string;
      estimatedValueCents?: number;
      status: string;
    }
    interface ValueCaptureLikeData {
      events: EventRecord[];
    }

    it('flushes a batch containing a record with undefined nested inside an array', async () => {
      const vcStore = createPersistenceStore<ValueCaptureLikeData>({
        collection: 'test_value_capture',
        // Long enough that the background sync interval never fires during
        // this test, so only the explicit flush() call below exercises the
        // batch write — a short interval here raced with real wall-clock
        // timing and was flaky when run alongside other test files.
        syncIntervalMs: 60_000,
        maxPendingChanges: 20,
      });

      // Mirrors monetization/value-capture.ts building a ValueCaptureRecord
      // without a quantifiable value — note the explicit `undefined`, the
      // exact shape the source fix now avoids, used here to prove the
      // persistence layer itself is resilient regardless.
      vcStore.set('vc-user-1', {
        events: [{ id: 'evt1', estimatedValueCents: undefined, status: 'detected' }],
      });

      await expect(vcStore.flush()).resolves.not.toThrow();

      // The batch write Firestore actually saw must contain no `undefined`
      // anywhere in the tree (top-level OR nested in the array).
      expect(mockBatch.set).toHaveBeenCalled();
      const [, payload] = mockBatch.set.mock.calls.at(-1) as [unknown, Record<string, unknown>];
      expect(JSON.stringify(payload)).not.toContain('undefined');
      expect((payload.events as EventRecord[])[0]).not.toHaveProperty('estimatedValueCents');

      // The document stayed persisted (not re-queued as dirty after a
      // successful flush).
      expect(vcStore.getStats().dirty).toBe(0);

      await vcStore.shutdown();
    });

    it('isolates a single bad document so other users still persist after a batch failure', async () => {
      const isoStore = createPersistenceStore<TestData>({
        collection: 'test_isolation',
        // See comment in the previous test: avoid a real background flush
        // racing with the explicit flush() this test asserts on.
        syncIntervalMs: 60_000,
        maxPendingChanges: 20,
      });

      // Whole-batch commit fails once (simulates one invalid doc poisoning
      // the atomic batch commit).
      mockBatch.commit.mockRejectedValueOnce(
        new Error('Cannot use "undefined" as a Firestore value')
      );
      // Individual retry: only "bad-user"'s write keeps failing; everyone
      // else succeeds when retried one document at a time.
      mockDocRef.set.mockImplementation((data: unknown) => {
        const userId = (data as Record<string, unknown>)._userId;
        if (userId === 'bad-user') {
          return Promise.reject(new Error('still invalid'));
        }
        return Promise.resolve(undefined);
      });

      isoStore.set('good-user', { name: 'good', value: 1 });
      isoStore.set('bad-user', { name: 'bad', value: 2 });

      await expect(isoStore.flush()).resolves.not.toThrow();

      // Only the genuinely bad document is re-queued; the good one persisted.
      const stats = isoStore.getStats();
      expect(stats.dirty).toBe(1);

      await isoStore.shutdown();
      mockDocRef.set.mockReset();
      mockDocRef.set.mockResolvedValue(undefined);
    });
  });
});
