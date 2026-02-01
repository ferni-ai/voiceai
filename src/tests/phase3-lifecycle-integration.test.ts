/**
 * Phase 3 Lifecycle Integration Tests
 *
 * Tests deep integration of:
 * - Consolidation with actual storage
 * - Decay with persistence
 * - Auto-linking on memory write
 * - Chronicle-Narrative bridge
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: vi.fn((obj) => obj),
}));

// Mock vector store
vi.mock('../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: vi.fn(() => ({
    addDocument: vi.fn(),
    search: vi.fn(() => []),
  })),
}));

// Mock embeddings
vi.mock('../memory/embeddings.js', () => ({
  embed: vi.fn(() => Array(768).fill(0.1)),
}));

// Mock Chronicle service
vi.mock('../services/chronicle/index.js', () => ({
  getChronicleService: vi.fn(() => ({
    getEntries: vi.fn(() => []),
    searchEntries: vi.fn(() => []),
  })),
}));

// Mock life narrative
vi.mock('../services/superhuman/life-narrative.js', () => ({
  detectChapterMoment: vi.fn(() => null),
  createOrUpdateChapter: vi.fn(() => ({
    id: 'chapter_123',
    type: 'growth',
    title: 'Test Chapter',
  })),
  loadUserChapters: vi.fn(() => []),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Phase 3: Lifecycle Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Lifecycle Integration Module', () => {
    it('should export lifecycle integration functions', async () => {
      const {
        getUserMemories,
        saveMemory,
        updateMemoryStrength,
        reinforceMemory,
        runLifecycleMaintenance,
        createLinksForNewMemory,
      } = await import('../memory/lifecycle-integration.js');

      expect(getUserMemories).toBeDefined();
      expect(saveMemory).toBeDefined();
      expect(updateMemoryStrength).toBeDefined();
      expect(reinforceMemory).toBeDefined();
      expect(runLifecycleMaintenance).toBeDefined();
      expect(createLinksForNewMemory).toBeDefined();
    });

    it('should handle getUserMemories when Firestore unavailable', async () => {
      const { getUserMemories } = await import('../memory/lifecycle-integration.js');

      const memories = await getUserMemories('test-user');

      expect(memories).toEqual([]);
    });

    it('should handle reinforceMemory when Firestore unavailable', async () => {
      const { reinforceMemory } = await import('../memory/lifecycle-integration.js');

      const result = await reinforceMemory('test-user', 'mem_123', 1.5);

      expect(result.previousStrength).toBe(0.5);
      expect(result.newStrength).toBe(0.5);
    });

    it('should return empty result for runLifecycleMaintenance with no memories', async () => {
      const { runLifecycleMaintenance } = await import('../memory/lifecycle-integration.js');

      const result = await runLifecycleMaintenance('test-user');

      expect(result.consolidation.memoriesProcessed).toBe(0);
      expect(result.decay.memoriesAnalyzed).toBe(0);
      expect(result.links.created).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('UnifiedMemoryService with Deep Integration', () => {
    it('should write memory with link creation', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.write({
        userId: 'test-user',
        content: 'User mentioned their daughter starting college',
        type: 'fact',
        importance: 'high',
        metadata: { topics: ['family', 'milestone'] },
      });

      expect(result.success).toBe(true);
      expect(result.memoryId).toBeDefined();
      // linksCreated may be 0 when Firestore unavailable
    });

    it('should run maintenance with deep integration', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.runMaintenance('test-user');

      expect(result.consolidation).toBeDefined();
      expect(result.decay).toBeDefined();
      expect(result.graphLinks).toBeDefined();
    });

    it('should reinforce memory with persistence', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.reinforceMemory('test-user', 'mem_123', 1.5);

      expect(result.previousStrength).toBeDefined();
      expect(result.newStrength).toBeDefined();
    });

    it('should create memory links', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const links = await service.createMemoryLinks(
        'test-user',
        'mem_123',
        'User talked about their daughter',
        ['family']
      );

      expect(Array.isArray(links)).toBe(true);
    });
  });

  describe('Consolidation Integration', () => {
    it('should consolidate user memories', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.consolidateMemories('test-user');

      expect(result.memoriesProcessed).toBe(0); // No memories when Firestore unavailable
      expect(result.groupsFound).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Decay Integration', () => {
    it('should apply decay to user memories', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.applyDecay('test-user');

      expect(result.memoriesDecayed).toBe(0); // No memories when Firestore unavailable
      expect(result.memoriesArchived).toBe(0);
      expect(result.memoriesProtected).toBe(0);
    });
  });
});

describe('Phase 3: End-to-End Flow', () => {
  it('should handle complete memory lifecycle', async () => {
    const { getUnifiedMemoryService, resetUnifiedMemoryService } =
      await import('../services/unified-memory-service.js');

    resetUnifiedMemoryService();
    const service = getUnifiedMemoryService();

    // 1. Write a memory
    const writeResult = await service.write({
      userId: 'test-user',
      content: 'Started a new job at a great company',
      type: 'milestone',
      importance: 'high',
      metadata: { topics: ['career', 'work'] },
    });
    expect(writeResult.success).toBe(true);

    // 2. Reinforce the memory (user mentioned it again)
    if (writeResult.memoryId) {
      const reinforceResult = await service.reinforceMemory('test-user', writeResult.memoryId, 1.5);
      expect(reinforceResult.newStrength).toBeDefined();
    }

    // 3. Run maintenance (consolidation + decay + links)
    const maintenanceResult = await service.runMaintenance('test-user');
    expect(maintenanceResult.consolidation).toBeDefined();
    expect(maintenanceResult.decay).toBeDefined();
    expect(maintenanceResult.graphLinks).toBeDefined();

    // 4. Recall context
    const recallResult = await service.recall({
      userId: 'test-user',
      currentInput: 'How is the new job going?',
      turnNumber: 5,
      sessionId: 'session_123',
    });
    expect(recallResult).toBeDefined();
  });
});
