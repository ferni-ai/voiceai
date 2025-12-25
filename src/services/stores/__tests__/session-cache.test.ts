/**
 * Session Cache Service Tests
 *
 * Tests for session cache with memory and Redis backend.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Redis cache
vi.mock('../../../memory/redis-cache.js', () => ({
  getRedisCache: vi.fn().mockReturnValue({
    initialize: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(null),
    setSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

import {
  SessionCache,
  getProductivityCache,
  getContextCache,
  getUserDataCache,
  getAllCacheStats,
  type CacheStats,
} from '../session-cache.js';

describe('SessionCache', () => {
  describe('constructor', () => {
    it('should create cache with default config', () => {
      const cache = new SessionCache();
      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should accept custom config', () => {
      const cache = new SessionCache({
        maxEntries: 100,
        defaultTtlMs: 60000,
        keyPrefix: 'custom:',
      });

      // Config is internal, but we can verify it works
      expect(cache).toBeDefined();
    });
  });

  describe('get/set (memory only)', () => {
    let cache: SessionCache<string>;

    beforeEach(() => {
      cache = new SessionCache<string>({
        maxEntries: 10,
        defaultTtlMs: 1000,
        useRedis: false, // Memory only
        keyPrefix: 'test:',
      });
    });

    afterEach(async () => {
      await cache.shutdown();
    });

    it('should return null for missing key', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should store and retrieve value', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.get('key1');

      expect(result).toBe('value1');
    });

    it('should track hit statistics', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('key1');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track miss statistics', async () => {
      await cache.get('missing1');
      await cache.get('missing2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should update size after set', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const cache = new SessionCache<string>({
        defaultTtlMs: 50,
        useRedis: false,
        keyPrefix: 'ttl-test:',
      });

      await cache.set('key', 'value');
      expect(await cache.get('key')).toBe('value');

      await new Promise((r) => setTimeout(r, 100));

      expect(await cache.get('key')).toBeNull();
      await cache.shutdown();
    });

    it('should respect custom TTL per entry', async () => {
      const cache = new SessionCache<string>({
        defaultTtlMs: 1000,
        useRedis: false,
        keyPrefix: 'custom-ttl:',
      });

      await cache.set('short', 'value', 50);
      await cache.set('long', 'value', 500);

      await new Promise((r) => setTimeout(r, 100));

      expect(await cache.get('short')).toBeNull();
      expect(await cache.get('long')).toBe('value');
      await cache.shutdown();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', async () => {
      const cache = new SessionCache<string>({
        maxEntries: 3,
        useRedis: false,
        keyPrefix: 'lru:',
      });

      await cache.set('first', 'value1');
      await cache.set('second', 'value2');
      await cache.set('third', 'value3');

      // Access 'first' to make it more recent
      await cache.get('first');

      await cache.set('fourth', 'value4'); // Should evict 'second' (least recently used)

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
      await cache.shutdown();
    });

    it('should track eviction statistics', async () => {
      const cache = new SessionCache<string>({
        maxEntries: 2,
        useRedis: false,
        keyPrefix: 'evict:',
      });

      await cache.set('a', '1');
      await cache.set('b', '2');
      await cache.set('c', '3'); // evicts one
      await cache.set('d', '4'); // evicts one

      const stats = cache.getStats();
      expect(stats.evictions).toBe(2);
      await cache.shutdown();
    });
  });

  describe('delete', () => {
    it('should remove entry from cache', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'del:',
      });

      await cache.set('key', 'value');
      expect(await cache.get('key')).toBe('value');

      await cache.delete('key');
      expect(await cache.get('key')).toBeNull();
      await cache.shutdown();
    });
  });

  describe('deleteByPrefix', () => {
    it('should delete entries matching prefix', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'prefix-test:',
      });

      await cache.set('user:123:data', 'data1');
      await cache.set('user:123:prefs', 'prefs1');
      await cache.set('user:456:data', 'data2');

      const deleted = await cache.deleteByPrefix('user:123');

      expect(deleted).toBe(2);
      expect(await cache.get('user:123:data')).toBeNull();
      expect(await cache.get('user:123:prefs')).toBeNull();
      expect(await cache.get('user:456:data')).toBe('data2');
      await cache.shutdown();
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'clear:',
      });

      await cache.set('a', '1');
      await cache.set('b', '2');
      await cache.set('c', '3');

      await cache.clear();

      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
      expect(await cache.get('c')).toBeNull();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      await cache.shutdown();
    });
  });

  describe('getStats', () => {
    it('should return complete statistics', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'stats:',
      });

      await cache.set('a', '1');
      await cache.get('a');
      await cache.get('missing');

      const stats = cache.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('memoryBytes');
      expect(stats).toHaveProperty('redisConnected');
      await cache.shutdown();
    });

    it('should estimate memory usage', async () => {
      const cache = new SessionCache<object>({
        useRedis: false,
        keyPrefix: 'memory:',
      });

      await cache.set('key', { data: 'x'.repeat(1000) });

      const stats = cache.getStats();
      expect(stats.memoryBytes).toBeGreaterThan(0);
      await cache.shutdown();
    });
  });

  describe('shutdown', () => {
    it('should clear cache on shutdown', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'shutdown:',
      });

      await cache.set('key', 'value');
      await cache.shutdown();

      // After shutdown, cache should be empty
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('Singleton Caches', () => {
    describe('getProductivityCache', () => {
      it('should return singleton instance', () => {
        const cache1 = getProductivityCache();
        const cache2 = getProductivityCache();

        expect(cache1).toBe(cache2);
      });

      it('should have correct key prefix', async () => {
        const cache = getProductivityCache();

        await cache.set('task-123', { title: 'Test' });
        const result = await cache.get('task-123');

        expect(result).toEqual({ title: 'Test' });
      });
    });

    describe('getContextCache', () => {
      it('should return singleton instance', () => {
        const cache1 = getContextCache();
        const cache2 = getContextCache();

        expect(cache1).toBe(cache2);
      });
    });

    describe('getUserDataCache', () => {
      it('should return singleton instance', () => {
        const cache1 = getUserDataCache();
        const cache2 = getUserDataCache();

        expect(cache1).toBe(cache2);
      });
    });
  });

  describe('getAllCacheStats', () => {
    it('should return stats for all caches', () => {
      // Ensure caches are initialized
      getProductivityCache();
      getContextCache();
      getUserDataCache();

      const allStats = getAllCacheStats();

      expect(allStats).toHaveProperty('productivity');
      expect(allStats).toHaveProperty('context');
      expect(allStats).toHaveProperty('userData');
      expect(allStats).toHaveProperty('total');
    });

    it('should calculate total statistics', async () => {
      const prodCache = getProductivityCache();
      const ctxCache = getContextCache();

      await prodCache.set('test1', { a: 1 });
      await ctxCache.set('test2', { b: 2 });

      const allStats = getAllCacheStats();

      expect(allStats.total.size).toBeGreaterThanOrEqual(2);
    });

    it('should calculate total hit rate', async () => {
      const prodCache = getProductivityCache();

      await prodCache.set('hit-test', { data: 'test' });
      await prodCache.get('hit-test'); // hit
      await prodCache.get('missing'); // miss

      const allStats = getAllCacheStats();

      expect(typeof allStats.total.hitRate).toBe('number');
      expect(allStats.total.hitRate).toBeGreaterThanOrEqual(0);
      expect(allStats.total.hitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string keys', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'empty:',
      });

      await cache.set('', 'empty-key-value');
      expect(await cache.get('')).toBe('empty-key-value');
      await cache.shutdown();
    });

    it('should handle null-like values', async () => {
      const cache = new SessionCache<unknown>({
        useRedis: false,
        keyPrefix: 'null:',
      });

      await cache.set('empty-string', '');
      await cache.set('zero', 0);
      await cache.set('false', false);

      expect(await cache.get('empty-string')).toBe('');
      expect(await cache.get('zero')).toBe(0);
      expect(await cache.get('false')).toBe(false);
      await cache.shutdown();
    });

    it('should handle complex objects', async () => {
      const cache = new SessionCache<object>({
        useRedis: false,
        keyPrefix: 'complex:',
      });

      const complexObj = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        date: new Date().toISOString(),
      };

      await cache.set('complex', complexObj);
      const result = await cache.get('complex');

      expect(result).toEqual(complexObj);
      await cache.shutdown();
    });

    it('should handle concurrent get/set operations', async () => {
      const cache = new SessionCache<string>({
        useRedis: false,
        keyPrefix: 'concurrent:',
      });

      await Promise.all([
        cache.set('key1', 'value1'),
        cache.set('key2', 'value2'),
        cache.set('key3', 'value3'),
        cache.get('key1'),
        cache.get('key2'),
      ]);

      // All operations should complete without error
      expect(await cache.get('key1')).toBe('value1');
      expect(await cache.get('key2')).toBe('value2');
      expect(await cache.get('key3')).toBe('value3');
      await cache.shutdown();
    });

    it('should handle non-serializable values for memory estimation', async () => {
      const cache = new SessionCache<object>({
        useRedis: false,
        keyPrefix: 'non-serial:',
      });

      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      // Should not throw
      await cache.set('circular', circular);
      const stats = cache.getStats();
      expect(stats.memoryBytes).toBeGreaterThan(0);
      await cache.shutdown();
    });
  });

  describe('Redis integration (mocked)', () => {
    it('should initialize with Redis when enabled', async () => {
      const cache = new SessionCache<string>({
        useRedis: true,
        keyPrefix: 'redis-test:',
      });

      await cache.initialize();

      const stats = cache.getStats();
      expect(stats.redisConnected).toBe(true);
      await cache.shutdown();
    });

    it('should fall back to memory when Redis unavailable', async () => {
      const { getRedisCache } = await import('../../../memory/redis-cache.js');
      (getRedisCache as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        initialize: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      }));

      const cache = new SessionCache<string>({
        useRedis: true,
        keyPrefix: 'fallback:',
      });

      await cache.initialize();

      // Should still work with memory-only
      await cache.set('key', 'value');
      expect(await cache.get('key')).toBe('value');
      await cache.shutdown();
    });
  });
});
