/**
 * Integration Tests for Persistence Layer
 *
 * Tests the unified persistence layer and all integrated services.
 * Uses mock Firestore to avoid external dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK FIRESTORE
// ============================================================================

const mockFirestoreData = new Map<string, Map<string, unknown>>();

const mockDocRef = (collection: string, docId: string) => ({
  set: vi.fn().mockImplementation((data: unknown, options?: { merge?: boolean }) => {
    let collectionData = mockFirestoreData.get(collection);
    if (!collectionData) {
      collectionData = new Map();
      mockFirestoreData.set(collection, collectionData);
    }
    if (options?.merge) {
      const existing = collectionData.get(docId) || {};
      collectionData.set(docId, { ...existing, ...data });
    } else {
      collectionData.set(docId, data);
    }
    return Promise.resolve();
  }),
  get: vi.fn().mockImplementation(() => {
    const collectionData = mockFirestoreData.get(collection);
    const data = collectionData?.get(docId);
    return Promise.resolve({
      exists: !!data,
      data: () => data,
    });
  }),
  delete: vi.fn().mockImplementation(() => {
    const collectionData = mockFirestoreData.get(collection);
    collectionData?.delete(docId);
    return Promise.resolve();
  }),
});

const mockCollection = (name: string) => ({
  doc: (docId: string) => mockDocRef(name, docId),
});

const mockBatch = () => {
  const ops: Array<{ type: 'set' | 'delete'; ref: ReturnType<typeof mockDocRef>; data?: unknown }> =
    [];
  return {
    set: (ref: ReturnType<typeof mockDocRef>, data: unknown, options?: { merge?: boolean }) => {
      ops.push({ type: 'set', ref, data });
    },
    delete: (ref: ReturnType<typeof mockDocRef>) => {
      ops.push({ type: 'delete', ref });
    },
    commit: vi.fn().mockImplementation(async () => {
      for (const op of ops) {
        if (op.type === 'set') {
          await op.ref.set(op.data, { merge: true });
        } else {
          await op.ref.delete();
        }
      }
    }),
  };
};

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
}));

// ============================================================================
// TEST UTILITIES
// ============================================================================

function clearMockData() {
  mockFirestoreData.clear();
}

// ============================================================================
// TESTS: Persistence Store
// ============================================================================

describe('Persistence Store', () => {
  beforeEach(() => {
    clearMockData();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPersistenceStore', () => {
    it('should create a store with default config', async () => {
      const { createPersistenceStore } = await import('../services/persistence/index.js');

      interface TestData {
        name: string;
        value: number;
      }

      const store = createPersistenceStore<TestData>({
        collection: 'test_collection',
      });

      expect(store).toBeDefined();
      expect(store.get).toBeDefined();
      expect(store.set).toBeDefined();
      expect(store.delete).toBeDefined();
      expect(store.flush).toBeDefined();

      await store.shutdown();
    });

    it('should set and get data from cache', async () => {
      const { createPersistenceStore } = await import('../services/persistence/index.js');

      interface TestData {
        name: string;
        value: number;
      }

      const store = createPersistenceStore<TestData>({
        collection: 'test_cache',
        syncIntervalMs: 60000, // Long interval to test cache
      });

      const testData: TestData = { name: 'test', value: 42 };
      store.set('user123', testData);

      const retrieved = await store.get('user123');
      expect(retrieved).toEqual(testData);

      await store.shutdown();
    });

    it('should report correct stats', async () => {
      const { createPersistenceStore } = await import('../services/persistence/index.js');

      interface TestData {
        name: string;
      }

      const store = createPersistenceStore<TestData>({
        collection: 'test_stats',
        syncIntervalMs: 60000,
      });

      store.set('user1', { name: 'Alice' });
      store.set('user2', { name: 'Bob' });

      const stats = store.getStats();
      expect(stats.cached).toBe(2);
      expect(stats.dirty).toBe(2);

      await store.shutdown();
    });

    it('should clear cache for specific user', async () => {
      const { createPersistenceStore } = await import('../services/persistence/index.js');

      interface TestData {
        name: string;
      }

      const store = createPersistenceStore<TestData>({
        collection: 'test_clear',
        syncIntervalMs: 60000,
      });

      store.set('user1', { name: 'Alice' });
      store.set('user2', { name: 'Bob' });

      store.clearCache('user1');

      const stats = store.getStats();
      expect(stats.cached).toBe(1);

      const user1 = await store.get('user1');
      expect(user1).toBeNull();

      await store.shutdown();
    });
  });
});

// ============================================================================
// TESTS: Service Integration
// ============================================================================

describe('Service Persistence Integration', () => {
  beforeEach(() => {
    clearMockData();
    vi.clearAllMocks();
  });

  describe('Push Notifications', () => {
    it('should persist subscriptions', async () => {
      const { getPushNotificationsService, resetPushNotificationsService } =
        await import('../services/outreach/push-notifications.js');

      const service = getPushNotificationsService();
      await service.registerSubscription({
        endpoint: 'https://test.endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
        platform: 'web',
        userId: 'user123',
        createdAt: new Date().toISOString(),
      });

      const stats = service.getStats();
      expect(stats.subscriptions).toBe(1);
      expect(stats.totalUsers).toBe(1);

      await resetPushNotificationsService();
    });
  });

  describe('Outreach Intelligence', () => {
    it('should extract and store commitments', async () => {
      const { extractCommitments, initializeOutreachPersistence, shutdownOutreachPersistence } =
        await import('../services/outreach-intelligence.js');

      await initializeOutreachPersistence();

      const commitments = extractCommitments(
        'user123',
        "I'll work out tomorrow and call my mom this weekend",
        new Date()
      );

      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].what).toContain('work out');

      await shutdownOutreachPersistence();
    });

    it('should track engagement patterns', async () => {
      const { recordInteraction, getOutreachMemoryStats, initializeOutreachPersistence } =
        await import('../services/outreach-intelligence.js');

      await initializeOutreachPersistence();

      recordInteraction('user123', new Date());

      const stats = getOutreachMemoryStats();
      expect(stats.engagement).toBe(1);
    });
  });

  describe('Team Engagement', () => {
    it('should generate and persist team huddles', async () => {
      const { getTeamEngagementService, shutdownTeamEngagementService } =
        await import('../services/engagement/team-engagement.js');

      const service = getTeamEngagementService();
      await service.initialize();

      const huddle = await service.generateTeamHuddle('user123', null, 'weekly');

      expect(huddle.intro).toBeDefined();
      expect(huddle.comments.length).toBeGreaterThan(0);
      expect(huddle.outro).toBeDefined();

      await shutdownTeamEngagementService();
    });
  });

  describe('Communication Mirroring', () => {
    it('should analyze and persist communication style', async () => {
      const {
        getCommunicationMirroring,
        initializeCommunicationMirroringPersistence,
        shutdownCommunicationMirroringPersistence,
      } = await import('../intelligence/tracking/communication-style.js');

      await initializeCommunicationMirroringPersistence();

      const engine = getCommunicationMirroring('user123');

      // Analyze several messages
      await engine.analyzeMessage('Hey! This is awesome! Love it! 🎉');
      await engine.analyzeMessage('Super excited about this project!!!');
      await engine.analyzeMessage('OMG this is great haha');

      const stats = engine.getStats();
      expect(stats.sampleCount).toBe(3);

      // Style should detect high energy
      expect(stats.style.energy).toBe('animated');

      await shutdownCommunicationMirroringPersistence();
    });
  });
});

// ============================================================================
// TESTS: Lifecycle Management
// ============================================================================

describe('Persistence Lifecycle', () => {
  beforeEach(() => {
    clearMockData();
    vi.clearAllMocks();
  });

  it('should report persistence status', async () => {
    const { getPersistenceStatus } = await import('../services/persistence/lifecycle.js');

    const status = getPersistenceStatus();
    expect(status).toBeDefined();
    expect(typeof status.initialized).toBe('boolean');
    expect(typeof status.shuttingDown).toBe('boolean');
    expect(typeof status.stats).toBe('object');
  });
});

// ============================================================================
// TESTS: Data Integrity
// ============================================================================

describe('Data Integrity', () => {
  beforeEach(() => {
    clearMockData();
    vi.clearAllMocks();
  });

  it('should preserve data through set/get cycle', async () => {
    const { createPersistenceStore } = await import('../services/persistence/index.js');

    interface ComplexData {
      id: string;
      nested: {
        array: number[];
        object: { key: string };
      };
      date: string;
    }

    const store = createPersistenceStore<ComplexData>({
      collection: 'test_integrity',
    });

    const original: ComplexData = {
      id: 'test123',
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' },
      },
      date: new Date().toISOString(),
    };

    store.set('user123', original);
    const retrieved = await store.get('user123');

    expect(retrieved).toEqual(original);

    await store.shutdown();
  });

  it('should handle concurrent operations', async () => {
    const { createPersistenceStore } = await import('../services/persistence/index.js');

    interface CounterData {
      count: number;
    }

    const store = createPersistenceStore<CounterData>({
      collection: 'test_concurrent',
    });

    // Simulate concurrent writes
    const promises = Array.from({ length: 10 }, (_, i) =>
      Promise.resolve(store.set(`user${i}`, { count: i }))
    );

    await Promise.all(promises);

    const stats = store.getStats();
    expect(stats.cached).toBe(10);

    await store.shutdown();
  });
});
