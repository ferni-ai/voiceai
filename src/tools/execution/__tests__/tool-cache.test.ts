/**
 * Tool Cache Tests
 *
 * Tests the smart caching system with LRU eviction and tiered TTLs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { ToolResultCache, toolCache } from '../tool-cache.js';
import { DEFAULT_CACHE_CONFIGS } from '../types.js';

describe('Tool Cache', () => {
  let cache: ToolResultCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ToolResultCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    cache.stop(); // Stop cleanup timer
    vi.clearAllMocks();
  });

  describe('Basic Operations', () => {
    it('should set and get cached values', () => {
      cache.set('getNews', 'tech', { articles: ['a', 'b'] }, 'news');

      const result = cache.get('getNews', 'tech');

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ articles: ['a', 'b'] });
      expect(result!.freshness).toBe('fresh');
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent', 'key');

      expect(result).toBeNull();
    });

    it('should use tool name and key as composite cache key', () => {
      cache.set('tool1', 'key1', 'value1', 'news');
      cache.set('tool1', 'key2', 'value2', 'news');
      cache.set('tool2', 'key1', 'value3', 'news');

      expect(cache.get('tool1', 'key1')!.data).toBe('value1');
      expect(cache.get('tool1', 'key2')!.data).toBe('value2');
      expect(cache.get('tool2', 'key1')!.data).toBe('value3');
    });
  });

  describe('TTL Expiration', () => {
    it('should return null for expired cache entries via get()', () => {
      cache.set('getStockQuote', 'AAPL', { price: 150 }, 'stocks');

      // Advance past stock TTL (1 minute)
      vi.advanceTimersByTime(70 * 1000);

      const result = cache.get('getStockQuote', 'AAPL');

      expect(result).toBeNull();
    });

    it('should return value within TTL window', () => {
      cache.set('getWeather', 'NYC', { temp: 72 }, 'weather');

      // Advance but stay within weather TTL (15 minutes)
      vi.advanceTimersByTime(10 * 60 * 1000);

      const result = cache.get('getWeather', 'NYC');

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ temp: 72 });
      expect(result!.freshness).toBe('fresh');
    });

    it('should use category-specific TTLs', () => {
      // Stock cache expires quickly
      cache.set('stockTool', 'key', 'stockData', 'stocks');

      // News cache expires slower
      cache.set('newsTool', 'key', 'newsData', 'news');

      // After 2 minutes: stocks expired, news still valid
      vi.advanceTimersByTime(2 * 60 * 1000);

      expect(cache.get('stockTool', 'key')).toBeNull();
      expect(cache.get('newsTool', 'key')!.data).toBe('newsData');
    });
  });

  describe('getWithStaleness', () => {
    it('should return fresh data with freshness=fresh', () => {
      cache.set('getNews', 'tech', { articles: [] }, 'news');

      const result = cache.getWithStaleness('getNews', 'tech');

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ articles: [] });
      expect(result!.freshness).toBe('fresh');
    });

    it('should return stale data with freshness=stale', () => {
      cache.set('getNews', 'tech', { articles: [] }, 'news');

      // Advance past TTL (5 min) but within maxStaleAge (30 min)
      vi.advanceTimersByTime(10 * 60 * 1000);

      const result = cache.getWithStaleness('getNews', 'tech');

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ articles: [] });
      expect(result!.freshness).toBe('stale');
    });

    it('should return null for truly expired entries beyond max stale age', () => {
      cache.set('getNews', 'tech', { articles: [] }, 'news');

      // Advance way past stale threshold (30 minutes)
      vi.advanceTimersByTime(60 * 60 * 1000);

      const result = cache.getWithStaleness('getNews', 'tech');

      expect(result).toBeNull();
    });
  });

  describe('Cache Operations', () => {
    it('should invalidate specific entries', () => {
      cache.set('tool', 'key1', 'value1', 'news');
      cache.set('tool', 'key2', 'value2', 'news');

      cache.invalidate('tool', 'key1');

      expect(cache.get('tool', 'key1')).toBeNull();
      expect(cache.get('tool', 'key2')!.data).toBe('value2');
    });

    it('should invalidate all entries for a tool when no key provided', () => {
      cache.set('tool1', 'key1', 'value1', 'news');
      cache.set('tool1', 'key2', 'value2', 'news');
      cache.set('tool2', 'key1', 'value3', 'news');

      cache.invalidate('tool1');

      expect(cache.get('tool1', 'key1')).toBeNull();
      expect(cache.get('tool1', 'key2')).toBeNull();
      expect(cache.get('tool2', 'key1')!.data).toBe('value3');
    });

    it('should clear all entries', () => {
      cache.set('tool1', 'key1', 'value1', 'news');
      cache.set('tool2', 'key2', 'value2', 'stocks');

      cache.clear();

      expect(cache.get('tool1', 'key1')).toBeNull();
      expect(cache.get('tool2', 'key2')).toBeNull();
    });

    it('should check if entry exists with has()', () => {
      cache.set('tool', 'key', 'value', 'news');

      expect(cache.has('tool', 'key')).toBe(true);
      expect(cache.has('tool', 'nonexistent')).toBe(false);
    });

    it('should return cache stats', () => {
      cache.set('newsTool', 'key1', 'value1', 'news');
      cache.set('stockTool', 'key2', 'value2', 'stocks');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(500);
      expect(stats.categories).toHaveProperty('news');
      expect(stats.categories).toHaveProperty('stocks');
    });
  });

  describe('Default Category Configs', () => {
    it('should have correct TTLs for each category', () => {
      expect(DEFAULT_CACHE_CONFIGS.news.ttl).toBe(5 * 60 * 1000); // 5 min
      expect(DEFAULT_CACHE_CONFIGS.stocks.ttl).toBe(60 * 1000); // 1 min
      expect(DEFAULT_CACHE_CONFIGS.weather.ttl).toBe(15 * 60 * 1000); // 15 min
    });

    it('should have correct stale thresholds', () => {
      expect(DEFAULT_CACHE_CONFIGS.news.maxStaleAge).toBe(30 * 60 * 1000);
      expect(DEFAULT_CACHE_CONFIGS.stocks.maxStaleAge).toBe(5 * 60 * 1000);
    });

    it('should have staleWhileRevalidate settings', () => {
      expect(DEFAULT_CACHE_CONFIGS.news.staleWhileRevalidate).toBe(true);
      expect(DEFAULT_CACHE_CONFIGS.stocks.staleWhileRevalidate).toBe(false); // Stale stock data is dangerous
    });
  });

  describe('Configuration', () => {
    it('should allow updating cache config for a category', () => {
      cache.setConfig('news', { ttl: 10 * 60 * 1000 }); // 10 min instead of 5

      cache.set('getNews', 'tech', { articles: [] }, 'news');

      // After 7 minutes, should still be fresh with extended TTL
      vi.advanceTimersByTime(7 * 60 * 1000);

      const result = cache.get('getNews', 'tech');
      expect(result).not.toBeNull();
      expect(result!.freshness).toBe('fresh');
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton cache instance', () => {
      toolCache.set('singleton', 'test', 'value', 'news');

      const result = toolCache.get('singleton', 'test');
      expect(result).not.toBeNull();
      expect(result!.data).toBe('value');

      // Clear for other tests
      toolCache.clear();
    });
  });

  describe('Automatic Category Detection', () => {
    it('should detect news category from tool name', () => {
      cache.set('getFinancialNews', 'query', 'data');

      const stats = cache.getStats();
      expect(stats.categories.news).toBe(1);
    });

    it('should detect weather category from tool name', () => {
      cache.set('getWeatherForecast', 'nyc', 'data');

      const stats = cache.getStats();
      expect(stats.categories.weather).toBe(1);
    });

    it('should detect stock category from tool name', () => {
      cache.set('getStockQuote', 'AAPL', 'data');

      const stats = cache.getStats();
      expect(stats.categories.stocks).toBe(1);
    });

    it('should use default category for unrecognized tools', () => {
      cache.set('someRandomTool', 'key', 'data');

      const stats = cache.getStats();
      expect(stats.categories.default).toBe(1);
    });
  });
});
