/**
 * Tests for LRU (Least Recently Used) Cache
 *
 * Tests the cache implementation used across intelligence modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LRUCache, CACHE_SIZES } from '../lru-cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  describe('basic operations', () => {
    it('sets and gets values', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('returns undefined for missing keys', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('tracks size correctly', () => {
      expect(cache.size).toBe(0);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
    });

    it('updates value for existing key', () => {
      cache.set('a', 1);
      cache.set('a', 10);
      expect(cache.get('a')).toBe(10);
      expect(cache.size).toBe(1);
    });

    it('checks if key exists', () => {
      expect(cache.has('a')).toBe(false);
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
    });

    it('deletes keys', () => {
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      const deleted = cache.delete('a');
      expect(deleted).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('returns false when deleting non-existent key', () => {
      const deleted = cache.delete('missing');
      expect(deleted).toBe(false);
    });

    it('clears all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.size).toBe(3);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('evicts least recently used when at capacity', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.size).toBe(3);

      // Adding 'd' should evict 'a' (first added, never accessed)
      cache.set('d', 4);
      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('get() marks key as recently used', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to mark it as recently used
      cache.get('a');

      // Now add 'd' - should evict 'b' (oldest untouched)
      cache.set('d', 4);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('set() with existing key marks as recently used', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to mark it as recently used
      cache.set('a', 10);

      // Now add 'd' - should evict 'b' (oldest untouched)
      cache.set('d', 4);
      expect(cache.has('a')).toBe(true);
      expect(cache.get('a')).toBe(10);
      expect(cache.has('b')).toBe(false);
    });

    it('maintains correct order through multiple operations', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access in different order
      cache.get('c');
      cache.get('a');
      cache.get('b');

      // Order should now be: c, a, b (from least to most recent)
      // Adding 'd' should evict 'c'
      cache.set('d', 4);
      expect(cache.has('c')).toBe(false);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('iteration methods', () => {
    it('iterates over values', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      const values = Array.from(cache.values());
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain(3);
      expect(values.length).toBe(3);
    });

    it('iterates over entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const entries = Array.from(cache.entries());
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
      expect(entries.length).toBe(2);
    });

    it('iterates over keys', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      const keys = Array.from(cache.keys());
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys.length).toBe(3);
    });

    it('returns empty iterators for empty cache', () => {
      expect(Array.from(cache.values())).toEqual([]);
      expect(Array.from(cache.entries())).toEqual([]);
      expect(Array.from(cache.keys())).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles cache of size 1', () => {
      const tinyCache = new LRUCache<string, number>(1);
      tinyCache.set('a', 1);
      expect(tinyCache.get('a')).toBe(1);

      tinyCache.set('b', 2);
      expect(tinyCache.has('a')).toBe(false);
      expect(tinyCache.get('b')).toBe(2);
    });

    it('handles large max size', () => {
      const largeCache = new LRUCache<number, string>(1000);
      for (let i = 0; i < 500; i++) {
        largeCache.set(i, `value-${i}`);
      }
      expect(largeCache.size).toBe(500);
      expect(largeCache.get(0)).toBe('value-0');
      expect(largeCache.get(499)).toBe('value-499');
    });

    it('works with complex value types', () => {
      const objectCache = new LRUCache<string, { name: string; count: number }>(3);
      objectCache.set('user1', { name: 'Alice', count: 10 });
      objectCache.set('user2', { name: 'Bob', count: 20 });

      const user1 = objectCache.get('user1');
      expect(user1?.name).toBe('Alice');
      expect(user1?.count).toBe(10);
    });

    it('works with numeric keys', () => {
      const numCache = new LRUCache<number, string>(3);
      numCache.set(1, 'one');
      numCache.set(2, 'two');
      expect(numCache.get(1)).toBe('one');
      expect(numCache.get(2)).toBe('two');
    });

    it('handles getting undefined value vs missing key', () => {
      const undefinedCache = new LRUCache<string, undefined | number>(3);
      undefinedCache.set('explicit-undefined', undefined);
      undefinedCache.set('has-value', 42);

      // Both return undefined but for different reasons
      // Note: has() distinguishes between them
      expect(undefinedCache.has('explicit-undefined')).toBe(true);
      expect(undefinedCache.has('missing')).toBe(false);
    });
  });
});

describe('CACHE_SIZES', () => {
  it('defines reasonable cache sizes', () => {
    expect(CACHE_SIZES.USER_ENGINES).toBe(500);
    expect(CACHE_SIZES.RESPONSE_TRACKERS).toBe(500);
    expect(CACHE_SIZES.PATTERN_ANALYZERS).toBe(500);
    expect(CACHE_SIZES.PACE_ADAPTERS).toBe(500);
    expect(CACHE_SIZES.HUMOR_CALIBRATION).toBe(500);
    expect(CACHE_SIZES.STORY_PREFERENCE).toBe(500);
    expect(CACHE_SIZES.COMMUNICATION_MIRRORING).toBe(500);
    expect(CACHE_SIZES.EMOTIONAL_MEMORY).toBe(500);
    expect(CACHE_SIZES.FINANCIAL_JOURNEY).toBe(500);
  });

  it('all cache sizes are positive numbers', () => {
    Object.values(CACHE_SIZES).forEach((size) => {
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
    });
  });
});
