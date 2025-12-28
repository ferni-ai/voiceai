/**
 * Trigger Embedding Cache Tests
 *
 * Tests for the Firestore-backed embedding cache.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TriggerEmbeddingCache,
  getTriggerEmbeddingCache,
  resetTriggerEmbeddingCache,
} from '../trigger-embedding-cache.js';

// Mock Firebase Admin Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue(null), // Return null to disable Firestore in tests
}));

describe('TriggerEmbeddingCache', () => {
  let cache: TriggerEmbeddingCache;

  beforeEach(() => {
    resetTriggerEmbeddingCache();
    cache = new TriggerEmbeddingCache({
      persistToFirestore: false, // Disable Firestore for unit tests
      maxSize: 100,
      ttlMs: 1000 * 60 * 60, // 1 hour
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('get/set', () => {
    it('should cache and retrieve embeddings', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set(
        'ferni',
        'test_trigger',
        'Test trigger text',
        embedding,
        'text-embedding-004'
      );

      const cached = await cache.get('ferni', 'test_trigger', 'Test trigger text');

      expect(cached).not.toBeNull();
      expect(cached?.embedding).toEqual(embedding);
      expect(cached?.personaId).toBe('ferni');
      expect(cached?.model).toBe('text-embedding-004');
    });

    it('should return null for non-existent entries', async () => {
      const cached = await cache.get('ferni', 'nonexistent', 'Some text');

      expect(cached).toBeNull();
    });

    it('should invalidate when trigger text changes', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set('ferni', 'test_trigger', 'Original text', embedding, 'text-embedding-004');

      // Try to get with different text - should miss
      const cached = await cache.get('ferni', 'test_trigger', 'Different text');

      expect(cached).toBeNull();
    });

    it('should track access count', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set('ferni', 'test_trigger', 'Test text', embedding, 'text-embedding-004');

      // Access multiple times
      await cache.get('ferni', 'test_trigger', 'Test text');
      await cache.get('ferni', 'test_trigger', 'Test text');
      const cached = await cache.get('ferni', 'test_trigger', 'Test text');

      expect(cached?.accessCount).toBe(4); // 1 initial + 3 accesses
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when at capacity', async () => {
      const smallCache = new TriggerEmbeddingCache({
        persistToFirestore: false,
        maxSize: 3,
        ttlMs: 1000 * 60 * 60,
      });

      const embedding = new Array(768).fill(0.1);

      // Fill cache to capacity
      await smallCache.set('ferni', 't1', 'text1', embedding, 'model');
      await smallCache.set('ferni', 't2', 'text2', embedding, 'model');
      await smallCache.set('ferni', 't3', 'text3', embedding, 'model');

      // Add a 4th entry - should trigger eviction
      await smallCache.set('ferni', 't4', 'text4', embedding, 'model');

      const stats = smallCache.getStats();

      // Cache should still be at max capacity
      expect(stats.memorySize).toBe(3);

      // One eviction should have occurred
      expect(stats.evictions).toBe(1);

      // The newest entry should be present
      const t4 = await smallCache.get('ferni', 't4', 'text4');
      expect(t4).not.toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific trigger', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set('ferni', 'test_trigger', 'Test text', embedding, 'model');
      await cache.invalidate('ferni', 'test_trigger');

      const cached = await cache.get('ferni', 'test_trigger', 'Test text');
      expect(cached).toBeNull();
    });

    it('should invalidate all triggers for a persona', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set('ferni', 't1', 'text1', embedding, 'model');
      await cache.set('ferni', 't2', 'text2', embedding, 'model');
      await cache.set('maya', 't1', 'text1', embedding, 'model');

      const count = await cache.invalidatePersona('ferni');

      expect(count).toBe(2);

      // Ferni triggers should be gone
      expect(await cache.get('ferni', 't1', 'text1')).toBeNull();
      expect(await cache.get('ferni', 't2', 'text2')).toBeNull();

      // Maya trigger should remain
      expect(await cache.get('maya', 't1', 'text1')).not.toBeNull();
    });
  });

  describe('pruneExpired', () => {
    it('should prune expired entries', async () => {
      const shortTtlCache = new TriggerEmbeddingCache({
        persistToFirestore: false,
        maxSize: 100,
        ttlMs: 10, // 10ms TTL
      });

      const embedding = new Array(768).fill(0.1);

      await shortTtlCache.set('ferni', 'test', 'text', embedding, 'model');

      // Wait for expiration
      await new Promise<void>((resolve) => { setTimeout(resolve, 20); });

      const pruned = shortTtlCache.pruneExpired();

      expect(pruned).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set('ferni', 't1', 'text1', embedding, 'model');
      await cache.set('ferni', 't2', 'text2', embedding, 'model');

      // Hit
      await cache.get('ferni', 't1', 'text1');
      // Miss
      await cache.get('ferni', 'nonexistent', 'text');

      const stats = cache.getStats();

      expect(stats.memorySize).toBe(2);
      expect(stats.memoryHits).toBe(1);
      expect(stats.memoryMisses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.firestoreEnabled).toBe(false);
    });
  });

  describe('bulkSave', () => {
    it('should save multiple embeddings at once', async () => {
      const embeddings = [
        {
          name: 't1',
          trigger: 'Trigger 1',
          behavior: 'Behavior 1',
          embedding: new Array(768).fill(0.1),
          personaId: 'ferni',
          category: 'emotional' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 't2',
          trigger: 'Trigger 2',
          behavior: 'Behavior 2',
          embedding: new Array(768).fill(0.2),
          personaId: 'ferni',
          category: 'behavioral' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const count = await cache.bulkSave(embeddings, 'text-embedding-004');

      expect(count).toBe(2);

      const stats = cache.getStats();
      expect(stats.memorySize).toBe(2);
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getTriggerEmbeddingCache();
      const instance2 = getTriggerEmbeddingCache();

      expect(instance1).toBe(instance2);
    });

    it('should reset correctly', () => {
      const instance1 = getTriggerEmbeddingCache();
      resetTriggerEmbeddingCache();
      const instance2 = getTriggerEmbeddingCache();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('clear', () => {
    it('should clear all memory cache', async () => {
      const embedding = new Array(768).fill(0.1);

      await cache.set('ferni', 't1', 'text1', embedding, 'model');
      await cache.set('ferni', 't2', 'text2', embedding, 'model');

      await cache.clear();

      const stats = cache.getStats();
      expect(stats.memorySize).toBe(0);
    });
  });
});
