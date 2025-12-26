/**
 * Memory System Health Check Tests
 *
 * Tests for getMemorySystemHealth() function.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock embeddings
vi.mock('../embeddings.js', () => ({
  getEmbeddingProvider: vi.fn(() => ({
    dimensions: 768,
    model: 'google/text-embedding-004',
    embed: vi.fn(),
    embedBatch: vi.fn(),
  })),
  embed: vi.fn(async () => Array.from({ length: 768 }, () => Math.random())),
  embedBatch: vi.fn(async (texts: string[]) =>
    texts.map(() => Array.from({ length: 768 }, () => Math.random()))
  ),
  cosineSimilarity: vi.fn(() => 0.8),
}));

describe('Memory System Health', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('getMemorySystemHealth', () => {
    it('should return unhealthy when not initialized', async () => {
      const { getMemorySystemHealth } = await import('../index.js');

      const health = await getMemorySystemHealth();

      expect(health.overall).toBe('unhealthy');
      expect(health.initialized).toBe(false);
      expect(health.stores.primary.healthy).toBe(false);
      expect(health.stores.vector.healthy).toBe(false);
    });

    it('should have correct structure', async () => {
      const { getMemorySystemHealth } = await import('../index.js');

      const health = await getMemorySystemHealth();

      // Check structure
      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('initialized');
      expect(health).toHaveProperty('stores');
      expect(health).toHaveProperty('embedding');

      expect(health.stores).toHaveProperty('primary');
      expect(health.stores).toHaveProperty('vector');
      expect(health.stores).toHaveProperty('redis');

      expect(health.embedding).toHaveProperty('provider');
      expect(health.embedding).toHaveProperty('dimensions');
      expect(health.embedding).toHaveProperty('dimensionMatch');
    });

    it('should return valid overall health status', async () => {
      const { getMemorySystemHealth } = await import('../index.js');

      const health = await getMemorySystemHealth();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.overall);
    });

    it('should report vector store fallback status', async () => {
      const { getMemorySystemHealth } = await import('../index.js');

      const health = await getMemorySystemHealth();

      expect(typeof health.stores.vector.usingFallback).toBe('boolean');
      expect(typeof health.stores.vector.cacheSize).toBe('number');
    });

    it('should report embedding dimension match', async () => {
      const { getMemorySystemHealth } = await import('../index.js');

      const health = await getMemorySystemHealth();

      expect(typeof health.embedding.dimensionMatch).toBe('boolean');
      expect(typeof health.embedding.dimensions).toBe('number');
    });
  });

  describe('MemorySystemHealth type', () => {
    it('should export MemorySystemHealth type', async () => {
      // Type exports don't exist at runtime, but the module should compile
      // This test just verifies the import doesn't throw
      await import('../index.js');
      expect(true).toBe(true);
    });
  });
});

