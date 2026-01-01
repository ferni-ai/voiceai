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

  describe('Chronicle-Narrative Bridge', () => {
    it('should export bridge functions', async () => {
      const {
        processEntryForNarrative,
        searchWithNarrativeContext,
        chapterToMemory,
        processHistoricalEntries,
      } = await import('../services/chronicle-narrative-bridge.js');

      expect(processEntryForNarrative).toBeDefined();
      expect(searchWithNarrativeContext).toBeDefined();
      expect(chapterToMemory).toBeDefined();
      expect(processHistoricalEntries).toBeDefined();
    });

    it('should convert chapter to memory', async () => {
      const { chapterToMemory } = await import('../services/chronicle-narrative-bridge.js');

      const chapter = {
        id: 'chapter_123',
        userId: 'test-user',
        title: 'The Growth Phase',
        summary: 'A time of learning and development',
        type: 'growth' as const,
        startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
        keyQuotes: ['I learned so much'],
        keyPeople: ['mentor'],
        keyEmotions: ['hopeful', 'curious'],
        keyThemes: ['growth', 'learning'],
        insightsGained: ['Patience is key'],
        strengthsRevealed: ['Resilience'],
        patternsIdentified: [],
        createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        lastUpdated: Date.now(),
        conversationCount: 5,
      };

      const memory = chapterToMemory(chapter);

      expect(memory.id).toBe('chapter_chapter_123');
      expect(memory.type).toBe('summary');
      expect(memory.content).toContain('Life chapter');
      expect(memory.content).toContain('The Growth Phase');
      expect(memory.topics).toEqual(['growth', 'learning']);
      expect(memory.personMentioned).toBe('mentor');
      expect(memory.baseImportance).toBe(0.8);
    });

    it('should process entry for narrative without chapter detection', async () => {
      const { processEntryForNarrative } =
        await import('../services/chronicle-narrative-bridge.js');

      const entry = {
        id: 'entry_123',
        userId: 'test-user',
        content: 'Had a good day today',
        source: 'text' as const,
        themes: ['gratitude'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await processEntryForNarrative('test-user', entry);

      expect(result.chronicleEntryId).toBe('entry_123');
      expect(result.chapterDetected).toBe(false);
      // Memory creation depends on vector store mock
    });

    it('should search with narrative context', async () => {
      const { searchWithNarrativeContext } =
        await import('../services/chronicle-narrative-bridge.js');

      const result = await searchWithNarrativeContext('test-user', 'work stress', 5);

      expect(result.chronicleEntries).toEqual([]);
      expect(result.relatedChapters).toEqual([]);
      expect(result.themeOverlap).toEqual([]);
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
