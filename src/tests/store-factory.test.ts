/**
 * Store Factory Tests
 *
 * Tests for the store factory:
 * - getStore: async store initialization with environment-based selection
 * - getStoreSync: synchronous store access
 * - resetStore: clearing singleton instance
 * - setStore: dependency injection support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MemoryStore } from '../memory/store.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}));

// Mock the stores
vi.mock('../memory/in-memory-store.js', () => ({
  getDefaultStore: vi.fn(() => ({
    type: 'in-memory',
    initialize: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../memory/firestore-store.js', () => ({
  getFirestoreStore: vi.fn(() => ({
    type: 'firestore',
    initialize: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../memory/postgres-store.js', () => ({
  getPostgresStore: vi.fn(() => ({
    type: 'postgres',
    initialize: vi.fn(),
    close: vi.fn(),
  })),
}));

import {
  getStore,
  getStoreSync,
  resetStore,
  setStore,
} from '../memory/store-factory.js';
import { getDefaultStore } from '../memory/in-memory-store.js';

describe('Store Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getStore', () => {
    it('should return in-memory store by default in development', async () => {
      const store = await getStore();

      expect(store).toBeDefined();
      expect(getDefaultStore).toHaveBeenCalled();
    });

    it('should return same instance on subsequent calls (singleton)', async () => {
      const store1 = await getStore();
      const store2 = await getStore();

      expect(store1).toBe(store2);
    });

    it('should use in-memory store when no env vars set', async () => {
      const store = await getStore();

      expect(store).toBeDefined();
      expect(getDefaultStore).toHaveBeenCalled();
    });
  });

  describe('getStoreSync', () => {
    it('should return null before initialization', () => {
      const store = getStoreSync();

      expect(store).toBeNull();
    });

    it('should return store after initialization', async () => {
      await getStore(); // Initialize

      const store = getStoreSync();

      expect(store).not.toBeNull();
    });
  });

  describe('resetStore', () => {
    it('should clear the singleton instance', async () => {
      await getStore(); // Initialize
      expect(getStoreSync()).not.toBeNull();

      resetStore();

      expect(getStoreSync()).toBeNull();
    });

    it('should allow getting a new instance after reset', async () => {
      const store1 = await getStore();
      resetStore();
      const store2 = await getStore();

      // Different calls to getDefaultStore should be made
      expect(getDefaultStore).toHaveBeenCalledTimes(2);
    });
  });

  describe('setStore', () => {
    it('should allow setting a custom store', async () => {
      const customStore = {
        type: 'custom',
        initialize: vi.fn(),
        close: vi.fn(),
      } as unknown as MemoryStore;

      setStore(customStore);
      const store = getStoreSync();

      expect(store).toBe(customStore);
    });

    it('should override existing store', async () => {
      await getStore(); // Initialize with default

      const customStore = {
        type: 'custom-override',
        initialize: vi.fn(),
        close: vi.fn(),
      } as unknown as MemoryStore;

      setStore(customStore);
      const store = getStoreSync();

      expect(store).toBe(customStore);
    });

    it('should be used by subsequent getStore calls', async () => {
      const customStore = {
        type: 'custom-set',
        initialize: vi.fn(),
        close: vi.fn(),
      } as unknown as MemoryStore;

      setStore(customStore);
      const store = await getStore();

      expect(store).toBe(customStore);
    });
  });

  describe('Environment-based selection', () => {
    it('should use in-memory store in development without DATABASE_URL', async () => {
      process.env.NODE_ENV = 'development';

      const store = await getStore();

      expect(store).toBeDefined();
      expect(getDefaultStore).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should fallback to in-memory on store initialization error', async () => {
      // Mock Firestore to throw
      const { getFirestoreStore } = await import('../memory/firestore-store.js');
      vi.mocked(getFirestoreStore).mockImplementation(() => {
        throw new Error('Firestore unavailable');
      });

      process.env.NODE_ENV = 'production';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      resetStore();
      const store = await getStore();

      // Should fallback to in-memory
      expect(store).toBeDefined();
      expect(getDefaultStore).toHaveBeenCalled();
    });
  });
});
