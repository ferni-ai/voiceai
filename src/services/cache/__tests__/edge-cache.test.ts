/**
 * Edge Cache Service Tests
 *
 * Tests for LRU cache with TTL, stale-while-revalidate, and cache warming.
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

import {
  EdgeCache,
  getPersonaBundleCache,
  getConfigCache,
  cachePersonaBundle,
  getCachedPersonaBundle,
  cacheConfig,
  getCachedConfig,
  type CacheConfig,
} from '../edge-cache.js';

describe('EdgeCache', () => {
  describe('constructor', () => {
    it('should create cache with default config', () => {
      const cache = new EdgeCache();
      const stats = cache.getStats();

      expect(stats.maxSize).toBe(1000);
      expect(stats.currentSize).toBe(0);
    });

    it('should accept custom config', () => {
      const cache = new EdgeCache({
        maxSize: 100,
        defaultTtlMs: 60000,
      });
      const stats = cache.getStats();

      expect(stats.maxSize).toBe(100);
    });
  });

  describe('get/set', () => {
    let cache: EdgeCache<string>;

    beforeEach(() => {
      cache = new EdgeCache<string>({
        maxSize: 10,
        defaultTtlMs: 1000,
        staleWhileRevalidate: false,
      });
    });

    it('should return null for missing key', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should store and retrieve value', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');

      expect(result).toBe('value1');
    });

    it('should track hit statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key1');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track miss statistics', () => {
      cache.get('missing1');
      cache.get('missing2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should update currentSize', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.currentSize).toBe(2);
    });

    it('should calculate hit rate', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.67, 1);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const cache = new EdgeCache<string>({
        defaultTtlMs: 50,
        staleWhileRevalidate: false,
      });

      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');

      await new Promise<void>((r) => {
        setTimeout(r, 100);
      });

      expect(cache.get('key')).toBeNull();
    });

    it('should respect custom TTL per entry', async () => {
      const cache = new EdgeCache<string>({
        defaultTtlMs: 1000,
        staleWhileRevalidate: false,
      });

      cache.set('short', 'value', 50);
      cache.set('long', 'value', 500);

      await new Promise<void>((r) => {
        setTimeout(r, 100);
      });

      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value');
    });
  });

  describe('stale-while-revalidate', () => {
    it('should return stale value within grace period', async () => {
      const cache = new EdgeCache<string>({
        defaultTtlMs: 50,
        staleWhileRevalidate: true,
        staleTtlMs: 100,
      });

      cache.set('key', 'value');
      await new Promise<void>((r) => {
        setTimeout(r, 70);
      }); // Past TTL, within stale grace

      const result = cache.get('key');
      expect(result).toBe('value');
    });

    it('should track stale hits in stats', async () => {
      const cache = new EdgeCache<string>({
        defaultTtlMs: 50,
        staleWhileRevalidate: true,
        staleTtlMs: 100,
      });

      cache.set('key', 'value');
      await new Promise<void>((r) => {
        setTimeout(r, 70);
      });

      cache.get('key'); // stale hit

      const stats = cache.getStats();
      expect(stats.staleHits).toBe(1);
    });

    it('should return null after stale grace period', async () => {
      const cache = new EdgeCache<string>({
        defaultTtlMs: 30,
        staleWhileRevalidate: true,
        staleTtlMs: 30,
      });

      cache.set('key', 'value');
      await new Promise<void>((r) => {
        setTimeout(r, 100);
      }); // Past both TTL and stale grace

      expect(cache.get('key')).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      const cache = new EdgeCache<string>({ maxSize: 3 });

      cache.set('first', 'value1');
      cache.set('second', 'value2');
      cache.set('third', 'value3');
      cache.set('fourth', 'value4'); // Should evict 'first'

      expect(cache.get('first')).toBeNull();
      expect(cache.get('fourth')).toBe('value4');
    });

    it('should track eviction statistics', () => {
      const cache = new EdgeCache<string>({ maxSize: 2 });

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3'); // evicts 'a'
      cache.set('d', '4'); // evicts 'b'

      const stats = cache.getStats();
      expect(stats.evictions).toBe(2);
    });

    it('should update LRU order on access', () => {
      const cache = new EdgeCache<string>({ maxSize: 3 });

      cache.set('first', 'value1');
      cache.set('second', 'value2');
      cache.set('third', 'value3');

      cache.get('first'); // Move 'first' to end (most recently used)

      cache.set('fourth', 'value4'); // Should evict 'second' now

      expect(cache.get('first')).toBe('value1');
      expect(cache.get('second')).toBeNull();
    });

    it('should not evict when updating existing key', () => {
      const cache = new EdgeCache<string>({ maxSize: 2 });

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('a', 'updated'); // Update, not new entry

      expect(cache.get('a')).toBe('updated');
      expect(cache.get('b')).toBe('2');

      const stats = cache.getStats();
      expect(stats.evictions).toBe(0);
    });
  });

  describe('getOrFetch', () => {
    let cache: EdgeCache<string>;

    beforeEach(() => {
      cache = new EdgeCache<string>({
        defaultTtlMs: 1000,
        staleWhileRevalidate: false,
      });
    });

    it('should return cached value without calling fetch', async () => {
      cache.set('key', 'cached');
      const fetchFn = vi.fn().mockResolvedValue('fresh');

      const result = await cache.getOrFetch('key', fetchFn);

      expect(result).toBe('cached');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should call fetch on cache miss', async () => {
      const fetchFn = vi.fn().mockResolvedValue('fresh');

      const result = await cache.getOrFetch('key', fetchFn);

      expect(result).toBe('fresh');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should cache the fetched value', async () => {
      const fetchFn = vi.fn().mockResolvedValue('fresh');

      await cache.getOrFetch('key', fetchFn);
      const cached = cache.get('key');

      expect(cached).toBe('fresh');
    });

    it('should force refresh when requested', async () => {
      cache.set('key', 'old');
      const fetchFn = vi.fn().mockResolvedValue('new');

      const result = await cache.getOrFetch('key', fetchFn, { forceRefresh: true });

      expect(result).toBe('new');
      expect(fetchFn).toHaveBeenCalled();
    });

    it('should return stale value on fetch error', async () => {
      cache.set('key', 'stale');
      const fetchFn = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      // Force the entry to be considered "valid enough to use as fallback"
      const result = await cache.getOrFetch('key', fetchFn, { forceRefresh: true });

      expect(result).toBe('stale');
    });

    it('should throw error when no cached value exists', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      await expect(cache.getOrFetch('missing', fetchFn)).rejects.toThrow('Fetch failed');
    });
  });

  describe('delete', () => {
    it('should remove entry from cache', () => {
      const cache = new EdgeCache<string>();

      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');

      const deleted = cache.delete('key');
      expect(deleted).toBe(true);
      expect(cache.get('key')).toBeNull();
    });

    it('should return false for missing key', () => {
      const cache = new EdgeCache<string>();

      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should update size after delete', () => {
      const cache = new EdgeCache<string>();

      cache.set('key', 'value');
      expect(cache.getStats().currentSize).toBe(1);

      cache.delete('key');
      expect(cache.getStats().currentSize).toBe(0);
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      const cache = new EdgeCache<string>({ defaultTtlMs: 1000 });

      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for missing key', () => {
      const cache = new EdgeCache<string>();

      expect(cache.has('missing')).toBe(false);
    });

    it('should return false for expired key', async () => {
      const cache = new EdgeCache<string>({ defaultTtlMs: 50 });

      cache.set('key', 'value');
      await new Promise<void>((r) => {
        setTimeout(r, 100);
      });

      expect(cache.has('key')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new EdgeCache<string>();

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      cache.clear();

      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).toBeNull();
      expect(cache.getStats().currentSize).toBe(0);
    });
  });

  describe('keys', () => {
    it('should return all keys', () => {
      const cache = new EdgeCache<string>();

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      const keys = cache.keys();

      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys).toHaveLength(3);
    });

    it('should return empty array for empty cache', () => {
      const cache = new EdgeCache<string>();

      expect(cache.keys()).toEqual([]);
    });
  });

  describe('warmCache', () => {
    it('should warm multiple entries', async () => {
      const cache = new EdgeCache<string>();

      const result = await cache.warmCache([
        { key: 'a', fetchFn: async () => 'value-a' },
        { key: 'b', fetchFn: async () => 'value-b' },
        { key: 'c', fetchFn: async () => 'value-c' },
      ]);

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(cache.get('a')).toBe('value-a');
      expect(cache.get('b')).toBe('value-b');
      expect(cache.get('c')).toBe('value-c');
    });

    it('should handle fetch failures gracefully', async () => {
      const cache = new EdgeCache<string>();

      const result = await cache.warmCache([
        { key: 'a', fetchFn: async () => 'value-a' },
        {
          key: 'b',
          fetchFn: async () => {
            throw new Error('Fetch failed');
          },
        },
        { key: 'c', fetchFn: async () => 'value-c' },
      ]);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should use custom TTL when provided', async () => {
      const cache = new EdgeCache<string>({
        defaultTtlMs: 1000,
        staleWhileRevalidate: false,
      });

      await cache.warmCache([{ key: 'short', fetchFn: async () => 'value', ttlMs: 50 }]);

      expect(cache.get('short')).toBe('value');

      await new Promise<void>((r) => {
        setTimeout(r, 100);
      });

      expect(cache.get('short')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return complete statistics', () => {
      const cache = new EdgeCache<string>({ maxSize: 100 });

      cache.set('a', '1');
      cache.get('a');
      cache.get('missing');

      const stats = cache.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('staleHits');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('currentSize');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('avgAccessCount');
    });

    it('should calculate average access count', () => {
      const cache = new EdgeCache<string>();

      cache.set('a', '1');
      cache.set('b', '2');
      cache.get('a');
      cache.get('a');
      cache.get('a');
      cache.get('b');

      const stats = cache.getStats();
      expect(stats.avgAccessCount).toBe(2); // (3 + 1) / 2
    });
  });

  describe('Persona Bundle Cache', () => {
    it('should return singleton instance', () => {
      const cache1 = getPersonaBundleCache();
      const cache2 = getPersonaBundleCache();

      expect(cache1).toBe(cache2);
    });

    it('should cache and retrieve persona bundle', () => {
      const bundle = { id: 'test', name: 'Test Persona' };

      cachePersonaBundle('test', bundle);
      const cached = getCachedPersonaBundle('test');

      expect(cached).toEqual(bundle);
    });

    it('should return null for missing bundle', () => {
      const cached = getCachedPersonaBundle('nonexistent-' + Date.now());

      expect(cached).toBeNull();
    });
  });

  describe('Config Cache', () => {
    it('should return singleton instance', () => {
      const cache1 = getConfigCache();
      const cache2 = getConfigCache();

      expect(cache1).toBe(cache2);
    });

    it('should cache and retrieve config', () => {
      const configKey = 'test-config-' + Date.now();
      const configValue = { setting: 'value' };

      cacheConfig(configKey, configValue);
      const cached = getCachedConfig<typeof configValue>(configKey);

      expect(cached).toEqual(configValue);
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-serializable values for size estimation', () => {
      const cache = new EdgeCache<object>();
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      // Should not throw
      expect(() => cache.set('circular', circular)).not.toThrow();
    });

    it('should handle concurrent operations', async () => {
      const cache = new EdgeCache<string>();

      await Promise.all([
        cache.getOrFetch('key', async () => 'value1'),
        cache.getOrFetch('key', async () => 'value2'),
        cache.getOrFetch('key', async () => 'value3'),
      ]);

      // One of the values should be cached
      expect(cache.get('key')).toBeDefined();
    });

    it('should handle empty string keys', () => {
      const cache = new EdgeCache<string>();

      cache.set('', 'empty-key-value');
      expect(cache.get('')).toBe('empty-key-value');
    });
  });
});
