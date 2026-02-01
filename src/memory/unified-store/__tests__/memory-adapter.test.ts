/**
 * In-Memory Adapter Tests
 *
 * Tests the in-memory storage adapter (no external dependencies).
 *
 * @module memory/unified-store/__tests__/memory-adapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter, resetMemoryAdapter } from '../adapters/memory-adapter.js';
import type { StoredMemory } from '../types.js';

function createTestMemory(overrides?: Partial<StoredMemory>): StoredMemory {
  return {
    id: overrides?.id || `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: overrides?.userId || 'test-user-123',
    type: overrides?.type || 'entity',
    subtype: overrides?.subtype,
    content: overrides?.content || 'Test memory content',
    embedding: overrides?.embedding || [],
    createdAt: overrides?.createdAt || new Date(),
    updatedAt: overrides?.updatedAt || new Date(),
    lastAccessedAt: overrides?.lastAccessedAt || new Date(),
    accessCount: overrides?.accessCount || 0,
    emotionalWeight: overrides?.emotionalWeight || 0,
    strength: overrides?.strength || 1,
    importance: overrides?.importance || 0.5,
    isProtected: overrides?.isProtected || false,
    isActiveCommitment: overrides?.isActiveCommitment || false,
    topics: overrides?.topics || [],
    personaIds: overrides?.personaIds || [],
    peopleMentioned: overrides?.peopleMentioned || [],
    metadata: overrides?.metadata || {},
    storageLayer: 'memory',
  };
}

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    resetMemoryAdapter();
    adapter = new MemoryAdapter({ maxSize: 100, enableLruEviction: true });
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.shutdown();
  });

  describe('initialize()', () => {
    it('should initialize successfully', async () => {
      expect(adapter.isInitialized()).toBe(true);
    });

    it('should be idempotent', async () => {
      await adapter.initialize();
      await adapter.initialize();
      expect(adapter.isInitialized()).toBe(true);
    });
  });

  describe('store()', () => {
    it('should store a memory', async () => {
      const memory = createTestMemory({ id: 'mem-1' });
      await adapter.store(memory);

      const retrieved = await adapter.get('test-user-123', 'mem-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('mem-1');
      expect(retrieved!.content).toBe('Test memory content');
    });

    it('should set storage layer to memory', async () => {
      const memory = createTestMemory({ id: 'mem-2' });
      await adapter.store(memory);

      const retrieved = await adapter.get('test-user-123', 'mem-2');
      expect(retrieved!.storageLayer).toBe('memory');
    });

    it('should update existing memory', async () => {
      const memory1 = createTestMemory({ id: 'mem-3', content: 'Original' });
      await adapter.store(memory1);

      const memory2 = createTestMemory({ id: 'mem-3', content: 'Updated' });
      await adapter.store(memory2);

      const retrieved = await adapter.get('test-user-123', 'mem-3');
      expect(retrieved!.content).toBe('Updated');
    });
  });

  describe('get()', () => {
    it('should retrieve a stored memory', async () => {
      const memory = createTestMemory({ id: 'get-test' });
      await adapter.store(memory);

      const retrieved = await adapter.get('test-user-123', 'get-test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('get-test');
    });

    it('should return null for non-existent memory', async () => {
      const retrieved = await adapter.get('test-user-123', 'non-existent');
      expect(retrieved).toBeNull();
    });

    it('should return null for wrong user', async () => {
      const memory = createTestMemory({ id: 'user-test', userId: 'user-a' });
      await adapter.store(memory);

      const retrieved = await adapter.get('user-b', 'user-test');
      expect(retrieved).toBeNull();
    });
  });

  describe('update()', () => {
    it('should update memory fields', async () => {
      const memory = createTestMemory({ id: 'update-test', importance: 0.5 });
      await adapter.store(memory);

      await adapter.update('test-user-123', 'update-test', { importance: 0.9 });

      const retrieved = await adapter.get('test-user-123', 'update-test');
      expect(retrieved!.importance).toBe(0.9);
    });

    it('should update updatedAt timestamp', async () => {
      const memory = createTestMemory({ id: 'timestamp-test' });
      const originalUpdatedAt = memory.updatedAt;
      await adapter.store(memory);

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await adapter.update('test-user-123', 'timestamp-test', { importance: 0.8 });

      const retrieved = await adapter.get('test-user-123', 'timestamp-test');
      expect(retrieved!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should do nothing for non-existent memory', async () => {
      await adapter.update('test-user-123', 'non-existent', { importance: 0.9 });
      // Should not throw
    });
  });

  describe('delete()', () => {
    it('should delete a memory', async () => {
      const memory = createTestMemory({ id: 'delete-test' });
      await adapter.store(memory);

      await adapter.delete('test-user-123', 'delete-test');

      const retrieved = await adapter.get('test-user-123', 'delete-test');
      expect(retrieved).toBeNull();
    });

    it('should do nothing for non-existent memory', async () => {
      await adapter.delete('test-user-123', 'non-existent');
      // Should not throw
    });
  });

  describe('search()', () => {
    beforeEach(async () => {
      // Store some test memories
      await adapter.store(createTestMemory({
        id: 'search-1',
        type: 'entity',
        importance: 0.9,
      }));
      await adapter.store(createTestMemory({
        id: 'search-2',
        type: 'preference',
        importance: 0.7,
      }));
      await adapter.store(createTestMemory({
        id: 'search-3',
        type: 'entity',
        importance: 0.5,
      }));
    });

    it('should return memories for user', async () => {
      const results = await adapter.search({
        userId: 'test-user-123',
        topK: 10,
      });

      expect(results.length).toBe(3);
    });

    it('should filter by type', async () => {
      const results = await adapter.search({
        userId: 'test-user-123',
        types: ['entity'],
      });

      expect(results.length).toBe(2);
      for (const result of results) {
        expect(result.memory.type).toBe('entity');
      }
    });

    it('should respect topK limit', async () => {
      const results = await adapter.search({
        userId: 'test-user-123',
        topK: 2,
      });

      expect(results.length).toBe(2);
    });

    it('should sort by score (importance)', async () => {
      const results = await adapter.search({
        userId: 'test-user-123',
        topK: 10,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should return empty for unknown user', async () => {
      const results = await adapter.search({
        userId: 'unknown-user',
      });

      expect(results.length).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when full', async () => {
      const smallAdapter = new MemoryAdapter({ maxSize: 3, enableLruEviction: true });
      await smallAdapter.initialize();

      // Store 3 memories
      await smallAdapter.store(createTestMemory({ id: 'lru-1' }));
      await smallAdapter.store(createTestMemory({ id: 'lru-2' }));
      await smallAdapter.store(createTestMemory({ id: 'lru-3' }));

      // Access lru-1 to make it recently used
      await smallAdapter.get('test-user-123', 'lru-1');

      // Store a 4th memory - should evict lru-2 (least recently used)
      await smallAdapter.store(createTestMemory({ id: 'lru-4' }));

      // lru-2 should be evicted
      const retrieved2 = await smallAdapter.get('test-user-123', 'lru-2');
      expect(retrieved2).toBeNull();

      // lru-1, lru-3, lru-4 should still exist
      expect(await smallAdapter.get('test-user-123', 'lru-1')).not.toBeNull();
      expect(await smallAdapter.get('test-user-123', 'lru-3')).not.toBeNull();
      expect(await smallAdapter.get('test-user-123', 'lru-4')).not.toBeNull();

      await smallAdapter.shutdown();
    });

    it('should throw when full and eviction disabled', async () => {
      const noEvictAdapter = new MemoryAdapter({ maxSize: 2, enableLruEviction: false });
      await noEvictAdapter.initialize();

      await noEvictAdapter.store(createTestMemory({ id: 'no-evict-1' }));
      await noEvictAdapter.store(createTestMemory({ id: 'no-evict-2' }));

      await expect(
        noEvictAdapter.store(createTestMemory({ id: 'no-evict-3' }))
      ).rejects.toThrow('Memory store full');

      await noEvictAdapter.shutdown();
    });
  });

  describe('bulk operations', () => {
    it('should get all memories for user', async () => {
      await adapter.store(createTestMemory({ id: 'bulk-1', userId: 'user-a' }));
      await adapter.store(createTestMemory({ id: 'bulk-2', userId: 'user-a' }));
      await adapter.store(createTestMemory({ id: 'bulk-3', userId: 'user-b' }));

      const userAMemories = await adapter.getByUser('user-a');
      expect(userAMemories.length).toBe(2);
    });

    it('should clear all memories for user', async () => {
      await adapter.store(createTestMemory({ id: 'clear-1', userId: 'user-a' }));
      await adapter.store(createTestMemory({ id: 'clear-2', userId: 'user-a' }));
      await adapter.store(createTestMemory({ id: 'clear-3', userId: 'user-b' }));

      const count = await adapter.clearUser('user-a');
      expect(count).toBe(2);

      const userAMemories = await adapter.getByUser('user-a');
      expect(userAMemories.length).toBe(0);

      // User B's memories should still exist
      const userBMemories = await adapter.getByUser('user-b');
      expect(userBMemories.length).toBe(1);
    });

    it('should clear all memories', async () => {
      await adapter.store(createTestMemory({ id: 'all-1' }));
      await adapter.store(createTestMemory({ id: 'all-2' }));

      await adapter.clear();

      expect(adapter.getSize()).toBe(0);
    });
  });

  describe('health()', () => {
    it('should return healthy status', async () => {
      const health = await adapter.health();

      expect(health.healthy).toBe(true);
      expect(health.name).toBe('memory');
      expect(health.initialized).toBe(true);
      expect(health.errorRate).toBe(0);
    });
  });

  describe('size management', () => {
    it('should track size correctly', async () => {
      expect(adapter.getSize()).toBe(0);

      await adapter.store(createTestMemory({ id: 'size-1' }));
      expect(adapter.getSize()).toBe(1);

      await adapter.store(createTestMemory({ id: 'size-2' }));
      expect(adapter.getSize()).toBe(2);

      await adapter.delete('test-user-123', 'size-1');
      expect(adapter.getSize()).toBe(1);
    });

    it('should report max size', () => {
      expect(adapter.getMaxSize()).toBe(100);
    });
  });
});
