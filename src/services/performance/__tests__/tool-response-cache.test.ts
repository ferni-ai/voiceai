/**
 * Tool Response Cache Tests
 *
 * Tests for the session-scoped tool response caching system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getToolResponseCache,
  resetToolResponseCache,
  checkToolCache,
  cacheToolResult,
  invalidateToolCache,
  clearSessionToolCache,
  getToolCacheMetrics,
  TTL_BY_TOOL,
  CACHE_INVALIDATION_MAP,
} from '../tool-response-cache.js';

describe('ToolResponseCache', () => {
  beforeEach(() => {
    resetToolResponseCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getToolResponseCache', () => {
    it('should return singleton instance', () => {
      const instance1 = getToolResponseCache();
      const instance2 = getToolResponseCache();
      expect(instance1).toBe(instance2);
    });

    it('should accept configuration', () => {
      resetToolResponseCache();
      const cache = getToolResponseCache({
        maxEntries: 50,
        defaultTtlMs: 10000,
        enabled: true,
      });
      expect(cache).toBeDefined();
    });
  });

  describe('TTL_BY_TOOL configuration', () => {
    it('should have expected TTL values for common tools', () => {
      expect(TTL_BY_TOOL.getweather).toBe(30000);
      expect(TTL_BY_TOOL.getcurrenttime).toBe(1000);
      expect(TTL_BY_TOOL.getnews).toBe(60000);
      expect(TTL_BY_TOOL.getquote).toBe(10000);
      expect(TTL_BY_TOOL.getcalendartoday).toBe(30000);
      expect(TTL_BY_TOOL.gethomestatus).toBe(10000);
    });

    it('should define TTLs for all cacheable read tools', () => {
      const expectedTools = [
        'getweather',
        'getcurrenttime',
        'getnews',
        'getmarketsummary',
        'getquote',
        'getcalendartoday',
        'gettasks',
        'gethomestatus',
      ];

      for (const tool of expectedTools) {
        expect(TTL_BY_TOOL[tool]).toBeDefined();
        expect(TTL_BY_TOOL[tool]).toBeGreaterThan(0);
      }
    });
  });

  describe('CACHE_INVALIDATION_MAP configuration', () => {
    it('should map write operations to affected caches', () => {
      expect(CACHE_INVALIDATION_MAP.addtask).toContain('gettasks');
      expect(CACHE_INVALIDATION_MAP.completetask).toContain('gettasks');
      expect(CACHE_INVALIDATION_MAP.createcalendarevent).toContain('getcalendartoday');
      expect(CACHE_INVALIDATION_MAP.addbill).toContain('getbills');
      expect(CACHE_INVALIDATION_MAP.controldevice).toContain('gethomestatus');
    });
  });

  describe('checkToolCache - cache miss', () => {
    it('should return miss for uncached tool', () => {
      const result = checkToolCache('session-1', 'getweather', { location: 'NYC' });

      expect(result.hit).toBe(false);
      expect(result.result).toBeUndefined();
    });

    it('should return miss for non-cacheable tools', () => {
      // First cache something
      cacheToolResult('session-1', 'sendmessage', { to: 'user' }, { sent: true });

      // Check should return miss (sendmessage not in TTL_BY_TOOL)
      const result = checkToolCache('session-1', 'sendmessage', { to: 'user' });

      expect(result.hit).toBe(false);
    });

    it('should treat tool names as case-insensitive', () => {
      cacheToolResult('session-1', 'getWeather', { location: 'NYC' }, { temp: 72 });

      const result = checkToolCache('session-1', 'GETWEATHER', { location: 'NYC' });

      expect(result.hit).toBe(true);
      expect(result.result).toEqual({ temp: 72 });
    });
  });

  describe('cacheToolResult and checkToolCache - cache hit', () => {
    it('should cache and retrieve tool result', () => {
      const weatherData = { temp: 68, condition: 'sunny' };

      cacheToolResult('session-1', 'getweather', { location: 'SF' }, weatherData);
      const result = checkToolCache('session-1', 'getweather', { location: 'SF' });

      expect(result.hit).toBe(true);
      expect(result.result).toEqual(weatherData);
    });

    it('should use args in cache key', () => {
      cacheToolResult('session-1', 'getweather', { location: 'NYC' }, { temp: 45 });
      cacheToolResult('session-1', 'getweather', { location: 'LA' }, { temp: 75 });

      const nycResult = checkToolCache('session-1', 'getweather', { location: 'NYC' });
      const laResult = checkToolCache('session-1', 'getweather', { location: 'LA' });

      expect(nycResult.result).toEqual({ temp: 45 });
      expect(laResult.result).toEqual({ temp: 75 });
    });

    it('should isolate caches by session', () => {
      cacheToolResult('session-1', 'getweather', { location: 'NYC' }, { temp: 50 });
      cacheToolResult('session-2', 'getweather', { location: 'NYC' }, { temp: 60 });

      const result1 = checkToolCache('session-1', 'getweather', { location: 'NYC' });
      const result2 = checkToolCache('session-2', 'getweather', { location: 'NYC' });

      expect(result1.result).toEqual({ temp: 50 });
      expect(result2.result).toEqual({ temp: 60 });
    });

    it('should track hit count in metrics', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });

      // Hit it multiple times
      checkToolCache('session-1', 'getweather', {});
      checkToolCache('session-1', 'getweather', {});
      checkToolCache('session-1', 'getweather', {});

      const metrics = getToolCacheMetrics();
      expect(metrics.hits).toBe(3);
    });
  });

  describe('TTL expiration', () => {
    it('should return miss after TTL expires', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });

      // Check immediately - should hit
      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(true);

      // Advance time past TTL (30 seconds for weather)
      vi.advanceTimersByTime(31000);

      // Now should miss
      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(false);
    });

    it('should respect tool-specific TTL', () => {
      // getcurrenttime has 1 second TTL
      cacheToolResult('session-1', 'getcurrenttime', {}, { time: '12:00' });

      // Still valid after 500ms
      vi.advanceTimersByTime(500);
      expect(checkToolCache('session-1', 'getcurrenttime', {}).hit).toBe(true);

      // Expired after 1.5 seconds
      vi.advanceTimersByTime(1000);
      expect(checkToolCache('session-1', 'getcurrenttime', {}).hit).toBe(false);
    });

    it('should handle longer TTLs (like getrelationshipsummary)', () => {
      // 2 minute TTL
      cacheToolResult('session-1', 'getrelationshipsummary', {}, { summary: 'data' });

      // Still valid after 1 minute
      vi.advanceTimersByTime(60000);
      expect(checkToolCache('session-1', 'getrelationshipsummary', {}).hit).toBe(true);

      // Still valid after 1:30
      vi.advanceTimersByTime(30000);
      expect(checkToolCache('session-1', 'getrelationshipsummary', {}).hit).toBe(true);

      // Expired after 2+ minutes
      vi.advanceTimersByTime(31000);
      expect(checkToolCache('session-1', 'getrelationshipsummary', {}).hit).toBe(false);
    });
  });

  describe('invalidateToolCache', () => {
    it('should invalidate related caches on write operation', () => {
      // Cache some tasks
      cacheToolResult('session-1', 'gettasks', {}, [{ id: 1, name: 'Task 1' }]);
      expect(checkToolCache('session-1', 'gettasks', {}).hit).toBe(true);

      // Add a task (write operation)
      invalidateToolCache('session-1', 'addtask');

      // Tasks cache should be invalidated
      expect(checkToolCache('session-1', 'gettasks', {}).hit).toBe(false);
    });

    it('should invalidate multiple related caches', () => {
      // Cache calendar data
      cacheToolResult('session-1', 'getcalendartoday', {}, { events: [] });
      cacheToolResult('session-1', 'getschedule', {}, { schedule: [] });
      cacheToolResult('session-1', 'getupcomingmeetings', {}, { meetings: [] });

      expect(checkToolCache('session-1', 'getcalendartoday', {}).hit).toBe(true);
      expect(checkToolCache('session-1', 'getschedule', {}).hit).toBe(true);
      expect(checkToolCache('session-1', 'getupcomingmeetings', {}).hit).toBe(true);

      // Create calendar event
      invalidateToolCache('session-1', 'createcalendarevent');

      // All should be invalidated
      expect(checkToolCache('session-1', 'getcalendartoday', {}).hit).toBe(false);
      expect(checkToolCache('session-1', 'getschedule', {}).hit).toBe(false);
      expect(checkToolCache('session-1', 'getupcomingmeetings', {}).hit).toBe(false);
    });

    it('should not affect unrelated caches', () => {
      cacheToolResult('session-1', 'gettasks', {}, { tasks: [] });
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });

      // Invalidate tasks
      invalidateToolCache('session-1', 'addtask');

      // Weather should still be cached
      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(true);
    });

    it('should not affect other sessions', () => {
      cacheToolResult('session-1', 'gettasks', {}, { tasks: [1] });
      cacheToolResult('session-2', 'gettasks', {}, { tasks: [2] });

      // Invalidate only session-1
      invalidateToolCache('session-1', 'addtask');

      expect(checkToolCache('session-1', 'gettasks', {}).hit).toBe(false);
      expect(checkToolCache('session-2', 'gettasks', {}).hit).toBe(true);
    });

    it('should do nothing for operations without invalidation mapping', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });

      // Some random write that doesn't have invalidation mapping
      invalidateToolCache('session-1', 'unknownwrite');

      // Weather should still be cached
      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(true);
    });
  });

  describe('clearSessionToolCache', () => {
    it('should clear all cache for a session', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });
      cacheToolResult('session-1', 'getnews', {}, { headlines: [] });
      cacheToolResult('session-1', 'gettasks', {}, { tasks: [] });

      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(true);
      expect(checkToolCache('session-1', 'getnews', {}).hit).toBe(true);

      clearSessionToolCache('session-1');

      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(false);
      expect(checkToolCache('session-1', 'getnews', {}).hit).toBe(false);
      expect(checkToolCache('session-1', 'gettasks', {}).hit).toBe(false);
    });

    it('should not affect other sessions', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });
      cacheToolResult('session-2', 'getweather', {}, { temp: 80 });

      clearSessionToolCache('session-1');

      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(false);
      expect(checkToolCache('session-2', 'getweather', {}).hit).toBe(true);
    });

    it('should handle clearing non-existent session gracefully', () => {
      // Should not throw
      expect(() => clearSessionToolCache('non-existent-session')).not.toThrow();
    });
  });

  describe('getToolCacheMetrics', () => {
    it('should return initial metrics with zeros', () => {
      const metrics = getToolCacheMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
      expect(metrics.totalSavedMs).toBe(0);
    });

    it('should track hits and misses', () => {
      // Miss
      checkToolCache('session-1', 'getweather', {});

      // Cache and hit
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });
      checkToolCache('session-1', 'getweather', {});
      checkToolCache('session-1', 'getweather', {});

      const metrics = getToolCacheMetrics();
      expect(metrics.misses).toBe(1);
      expect(metrics.hits).toBe(2);
    });

    it('should track estimated saved time', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });

      checkToolCache('session-1', 'getweather', {});
      checkToolCache('session-1', 'getweather', {});
      checkToolCache('session-1', 'getweather', {});

      const metrics = getToolCacheMetrics();
      // Each hit saves ~150ms (avgToolLatencyMs)
      expect(metrics.totalSavedMs).toBeGreaterThan(0);
    });
  });

  describe('resetToolResponseCache', () => {
    it('should reset the singleton', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });
      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(true);

      resetToolResponseCache();

      // New instance, cache is empty
      expect(checkToolCache('session-1', 'getweather', {}).hit).toBe(false);
    });

    it('should reset metrics', () => {
      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });
      checkToolCache('session-1', 'getweather', {});

      expect(getToolCacheMetrics().hits).toBe(1);

      resetToolResponseCache();

      expect(getToolCacheMetrics().hits).toBe(0);
    });
  });

  describe('cache key generation', () => {
    it('should differentiate by args order (sorted)', () => {
      // Args passed in different order should still hit same cache
      cacheToolResult('session-1', 'getweather', { a: 1, b: 2 }, { result: 'ab' });

      const result = checkToolCache('session-1', 'getweather', { b: 2, a: 1 });
      expect(result.hit).toBe(true);
      expect(result.result).toEqual({ result: 'ab' });
    });

    it('should differentiate by arg values', () => {
      cacheToolResult('session-1', 'getquote', { symbol: 'AAPL' }, { price: 150 });
      cacheToolResult('session-1', 'getquote', { symbol: 'GOOGL' }, { price: 140 });

      expect(checkToolCache('session-1', 'getquote', { symbol: 'AAPL' }).result).toEqual({
        price: 150,
      });
      expect(checkToolCache('session-1', 'getquote', { symbol: 'GOOGL' }).result).toEqual({
        price: 140,
      });
    });

    it('should handle complex arg values', () => {
      cacheToolResult(
        'session-1',
        'gettasks',
        { filter: { status: 'pending', priority: 'high' } },
        { tasks: ['task1'] }
      );

      const result = checkToolCache('session-1', 'gettasks', {
        filter: { status: 'pending', priority: 'high' },
      });

      expect(result.hit).toBe(true);
    });

    it('should handle empty args', () => {
      cacheToolResult('session-1', 'gettasks', {}, { tasks: [] });

      const result = checkToolCache('session-1', 'gettasks', {});
      expect(result.hit).toBe(true);
    });
  });

  describe('non-cacheable tools', () => {
    it('should not cache write operations', () => {
      // These tools are not in TTL_BY_TOOL
      cacheToolResult('session-1', 'addtask', { name: 'New task' }, { id: 123 });
      cacheToolResult('session-1', 'sendmessage', { to: 'user' }, { sent: true });
      cacheToolResult('session-1', 'createcalendarevent', {}, { created: true });

      expect(checkToolCache('session-1', 'addtask', { name: 'New task' }).hit).toBe(false);
      expect(checkToolCache('session-1', 'sendmessage', { to: 'user' }).hit).toBe(false);
      expect(checkToolCache('session-1', 'createcalendarevent', {}).hit).toBe(false);
    });

    it('should only cache tools listed in TTL_BY_TOOL', () => {
      const cache = getToolResponseCache();

      // Check isCacheable
      expect(cache.isCacheable('getweather')).toBe(true);
      expect(cache.isCacheable('getnews')).toBe(true);
      expect(cache.isCacheable('sendmessage')).toBe(false);
      expect(cache.isCacheable('rememberaboutuser')).toBe(false);
      expect(cache.isCacheable('unknowntool')).toBe(false);
    });
  });

  describe('disabled cache', () => {
    it('should not cache when disabled', () => {
      resetToolResponseCache();
      const cache = getToolResponseCache({ enabled: false });

      cacheToolResult('session-1', 'getweather', {}, { temp: 70 });
      const result = checkToolCache('session-1', 'getweather', {});

      expect(result.hit).toBe(false);
    });
  });
});
