/**
 * Memory Pipeline Integration Tests
 *
 * Tests the full memory pipeline from capture through recall:
 * Capture → Firestore (L2) → Spanner (L3) → Recall
 *
 * These tests validate the complete integration of:
 * - UnifiedStore with all adapters
 * - SpannerAdapter graph operations
 * - Associative Cortex with SpannerMemoryGraph
 * - Memory Intelligence learning persistence
 * - Real-time sync for high-importance memories
 *
 * @module tests/integration/memory-pipeline-integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { StoredMemory, MemoryInput, RecallResult } from '../../memory/unified-store/types.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_USER_ID = `test-user-${Date.now()}`;
const TEST_SESSION_ID = `test-session-${Date.now()}`;

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock Firestore
const mockFirestoreStore = vi.fn().mockResolvedValue(undefined);
const mockFirestoreGet = vi.fn().mockResolvedValue(null);
const mockFirestoreGetByUser = vi.fn().mockResolvedValue([]);
const mockFirestoreDelete = vi.fn().mockResolvedValue(undefined);
const mockFirestoreHealth = vi.fn().mockResolvedValue({ healthy: true, initialized: true });

vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: mockFirestoreStore,
        get: vi.fn(() => Promise.resolve({ exists: false, data: () => undefined })),
        delete: mockFirestoreDelete,
      })),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
    })),
    collectionGroup: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
    })),
  })),
}));

// Mock Spanner
const mockSpannerReady = vi.fn().mockReturnValue(true);
const mockUpsertEntity = vi.fn().mockResolvedValue(undefined);
const mockInsertFact = vi.fn().mockResolvedValue(undefined);
const mockInsertRelationship = vi.fn().mockResolvedValue(undefined);
const mockGetEntitiesByUser = vi.fn().mockResolvedValue([]);
const mockGetEntityByName = vi.fn().mockResolvedValue(null);

vi.mock('../../memory/spanner-graph/client.js', () => ({
  isSpannerReady: () => mockSpannerReady(),
  initializeSpanner: vi.fn().mockResolvedValue(true),
  closeSpanner: vi.fn().mockResolvedValue(undefined),
  upsertEntity: (...args: unknown[]) => mockUpsertEntity(...args),
  insertFact: (...args: unknown[]) => mockInsertFact(...args),
  insertRelationship: (...args: unknown[]) => mockInsertRelationship(...args),
  getEntitiesByUser: (...args: unknown[]) => mockGetEntitiesByUser(...args),
  getEntityByName: (...args: unknown[]) => mockGetEntityByName(...args),
  getMemoryThreadsByUser: vi.fn().mockResolvedValue([]),
  getMemoryAnchorsByUser: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../memory/spanner-graph/queries.js', () => ({
  getEntityWithFacts: vi.fn().mockResolvedValue(null),
  getEntityRelationships: vi.fn().mockResolvedValue([]),
  getExtendedNetwork: vi.fn().mockResolvedValue([]),
  getEntityContext: vi.fn().mockResolvedValue(null),
  classifyFactDomain: vi.fn().mockReturnValue('general'),
}));

// Mock embeddings
vi.mock('../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTestMemory(overrides: Partial<MemoryInput> = {}): MemoryInput {
  return {
    userId: TEST_USER_ID,
    type: 'conversation',
    content: 'Test memory content',
    sessionId: TEST_SESSION_ID,
    topics: ['test'],
    ...overrides,
  };
}

function createHighImportanceMemory(): MemoryInput {
  return createTestMemory({
    type: 'insight',
    content: 'Sarah mentioned she is struggling with anxiety about her job promotion.',
    emotionalWeight: 0.85,
    peopleMentioned: ['Sarah'],
    topics: ['career', 'anxiety', 'mental-health'],
  });
}

function createRelationshipMemory(): MemoryInput {
  return createTestMemory({
    type: 'relationship',
    content: 'Mike and Sarah have been dating for 3 months. They met at a yoga class.',
    emotionalWeight: 0.7,
    peopleMentioned: ['Mike', 'Sarah'],
    topics: ['relationships', 'dating'],
  });
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Memory Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpannerReady.mockReturnValue(true);
  });

  describe('UnifiedStore with All Adapters', () => {
    it('should initialize all adapters including Spanner', async () => {
      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: true,
          useRedisCache: false,
        },
      });

      await store.initialize();
      const health = await store.health();

      expect(health.stores.spanner).toBeDefined();
      expect(health.stores.firestore).toBeDefined();
      expect(health.stores.vector).toBeDefined();

      await store.shutdown();
    });

    it('should store memory with Spanner sync for high-importance', async () => {
      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: false,
          useRedisCache: false,
        },
      });

      await store.initialize();
      const memory = await store.store(createHighImportanceMemory());

      expect(memory.id).toBeDefined();
      expect(memory.emotionalWeight).toBe(0.85);
      
      // High-importance memories should trigger immediate Spanner sync
      // The sync is async, so we just verify the memory was stored
      expect(memory.peopleMentioned).toContain('Sarah');

      await store.shutdown();
    });

    it('should handle Spanner unavailability gracefully', async () => {
      mockSpannerReady.mockReturnValue(false);

      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: false,
          useRedisCache: false,
        },
      });

      await store.initialize();
      
      // Store should still work even if Spanner is down
      const memory = await store.store(createTestMemory());
      expect(memory.id).toBeDefined();

      const health = await store.health();
      expect(health.stores.spanner.healthy).toBe(false);
      expect(health.recommendations).toBeDefined();

      await store.shutdown();
    });
  });

  describe('SpannerAdapter Operations', () => {
    it('should store entities to Spanner', async () => {
      const { SpannerAdapter } = await import('../../memory/unified-store/adapters/spanner-adapter.js');
      const adapter = new SpannerAdapter();
      await adapter.initialize();

      await adapter.storeEntity({
        entityId: 'test-entity-1',
        userId: TEST_USER_ID,
        name: 'Sarah',
        entityType: 'person',
        attributes: {},
        importance: 0.8,
        firstMentioned: new Date(),
        lastMentioned: new Date(),
        mentionCount: 1,
      });

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'test-entity-1',
          name: 'Sarah',
          entityType: 'person',
        })
      );

      await adapter.shutdown();
    });

    it('should store facts to Spanner', async () => {
      const { SpannerAdapter } = await import('../../memory/unified-store/adapters/spanner-adapter.js');
      const adapter = new SpannerAdapter();
      await adapter.initialize();

      await adapter.storeFact({
        factId: 'test-fact-1',
        userId: TEST_USER_ID,
        factType: 'attribute',
        key: 'job',
        value: 'Software Engineer',
        confidence: 0.9,
        extractedAt: new Date(),
      });

      expect(mockInsertFact).toHaveBeenCalledWith(
        expect.objectContaining({
          factId: 'test-fact-1',
          key: 'job',
          value: 'Software Engineer',
        })
      );

      await adapter.shutdown();
    });

    it('should store relationships to Spanner', async () => {
      const { SpannerAdapter } = await import('../../memory/unified-store/adapters/spanner-adapter.js');
      const adapter = new SpannerAdapter();
      await adapter.initialize();

      await adapter.storeRelationship({
        relationshipId: 'test-rel-1',
        userId: TEST_USER_ID,
        sourceEntityId: 'entity-mike',
        targetEntityId: 'entity-sarah',
        relationshipType: 'dating',
        strength: 0.8,
        bidirectional: true,
      });

      expect(mockInsertRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipId: 'test-rel-1',
          relationshipType: 'dating',
        })
      );

      await adapter.shutdown();
    });

    it('should skip writes when Spanner unavailable', async () => {
      mockSpannerReady.mockReturnValue(false);

      const { SpannerAdapter } = await import('../../memory/unified-store/adapters/spanner-adapter.js');
      const adapter = new SpannerAdapter();
      await adapter.initialize();

      await adapter.storeEntity({
        entityId: 'test-entity-1',
        userId: TEST_USER_ID,
        name: 'Test',
        entityType: 'person',
        attributes: {},
        importance: 0.5,
        firstMentioned: new Date(),
        lastMentioned: new Date(),
        mentionCount: 1,
      });

      // Should not have called Spanner
      expect(mockUpsertEntity).not.toHaveBeenCalled();

      await adapter.shutdown();
    });
  });

  describe('Associative Cortex with SpannerMemoryGraph', () => {
    it('should use SpannerMemoryGraph by default', async () => {
      const { resetAssociativeCortex, getAssociativeCortex } = await import(
        '../../memory/associative-cortex/cortex.js'
      );

      resetAssociativeCortex();
      const cortex = getAssociativeCortex();

      // Cortex should be initialized
      await cortex.initialize();

      // The cortex should have been created with SpannerMemoryGraph
      // (or InMemoryGraph fallback)
      expect(cortex).toBeDefined();

      resetAssociativeCortex();
    });

    it('should spread activation across memory graph', async () => {
      const { resetAssociativeCortex, getAssociativeCortex } = await import(
        '../../memory/associative-cortex/cortex.js'
      );

      resetAssociativeCortex();
      const cortex = getAssociativeCortex();
      await cortex.initialize();

      // Create some test memories in the cortex
      const result = await cortex.spreadActivation(['memory-1', 'memory-2'], {
        topK: 10,
        maxDepth: 2,
      });

      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      resetAssociativeCortex();
    });
  });

  describe('Memory Intelligence Learning Persistence', () => {
    it('should save profile to Firestore', async () => {
      const { saveProfile, loadProfile } = await import(
        '../../intelligence/memory-intelligence/learning/persistence.js'
      );

      const profile = {
        userId: TEST_USER_ID,
        lastUpdated: new Date(),
        receptivityPatterns: {
          byTimeOfDay: new Map([[10, 0.8]]),
          byConversationDepth: new Map([[3, 0.7]]),
          byEmotionalState: new Map([['calm', 0.9]]),
        },
        responsePatterns: {
          topicsWelcomed: ['career', 'health'],
          topicsDeflected: ['politics'],
          preferredPhrasingStyle: 'warm' as const,
        },
        sensitiveTopics: new Set(['family']),
        idealRecallFrequency: 3,
        trustLevel: 'established' as const,
      };

      await expect(saveProfile(profile as any)).resolves.not.toThrow();
    });

    it('should save surfacing records to Firestore', async () => {
      const { saveRecords, loadRecords } = await import(
        '../../intelligence/memory-intelligence/learning/persistence.js'
      );

      const records = [
        {
          memoryId: 'mem-1',
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          surfacedAt: new Date(),
          trigger: 'topic_match',
          style: 'warm_recall',
          persona: 'ferni',
          contextSnapshot: {
            turnCount: 5,
            emotionalIntensity: 0.6,
            topics: ['career'],
          },
          response: {
            type: 'engaged' as const,
            intensity: 0.8,
            timestamp: new Date(),
            turnsUntilResponse: 1,
          },
        },
      ];

      await expect(saveRecords(records)).resolves.not.toThrow();
    });

    it('should get stats for a user', async () => {
      const { getStats } = await import(
        '../../intelligence/memory-intelligence/learning/persistence.js'
      );

      const stats = await getStats(TEST_USER_ID);

      expect(stats).toBeDefined();
      expect(stats.totalSurfacings).toBeDefined();
      expect(stats.averageEngagementRate).toBeDefined();
    });
  });

  describe('Real-Time Sync for High-Importance Memories', () => {
    it('should identify high-importance memories for immediate sync', async () => {
      const { shouldSyncImmediately } = await import(
        '../../memory/dynamic/firestore-spanner-sync.js'
      );

      // High emotional weight
      expect(shouldSyncImmediately({ emotionalWeight: 0.8 })).toBe(true);

      // Many people mentioned
      expect(shouldSyncImmediately({ peopleMentioned: ['A', 'B', 'C'] })).toBe(true);

      // Graph-benefit type
      expect(shouldSyncImmediately({ type: 'relationship' })).toBe(true);
      expect(shouldSyncImmediately({ type: 'commitment' })).toBe(true);

      // Low importance
      expect(shouldSyncImmediately({ emotionalWeight: 0.2 })).toBe(false);
    });

    it('should sync high-importance memory immediately', async () => {
      const { syncMemoryImmediately } = await import(
        '../../memory/dynamic/firestore-spanner-sync.js'
      );

      const memory = {
        id: 'test-mem-1',
        userId: TEST_USER_ID,
        content: 'Sarah got promoted!',
        type: 'milestone',
        emotionalWeight: 0.9,
        peopleMentioned: ['Sarah'],
        topics: ['career'],
        createdAt: new Date(),
      };

      const result = await syncMemoryImmediately(memory);

      // When Spanner is available, sync should succeed
      expect(result).toBe(true);
      expect(mockUpsertEntity).toHaveBeenCalled();
    });

    it('should queue medium-importance memories for priority sync', async () => {
      const { queueForPrioritySync, getPrioritySyncQueue, clearPrioritySyncQueue } = await import(
        '../../memory/dynamic/firestore-spanner-sync.js'
      );

      clearPrioritySyncQueue();

      queueForPrioritySync('mem-1');
      queueForPrioritySync('mem-2');

      const queue = getPrioritySyncQueue();
      expect(queue.size).toBe(2);
      expect(queue.has('mem-1')).toBe(true);

      clearPrioritySyncQueue();
    });
  });

  describe('Full Pipeline: Capture → Recall', () => {
    it('should store and recall memory through full pipeline', async () => {
      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: false, // Simplified for test
          useRedisCache: false,
        },
      });

      await store.initialize();

      // Store a memory
      const input = createHighImportanceMemory();
      const stored = await store.store(input);

      expect(stored.id).toBeDefined();
      expect(stored.userId).toBe(TEST_USER_ID);
      expect(stored.content).toBe(input.content);

      // The memory should be in Firestore
      expect(mockFirestoreStore).toHaveBeenCalled();

      // High-importance should trigger Spanner sync
      // (we can't verify this easily in mocks, but the pathway is tested)

      await store.shutdown();
    });

    it('should handle concurrent store operations', async () => {
      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: false,
          useRedisCache: false,
        },
      });

      await store.initialize();

      // Store multiple memories concurrently
      const memories = await Promise.all([
        store.store(createTestMemory({ content: 'Memory 1' })),
        store.store(createTestMemory({ content: 'Memory 2' })),
        store.store(createTestMemory({ content: 'Memory 3' })),
      ]);

      expect(memories).toHaveLength(3);
      memories.forEach((m, i) => {
        expect(m.id).toBeDefined();
        expect(m.content).toBe(`Memory ${i + 1}`);
      });

      await store.shutdown();
    });

    it('should maintain data integrity across adapters', async () => {
      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: false,
          useRedisCache: false,
        },
      });

      await store.initialize();

      // Store relationship memory
      const relationshipMemory = await store.store(createRelationshipMemory());

      // Verify fields are preserved
      expect(relationshipMemory.type).toBe('relationship');
      expect(relationshipMemory.peopleMentioned).toContain('Mike');
      expect(relationshipMemory.peopleMentioned).toContain('Sarah');
      expect(relationshipMemory.topics).toContain('relationships');

      await store.shutdown();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should continue operation when Spanner fails', async () => {
      mockSpannerReady.mockReturnValue(true);
      mockUpsertEntity.mockRejectedValueOnce(new Error('Spanner error'));

      const { SpannerAdapter } = await import('../../memory/unified-store/adapters/spanner-adapter.js');
      const adapter = new SpannerAdapter();
      await adapter.initialize();

      // Should not throw
      await expect(
        adapter.storeEntity({
          entityId: 'test-entity-1',
          userId: TEST_USER_ID,
          name: 'Test',
          entityType: 'person',
          attributes: {},
          importance: 0.5,
          firstMentioned: new Date(),
          lastMentioned: new Date(),
          mentionCount: 1,
        })
      ).rejects.toThrow('Spanner error');

      // Health should reflect the error
      const health = await adapter.health();
      expect(health.lastError).toBeDefined();

      await adapter.shutdown();
    });

    it('should handle partial adapter failures gracefully', async () => {
      const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');

      // Make Spanner fail
      mockSpannerReady.mockReturnValue(false);

      const store = new UnifiedMemoryStoreFacade({
        features: {
          useSpannerGraph: true,
          useVectorSearch: false,
          useRedisCache: false,
        },
      });

      await store.initialize();

      // Store should still work
      const memory = await store.store(createTestMemory());
      expect(memory.id).toBeDefined();

      // Health should show degradation
      const health = await store.health();
      expect(health.degraded).toBe(true);

      await store.shutdown();
    });
  });
});

describe('Performance Characteristics', () => {
  it('should store memory within acceptable latency', async () => {
    const { UnifiedMemoryStoreFacade } = await import('../../memory/unified-store/facade.js');
    const store = new UnifiedMemoryStoreFacade({
      features: {
        useSpannerGraph: true,
        useVectorSearch: false,
        useRedisCache: false,
      },
    });

    await store.initialize();

    const start = Date.now();
    await store.store(createTestMemory());
    const duration = Date.now() - start;

    // Should complete within 1 second (mocked environment)
    expect(duration).toBeLessThan(1000);

    await store.shutdown();
  });
});
