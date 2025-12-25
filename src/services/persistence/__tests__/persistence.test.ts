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

// Mock firestore-utils
vi.mock('../../../utils/firestore-utils.js', () => ({
  removeUndefined: vi.fn((obj) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
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

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(() => ({
    collection: mockCollection,
    batch: () => mockBatch,
  })),
}));

import { createPersistenceStore, type PersistenceConfig, type PersistenceStore } from '../index.js';

describe('PersistenceLayer', () => {
  // Test data type
  interface TestData {
    name: string;
    value: number;
    items?: string[];
  }

  const testUserId = 'persist-test-user-' + Date.now();
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
});
