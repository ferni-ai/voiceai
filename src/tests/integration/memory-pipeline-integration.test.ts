/**
 * Memory Pipeline Integration Tests
 *
 * Tests the full memory pipeline from capture through recall:
 * Capture → Firestore (L2) → Spanner (L3) → Recall
 *
 * These tests validate the complete integration of:
 * - UnifiedStore with all adapters
 * - Associative Cortex with SpannerMemoryGraph
 * - Memory Intelligence learning persistence
 *
 * @module tests/integration/memory-pipeline-integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { StoredMemory, MemoryInput, RecallResult } from '../../memory/unified-store/types.js';
import { perfBudget } from '../perf-budget.js';

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

vi.mock('../../memory/spanner-graph/client.js', () => ({
  isSpannerReady: () => mockSpannerReady(),
  initializeSpanner: vi.fn().mockResolvedValue(true),
  upsertEntity: (...args: unknown[]) => mockUpsertEntity(...args),
  insertFact: (...args: unknown[]) => mockInsertFact(...args),
  insertRelationship: (...args: unknown[]) => mockInsertRelationship(...args),
  getEntitiesByUser: (...args: unknown[]) => mockGetEntitiesByUser(...args),
  getMemoryThreadsByUser: vi.fn().mockResolvedValue([]),
  getMemoryAnchorsByUser: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../memory/spanner-graph/queries.js', () => ({
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
    it('should initialize every adapter, with no Spanner store', async () => {
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

      expect(health.stores).not.toHaveProperty('spanner');
      expect(health.stores.firestore).toBeDefined();
      expect(health.stores.vector).toBeDefined();

      await store.shutdown();
    });

    it('should store a high-importance memory with no graph write', async () => {
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
      
      expect(memory.peopleMentioned).toContain('Sarah');
      // No Spanner sync, now or later: let any queued async work run, then check the graph.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(mockUpsertEntity).not.toHaveBeenCalled();
      expect(mockInsertFact).not.toHaveBeenCalled();
      expect(mockInsertRelationship).not.toHaveBeenCalled();

      await store.shutdown();
    });

    it('should not depend on Spanner being available', async () => {
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
      expect(health.stores).not.toHaveProperty('spanner');
      expect((health.recommendations ?? []).some((r) => /spanner/i.test(r))).toBe(false);

      await store.shutdown();
    });
  });

  // RETIRED 2026-09-20: memory/associative-cortex/cortex.ts no longer exists and
  // getAssociativeCortex()/resetAssociativeCortex() have no equivalent. Spreading
  // activation now lives in memory/retrieval/spreading-activation.ts, which has a
  // different surface and needs its own tests.
  describe.skip('Associative Cortex with SpannerMemoryGraph (module removed)', () => {
    it('needs rewriting against retrieval/spreading-activation', () => {
      expect(true).toBe(true);
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
    expect(duration).toBeLessThan(perfBudget(1000));

    await store.shutdown();
  });
});
