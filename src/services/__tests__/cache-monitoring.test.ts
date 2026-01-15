/**
 * Cache Monitoring Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../persona-content-loader.js', () => ({
  getContentCacheStats: vi.fn(() => ({
    behaviors: { size: 10, hits: 100, misses: 20, evictions: 5, hitRate: 0.83 },
    content: { size: 50, hits: 500, misses: 100, evictions: 10, hitRate: 0.83 },
  })),
  pruneExpiredContent: vi.fn(() => ({ behaviors: 2, content: 5 })),
}));

vi.mock('../../intelligence/context-builders/index.js', () => ({
  getContextOutputCacheStats: vi.fn(() => ({
    size: 25,
    hits: 200,
    misses: 50,
    evictions: 3,
    hitRate: 0.8,
  })),
  getRegistryStats: vi.fn(() => ({
    totalBuilders: 15,
    byCategory: { emotional: 3, memory: 2, topic: 5, identity: 3, utility: 2 },
    cacheStatus: { sortedAll: true, sortedByCategory: 5 },
  })),
}));

vi.mock('../../personas/cognitive-advanced.js', () => ({
  getCognitiveStyleCacheStats: vi.fn(() => ({
    size: 30,
    hits: 150,
    misses: 40,
    evictions: 2,
    hitRate: 0.79,
  })),
}));

vi.mock('../../memory/embedding-cache.js', () => ({
  getEmbeddingCache: vi.fn(() => ({
    getStats: () => ({
      size: 100,
      hits: 1000,
      misses: 200,
      evictions: 50,
      hitRate: 0.83,
    }),
    pruneExpired: vi.fn(() => 10),
  })),
}));

vi.mock('../../memory/redis-cache.js', () => ({
  getRedisCache: vi.fn(() => ({
    isConnected: () => true,
  })),
}));

// Import after mocks
import {
  getCacheMonitoringSnapshot,
  getCacheSummaryReport,
  runCacheMaintenance,
  checkCacheHealth,
  startCacheMaintenance,
  stopCacheMaintenance,
} from '../cache-monitoring.js';

describe('Cache Monitoring Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopCacheMaintenance();
    vi.useRealTimers();
  });

  describe('getCacheMonitoringSnapshot', () => {
    it('should return snapshot with all cache stats', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('caches');
      expect(snapshot).toHaveProperty('totals');
      expect(snapshot).toHaveProperty('health');
    });

    it('should include persona behavior and content caches', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.caches.personaBehaviors.size).toBe(10);
      expect(snapshot.caches.personaContent.size).toBe(50);
    });

    it('should include context output cache', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.caches.contextOutput.size).toBe(25);
      expect(snapshot.caches.contextOutput.hitRate).toBe(0.8);
    });

    it('should include context registry stats', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.caches.contextRegistry.totalBuilders).toBe(15);
      expect(snapshot.caches.contextRegistry.byCategory).toHaveProperty('emotional');
    });

    it('should include cognitive style cache', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.caches.cognitiveStyle.size).toBe(30);
    });

    it('should include embedding cache', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.caches.embeddings.size).toBe(100);
      expect(snapshot.caches.embeddings.hits).toBe(1000);
    });

    it('should include redis connection status', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.caches.redis.connected).toBe(true);
    });

    it('should calculate totals correctly', () => {
      const snapshot = getCacheMonitoringSnapshot();

      // Total entries: 10 + 50 + 25 + 30 + 100 = 215
      expect(snapshot.totals.totalCacheEntries).toBe(215);
      expect(snapshot.totals.overallHitRate).toBeGreaterThan(0);
      expect(snapshot.totals.totalEvictions).toBeGreaterThan(0);
    });

    it('should include health status for all caches', () => {
      const snapshot = getCacheMonitoringSnapshot();

      expect(snapshot.health.length).toBe(5);
      expect(snapshot.health.map((h) => h.name)).toContain('Persona Behaviors');
      expect(snapshot.health.map((h) => h.name)).toContain('Embeddings');
    });
  });

  describe('getCacheSummaryReport', () => {
    it('should return formatted report string', () => {
      const report = getCacheSummaryReport();

      expect(report).toContain('Cache Monitoring Report');
      expect(report).toContain('Total Entries:');
      expect(report).toContain('Overall Hit Rate:');
      expect(report).toContain('Context Builders:');
      expect(report).toContain('Redis:');
    });

    it('should include per-cache breakdown', () => {
      const report = getCacheSummaryReport();

      expect(report).toContain('Persona Behaviors');
      expect(report).toContain('Embeddings');
      expect(report).toContain('entries');
      expect(report).toContain('hit rate');
    });
  });

  describe('runCacheMaintenance', () => {
    it('should prune expired content', () => {
      const result = runCacheMaintenance();

      expect(result.pruned.behaviors).toBe(2);
      expect(result.pruned.content).toBe(5);
      expect(result.embeddings).toBe(10);
    });
  });

  describe('checkCacheHealth', () => {
    it('should return healthy status when all caches are ok', () => {
      const health = checkCacheHealth();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('issues');
      expect(Array.isArray(health.issues)).toBe(true);
    });
  });

  describe('startCacheMaintenance / stopCacheMaintenance', () => {
    it('should start periodic maintenance', async () => {
      const { pruneExpiredContent } = await import('../persona-content-loader.js');
      vi.mocked(pruneExpiredContent).mockClear();

      startCacheMaintenance(1000); // 1 second interval

      // Advance time
      vi.advanceTimersByTime(1000);

      // Should have run maintenance
      expect(pruneExpiredContent).toHaveBeenCalled();
    });

    it('should stop periodic maintenance', async () => {
      const { pruneExpiredContent } = await import('../persona-content-loader.js');

      startCacheMaintenance(1000);
      stopCacheMaintenance();

      vi.mocked(pruneExpiredContent).mockClear();
      vi.advanceTimersByTime(2000);

      // Should not have run again after stop
      expect(pruneExpiredContent).not.toHaveBeenCalled();
    });

    it('should not start multiple intervals', async () => {
      const { pruneExpiredContent } = await import('../persona-content-loader.js');
      vi.mocked(pruneExpiredContent).mockClear();

      startCacheMaintenance(1000);
      startCacheMaintenance(1000); // Second call should be ignored

      vi.advanceTimersByTime(1000);

      // Should only have been called once
      expect(pruneExpiredContent).toHaveBeenCalledTimes(1);
    });
  });
});
