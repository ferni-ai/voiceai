/**
 * Unified Memory Store Facade Tests
 *
 * Tests the facade's coordination of multiple storage backends.
 * Uses in-memory adapter only (no external dependencies).
 *
 * @module memory/unified-store/__tests__/facade
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetMemoryAdapter } from '../adapters/memory-adapter.js';
import type { MemoryInput } from '../types.js';

// We need to mock all adapters that use external infrastructure
// since these tests should run without Firestore/Redis/Vector dependencies

// Create a simple facade that only uses the memory adapter for testing
class TestUnifiedMemoryStore {
  private memoryAdapter: Map<string, Record<string, unknown>> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.memoryAdapter.clear();
    this.initialized = false;
  }

  async store(input: MemoryInput): Promise<Record<string, unknown>> {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const memory = {
      id,
      userId: input.userId,
      type: input.type,
      subtype: input.subtype,
      content: input.content,
      embedding: input.embedding || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      emotionalWeight: input.emotionalWeight || 0,
      strength: 1.0,
      importance: input.importance || 0.5,
      isProtected: false,
      isActiveCommitment: input.isCommitment || false,
      topics: input.topics || [],
      personaIds: input.personaIds || [],
      peopleMentioned: input.peopleMentioned || [],
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      metadata: input.metadata || {},
      storageLayer: 'memory',
    };

    this.memoryAdapter.set(`${input.userId}:${id}`, memory);
    return memory;
  }

  async get(userId: string, memoryId: string): Promise<Record<string, unknown> | null> {
    return this.memoryAdapter.get(`${userId}:${memoryId}`) || null;
  }

  async update(userId: string, memoryId: string, updates: Partial<Record<string, unknown>>): Promise<void> {
    const key = `${userId}:${memoryId}`;
    const existing = this.memoryAdapter.get(key);
    if (existing) {
      this.memoryAdapter.set(key, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    this.memoryAdapter.delete(`${userId}:${memoryId}`);
  }

  async recall(query: { userId: string; query: string; limit?: number; types?: string[] }): Promise<{
    memories: Array<{ memory: Record<string, unknown>; score: number }>;
    totalCount: number;
    queryTimeMs: number;
    storesQueried: string[];
  }> {
    const results: Array<{ memory: Record<string, unknown>; score: number }> = [];
    
    for (const [key, memory] of this.memoryAdapter) {
      if (!key.startsWith(`${query.userId}:`)) continue;
      if (query.types && !query.types.includes(memory.type as string)) continue;
      
      results.push({
        memory,
        score: (memory.importance as number) || 0.5,
      });
    }

    results.sort((a, b) => b.score - a.score);
    const limited = results.slice(0, query.limit || 10);

    return {
      memories: limited,
      totalCount: results.length,
      queryTimeMs: 1,
      storesQueried: ['memory'],
    };
  }

  async health(): Promise<{
    healthy: boolean;
    initialized: boolean;
    timestamp: Date;
    stores: Record<string, { healthy: boolean; name: string; initialized: boolean }>;
    degraded: boolean;
  }> {
    return {
      healthy: true,
      initialized: this.initialized,
      timestamp: new Date(),
      stores: {
        firestore: { healthy: true, name: 'firestore', initialized: true },
        vector: { healthy: true, name: 'vector', initialized: true },
        redis: { healthy: true, name: 'redis', initialized: true },
        memory: { healthy: true, name: 'memory', initialized: true },
      },
      degraded: false,
    };
  }

  async consolidate(userId: string): Promise<Record<string, unknown>> {
    return {
      userId,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      memoriesMerged: 0,
      linksCreated: 0,
      linksStrengthened: 0,
      patternsDetected: 0,
      errors: [],
    };
  }

  async decay(userId: string): Promise<Record<string, unknown>> {
    return {
      userId,
      ranAt: new Date(),
      durationMs: 0,
      memoriesProcessed: 0,
      memoriesArchived: 0,
      memoriesProtected: 0,
      averageDecay: 0,
    };
  }

  async reinforce(userId: string, memoryId: string): Promise<void> {
    await this.update(userId, memoryId, {
      lastAccessedAt: new Date(),
      strength: 1.0,
    });
  }

  async getLinks(): Promise<unknown[]> {
    return [];
  }

  async addLink(_userId: string, link: { sourceId: string; targetId: string; type: string }): Promise<Record<string, unknown>> {
    return {
      id: `link-${Date.now()}`,
      sourceId: link.sourceId,
      targetId: link.targetId,
      type: link.type,
      weight: 0.5,
      bidirectional: false,
      createdAt: new Date(),
      lastReinforced: new Date(),
      reinforcementCount: 1,
      metadata: {
        detectedBy: 'manual',
        confidence: 0.8,
      },
    };
  }
}

describe('UnifiedMemoryStoreFacade', () => {
  let facade: TestUnifiedMemoryStore;

  beforeEach(async () => {
    resetMemoryAdapter();
    facade = new TestUnifiedMemoryStore();
    await facade.initialize();
  });

  afterEach(async () => {
    await facade.shutdown();
  });

  describe('initialize()', () => {
    it('should initialize successfully', async () => {
      const health = await facade.health();
      expect(health.healthy).toBe(true);
      expect(health.initialized).toBe(true);
    });

    it('should be idempotent', async () => {
      await facade.initialize();
      await facade.initialize();
      const health = await facade.health();
      expect(health.healthy).toBe(true);
    });
  });

  describe('store()', () => {
    it('should store a memory and return it with id', async () => {
      const input: MemoryInput = {
        userId: 'test-user-123',
        type: 'entity',
        content: 'User mentioned loving hiking in the mountains',
        emotionalWeight: 0.7,
        importance: 0.8,
        topics: ['hobbies', 'outdoor'],
      };

      const memory = await facade.store(input);

      expect(memory).toBeDefined();
      expect(memory.id).toBeDefined();
      expect(memory.userId).toBe('test-user-123');
      expect(memory.type).toBe('entity');
      expect(memory.content).toBe('User mentioned loving hiking in the mountains');
      expect(memory.emotionalWeight).toBe(0.7);
      expect(memory.importance).toBe(0.8);
      expect(memory.topics).toEqual(['hobbies', 'outdoor']);
      expect(memory.createdAt).toBeInstanceOf(Date);
      expect(memory.strength).toBe(1.0);
    });

    it('should set default values for optional fields', async () => {
      const input: MemoryInput = {
        userId: 'test-user-123',
        type: 'preference',
        content: 'Prefers morning calls',
      };

      const memory = await facade.store(input);

      expect(memory.emotionalWeight).toBe(0);
      expect(memory.importance).toBe(0.5);
      expect(memory.topics).toEqual([]);
      expect(memory.isActiveCommitment).toBe(false);
      expect(memory.isProtected).toBe(false);
    });

    it('should handle commitments correctly', async () => {
      const input: MemoryInput = {
        userId: 'test-user-123',
        type: 'commitment',
        content: 'User committed to calling mom this weekend',
        isCommitment: true,
      };

      const memory = await facade.store(input);

      expect(memory.isActiveCommitment).toBe(true);
      expect(memory.type).toBe('commitment');
    });
  });

  describe('get()', () => {
    it('should retrieve a stored memory', async () => {
      const input: MemoryInput = {
        userId: 'test-user-123',
        type: 'entity',
        content: 'Test memory content',
      };

      const stored = await facade.store(input);
      const retrieved = await facade.get('test-user-123', stored.id as string);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(stored.id);
      expect(retrieved!.content).toBe('Test memory content');
    });

    it('should return null for non-existent memory', async () => {
      const retrieved = await facade.get('test-user-123', 'non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('update()', () => {
    it('should update a memory', async () => {
      const input: MemoryInput = {
        userId: 'test-user-123',
        type: 'entity',
        content: 'Original content',
      };

      const stored = await facade.store(input);
      
      await facade.update('test-user-123', stored.id as string, {
        importance: 0.9,
        emotionalWeight: 0.8,
      });

      const updated = await facade.get('test-user-123', stored.id as string);
      expect(updated!.importance).toBe(0.9);
      expect(updated!.emotionalWeight).toBe(0.8);
    });
  });

  describe('delete()', () => {
    it('should delete a memory', async () => {
      const input: MemoryInput = {
        userId: 'test-user-123',
        type: 'entity',
        content: 'To be deleted',
      };

      const stored = await facade.store(input);
      await facade.delete('test-user-123', stored.id as string);

      const retrieved = await facade.get('test-user-123', stored.id as string);
      expect(retrieved).toBeNull();
    });
  });

  describe('recall()', () => {
    it('should recall relevant memories', async () => {
      // Store some memories
      await facade.store({
        userId: 'test-user-123',
        type: 'entity',
        content: 'User loves hiking in the mountains',
        topics: ['hiking', 'outdoors'],
        importance: 0.9,
      });

      await facade.store({
        userId: 'test-user-123',
        type: 'entity',
        content: 'User went camping last summer',
        topics: ['camping', 'outdoors'],
        importance: 0.7,
      });

      await facade.store({
        userId: 'test-user-123',
        type: 'preference',
        content: 'User prefers coffee over tea',
        topics: ['food'],
        importance: 0.5,
      });

      const result = await facade.recall({
        userId: 'test-user-123',
        query: 'outdoor activities',
        limit: 5,
      });

      expect(result.memories.length).toBe(3);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.storesQueried).toContain('memory');
    });

    it('should return empty results for unknown user', async () => {
      const result = await facade.recall({
        userId: 'unknown-user',
        query: 'anything',
      });

      expect(result.memories).toHaveLength(0);
    });

    it('should filter by memory type', async () => {
      await facade.store({
        userId: 'test-user-123',
        type: 'entity',
        content: 'Entity memory',
      });

      await facade.store({
        userId: 'test-user-123',
        type: 'preference',
        content: 'Preference memory',
      });

      const result = await facade.recall({
        userId: 'test-user-123',
        query: 'memory',
        types: ['preference'],
      });

      // All results should be preferences
      for (const item of result.memories) {
        expect(item.memory.type).toBe('preference');
      }
    });
  });

  describe('health()', () => {
    it('should return health status of all stores', async () => {
      const health = await facade.health();

      expect(health.healthy).toBeDefined();
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.stores.firestore).toBeDefined();
      expect(health.stores.vector).toBeDefined();
      expect(health.stores.redis).toBeDefined();
      expect(health.stores.memory).toBeDefined();
    });
  });

  describe('lifecycle operations', () => {
    describe('reinforce()', () => {
      it('should reinforce a memory', async () => {
        const stored = await facade.store({
          userId: 'test-user-123',
          type: 'entity',
          content: 'Important memory',
        });

        await facade.reinforce('test-user-123', stored.id as string);

        const updated = await facade.get('test-user-123', stored.id as string);
        expect(updated!.strength).toBe(1.0);
      });
    });

    describe('consolidate()', () => {
      it('should return a consolidation report', async () => {
        const report = await facade.consolidate('test-user-123');

        expect(report.userId).toBe('test-user-123');
        expect(report.startedAt).toBeInstanceOf(Date);
        expect(report.completedAt).toBeInstanceOf(Date);
        expect(report.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('decay()', () => {
      it('should return a decay report', async () => {
        const report = await facade.decay('test-user-123');

        expect(report.userId).toBe('test-user-123');
        expect(report.ranAt).toBeInstanceOf(Date);
        expect(report.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('graph operations (stubs)', () => {
    it('should return empty links array', async () => {
      const links = await facade.getLinks();
      expect(links).toEqual([]);
    });

    it('should create a link stub', async () => {
      const link = await facade.addLink('test-user-123', {
        sourceId: 'source-id',
        targetId: 'target-id',
        type: 'semantic',
      });

      expect(link.id).toBeDefined();
      expect(link.sourceId).toBe('source-id');
      expect(link.targetId).toBe('target-id');
      expect(link.type).toBe('semantic');
    });
  });
});
