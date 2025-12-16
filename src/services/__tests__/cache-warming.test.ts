/**
 * Cache Warming Service Tests
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

vi.mock('../../personas/bundles/index.js', () => ({
  loadBundleById: vi.fn().mockResolvedValue({
    manifest: { id: 'ferni' },
    getAllStories: vi.fn().mockResolvedValue([{ id: 'story1' }, { id: 'story2' }]),
    getKnowledge: vi.fn().mockResolvedValue({ topic: 'test' }),
  }),
  discoverBundles: vi.fn().mockResolvedValue(['ferni', 'maya-santos', 'alex-chen']),
}));

vi.mock('../persona-content-loader.js', () => ({
  loadPersonaBehaviors: vi.fn().mockResolvedValue({
    greetings: ['hello'],
    farewells: ['goodbye'],
    encouragements: ['great job'],
  }),
}));

const mockEmbeddingCache = {
  has: vi.fn().mockReturnValue(false),
  get: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
};

vi.mock('../../memory/embedding-cache.js', () => ({
  getEmbeddingCache: vi.fn(() => mockEmbeddingCache),
}));

// Import after mocks
import {
  warmCachesOnStartup,
  prefetchForSession,
  prefetchPersonaEmbeddings,
  isWarmingInProgress,
  getWarmablePersonas,
} from '../cache-warming.js';
import { loadBundleById } from '../../personas/bundles/index.js';

describe('Cache Warming Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('warmCachesOnStartup', () => {
    it('should warm priority personas', async () => {
      const result = await warmCachesOnStartup({
        priorityPersonas: ['ferni', 'maya-santos'],
        warmEmbeddings: false,
      });

      expect(result.personasWarmed).toBe(2);
      expect(result.behaviorsWarmed).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.errors.length).toBe(0);
    });

    it('should return existing result if warming in progress', async () => {
      // Start two warmings simultaneously
      const promise1 = warmCachesOnStartup({ priorityPersonas: ['ferni'] });
      const promise2 = warmCachesOnStartup({ priorityPersonas: ['maya-santos'] });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result (first one wins)
      expect(result1).toEqual(result2);
    });

    it('should warm embeddings when enabled', async () => {
      const result = await warmCachesOnStartup({
        priorityPersonas: [],
        warmEmbeddings: true,
        commonEmbeddingTexts: ['hello', 'how are you'],
      });

      expect(result.embeddingsWarmed).toBeGreaterThan(0);
    });

    it('should handle bundle not found gracefully', async () => {
      vi.mocked(loadBundleById).mockResolvedValueOnce(null);

      const result = await warmCachesOnStartup({
        priorityPersonas: ['nonexistent'],
        warmEmbeddings: false,
      });

      // Should not throw, but persona not warmed
      expect(result.personasWarmed).toBe(0);
    });

    it('should respect max concurrency', async () => {
      const result = await warmCachesOnStartup({
        priorityPersonas: ['ferni', 'maya-santos', 'alex-chen', 'peter-john'],
        maxConcurrency: 2,
        warmEmbeddings: false,
      });

      // All should be warmed, just in batches
      expect(result.personasWarmed).toBe(4);
    });
  });

  describe('prefetchForSession', () => {
    it('should prefetch behaviors and stories', async () => {
      const result = await prefetchForSession('ferni', 'user-123');

      expect(result.behaviors).toBe(3); // greetings, farewells, encouragements
      expect(result.stories).toBe(2); // story1, story2
      expect(result.knowledge).toBe(0); // Knowledge not bulk-prefetchable
    });

    it('should return zeros when bundle not found', async () => {
      vi.mocked(loadBundleById).mockResolvedValueOnce(null);

      const result = await prefetchForSession('nonexistent');

      expect(result.behaviors).toBe(0);
      expect(result.stories).toBe(0);
      expect(result.knowledge).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadBundleById).mockRejectedValueOnce(new Error('Load failed'));

      const result = await prefetchForSession('error-persona');

      // Should not throw, return zeros
      expect(result.behaviors).toBe(0);
      expect(result.stories).toBe(0);
    });
  });

  describe('prefetchPersonaEmbeddings', () => {
    it('should prefetch embeddings for known personas', async () => {
      mockEmbeddingCache.has.mockReturnValue(false);

      const result = await prefetchPersonaEmbeddings('ferni');

      // Ferni has 4 queries defined
      expect(result).toBe(4);
      expect(mockEmbeddingCache.get).toHaveBeenCalled();
    });

    it('should skip already cached embeddings', async () => {
      mockEmbeddingCache.has.mockReturnValue(true);

      const result = await prefetchPersonaEmbeddings('ferni');

      expect(result).toBe(0);
      expect(mockEmbeddingCache.get).not.toHaveBeenCalled();
    });

    it('should return 0 for unknown personas', async () => {
      const result = await prefetchPersonaEmbeddings('unknown-persona');

      expect(result).toBe(0);
    });

    it('should handle embedding fetch errors silently', async () => {
      mockEmbeddingCache.has.mockReturnValue(false);
      mockEmbeddingCache.get.mockRejectedValue(new Error('Embedding error'));

      const result = await prefetchPersonaEmbeddings('ferni');

      // Should not throw, just return 0
      expect(result).toBe(0);
    });
  });

  describe('isWarmingInProgress', () => {
    it('should return false when not warming', () => {
      expect(isWarmingInProgress()).toBe(false);
    });
  });

  describe('getWarmablePersonas', () => {
    it('should return discovered bundle IDs', async () => {
      const personas = await getWarmablePersonas();

      expect(personas).toEqual(['ferni', 'maya-santos', 'alex-chen']);
    });

    it('should return default personas on error', async () => {
      const { discoverBundles } = vi.mocked(await import('../../personas/bundles/index.js'));
      discoverBundles.mockRejectedValueOnce(new Error('Discovery failed'));

      const personas = await getWarmablePersonas();

      // Should return default priority personas
      expect(personas).toContain('ferni');
    });
  });
});
