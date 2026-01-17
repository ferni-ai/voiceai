/**
 * Unified Memory Service Integration Tests
 *
 * Tests the complete memory flow:
 * 1. UnifiedMemoryService as single entry point
 * 2. Timing intelligence decisions
 * 3. Memory tools using unified service
 * 4. Feedback collection for learning
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(() => ({
    recall: vi.fn(async () => ({
      primaryMemories: [
        {
          item: { content: 'Test memory', type: 'fact' },
          score: 0.8,
          naturalExplanation: 'Found a relevant memory',
          connectionStrength: 'strong',
          connectionType: 'topic_match',
          suggestedReference: 'You mentioned this before',
        },
      ],
      callbacks: [],
      priming: null,
      emotional: {
        userState: { dominant: 'neutral', confidence: 0.5, detected: [] },
        bondState: { level: 'acquaintance', trust: 0.5, warmth: 0.5 },
        threads: [],
        approachGuidance: null,
      },
      activePatterns: [],
      formattedContext: 'Test formatted context',
    })),
    recordInteraction: vi.fn(async () => {}),
    getMemoryHealth: vi.fn(async () => ({
      totalMemories: 10,
      recentMemories: 5,
      strongMemories: 3,
      emotionalMemories: 2,
      commitments: 1,
    })),
  })),
}));

vi.mock('../memory/semantic-rag.js', () => ({
  semanticSearch: vi.fn(async () => [{ content: 'Test search result', score: 0.7, metadata: {} }]),
  ragLookup: vi.fn(async () => 'General knowledge result'),
}));

// Import after mocks
import {
  getUnifiedMemoryService,
  resetUnifiedMemoryService,
  type EnhancedRecallResult,
} from '../services/unified-memory-service.js';

describe('UnifiedMemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUnifiedMemoryService();
  });

  afterEach(() => {
    resetUnifiedMemoryService();
  });

  describe('Singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getUnifiedMemoryService();
      const instance2 = getUnifiedMemoryService();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance when reset is called', () => {
      const instance1 = getUnifiedMemoryService();
      resetUnifiedMemoryService();
      const instance2 = getUnifiedMemoryService();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('recall()', () => {
    it('should return enhanced recall result with timing', async () => {
      const service = getUnifiedMemoryService();

      const result = await service.recall({
        userId: 'test-user',
        profile: { name: 'Test', totalConversations: 5 } as any,
        query: 'test query',
        conversationTurn: 5,
      });

      expect(result).toHaveProperty('timing');
      expect(result).toHaveProperty('phrasing');
      expect(result.timing).toHaveProperty('shouldSurface');
      expect(result.timing).toHaveProperty('reason');
      expect(result.timing).toHaveProperty('confidence');
    });

    it('should not surface on early turns', async () => {
      const service = getUnifiedMemoryService();

      const result = await service.recall({
        userId: 'test-user',
        profile: { name: 'Test', totalConversations: 5 } as any,
        query: 'test query',
        conversationTurn: 0,
      });

      expect(result.timing.shouldSurface).toBe(false);
      expect(result.timing.reason).toBe('conversation_flow');
    });

    it('should be careful during emotional states', async () => {
      // Create a new service with fresh mock that returns weak memories
      resetUnifiedMemoryService();

      // Re-mock with weak memories during sad state
      const memoryMod = await import('../memory/index.js');
      vi.mocked(memoryMod.getMemoryOrchestrator).mockReturnValue({
        recall: vi.fn(async () => ({
          primaryMemories: [
            {
              item: { content: 'Test memory', type: 'fact' },
              score: 0.5,
              naturalExplanation: 'Found a memory',
              connectionStrength: 'subtle', // Weak - should not surface during emotional state
              connectionType: 'topic_match',
              suggestedReference: 'You mentioned this',
            },
          ],
          callbacks: [],
          priming: null,
          emotional: {
            userState: { dominant: 'sad', confidence: 0.7, detected: ['sad'] },
            bondState: { level: 'acquaintance', trust: 0.5, warmth: 0.5 },
            threads: [],
            approachGuidance: null,
          },
          activePatterns: [],
          formattedContext: 'Test context',
        })),
        recordInteraction: vi.fn(async () => {}),
        getMemoryHealth: vi.fn(async () => ({
          totalMemories: 10,
          recentMemories: 5,
          strongMemories: 3,
          emotionalMemories: 2,
          commitments: 1,
        })),
      } as any);

      const service = getUnifiedMemoryService();

      const result = await service.recall({
        userId: 'emotional-test-user',
        profile: { name: 'Test', totalConversations: 5 } as any,
        query: 'test query',
        currentEmotion: 'sad',
        conversationTurn: 5,
      });

      // With subtle/weak memory strength (0.3) during sad emotional state,
      // the timing engine should NOT surface because memoryStrength < 0.8
      expect(result.timing.shouldSurface).toBe(false);
      expect(result.timing.reason).toBe('emotional_state');
    });
  });

  describe('search()', () => {
    it('should search with userId', async () => {
      const service = getUnifiedMemoryService();

      const result = await service.search({
        query: 'test query',
        userId: 'test-user',
      });

      expect(result).toBeTruthy();
      expect(result).toContain('Test search result');
    });

    it('should search without userId (general knowledge)', async () => {
      const service = getUnifiedMemoryService();

      const result = await service.search({
        query: 'general question',
      });

      expect(result).toBe('General knowledge result');
    });

    it('should return null on no results', async () => {
      vi.mocked(await import('../memory/semantic-rag.js')).semanticSearch.mockResolvedValueOnce([]);

      const service = getUnifiedMemoryService();

      const result = await service.search({
        query: 'no match query',
        userId: 'test-user',
      });

      expect(result).toBeNull();
    });
  });

  describe('write()', () => {
    it('should write memory successfully', async () => {
      const service = getUnifiedMemoryService();

      const result = await service.write({
        userId: 'test-user',
        content: 'Test fact',
        type: 'fact',
        importance: 'high',
      });

      expect(result.success).toBe(true);
      expect(result.memoryId).toBeTruthy();
    });
  });

  describe('recordFeedback()', () => {
    it('should record feedback', () => {
      const service = getUnifiedMemoryService();

      expect(() => {
        service.recordFeedback({
          memoryId: 'mem_123',
          userId: 'test-user',
          action: 'engaged',
          context: { personaId: 'ferni' },
        });
      }).not.toThrow();
    });

    it('should track engagement stats', () => {
      const service = getUnifiedMemoryService();

      // Record some feedback
      service.recordFeedback({
        memoryId: 'mem_1',
        userId: 'test-user',
        action: 'engaged',
        context: {},
      });
      service.recordFeedback({
        memoryId: 'mem_2',
        userId: 'test-user',
        action: 'dismissed',
        context: {},
      });
      service.recordFeedback({
        memoryId: 'mem_3',
        userId: 'test-user',
        action: 'engaged',
        context: {},
      });

      const stats = service.getEngagementStats('test-user');

      expect(stats.total).toBe(3);
      expect(stats.engaged).toBe(2);
      expect(stats.dismissed).toBe(1);
      expect(stats.engagementRate).toBeCloseTo(0.67, 1);
    });
  });

  describe('Session lifecycle', () => {
    it('should reset session state', async () => {
      const service = getUnifiedMemoryService();

      // Do some recalls to build up state
      await service.recall({
        userId: 'test-user',
        profile: { name: 'Test', totalConversations: 5 } as any,
        query: 'test',
        conversationTurn: 5,
      });

      // Reset should not throw
      expect(() => {
        service.resetSession('test-user');
      }).not.toThrow();
    });

    it('should return memory health', async () => {
      const service = getUnifiedMemoryService();

      const health = await service.getHealth('test-user');

      expect(health).toHaveProperty('totalMemories');
      expect(health.totalMemories).toBe(10);
    });
  });
});

describe('Timing Intelligence', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetUnifiedMemoryService();

    // Re-setup mocks for timing tests
    const memoryMod = await import('../memory/index.js');
    vi.mocked(memoryMod.getMemoryOrchestrator).mockReturnValue({
      recall: vi.fn(async () => ({
        primaryMemories: [
          {
            item: { content: 'Test memory', type: 'fact' },
            score: 0.8,
            naturalExplanation: 'Found a relevant memory',
            connectionStrength: 'strong',
            connectionType: 'topic_match',
            suggestedReference: 'You mentioned this before',
          },
        ],
        callbacks: [],
        priming: null,
        emotional: {
          userState: { dominant: 'neutral', confidence: 0.5, detected: [] },
          bondState: { level: 'acquaintance', trust: 0.5, warmth: 0.5 },
          threads: [],
          approachGuidance: null,
        },
        activePatterns: [],
        formattedContext: 'Test formatted context',
      })),
      recordInteraction: vi.fn(async () => {}),
      getMemoryHealth: vi.fn(async () => ({
        totalMemories: 10,
        recentMemories: 5,
        strongMemories: 3,
        emotionalMemories: 2,
        commitments: 1,
      })),
    } as any);
  });

  afterEach(() => {
    resetUnifiedMemoryService();
  });

  it('should respect cooldown between surfaces', async () => {
    const service = getUnifiedMemoryService();

    // First recall - should surface
    const result1 = await service.recall({
      userId: 'cooldown-test-user',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test 1',
      conversationTurn: 5,
    });

    // Second recall immediately - should still surface (within limit)
    const result2 = await service.recall({
      userId: 'cooldown-test-user',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test 2',
      conversationTurn: 6,
    });

    // Third recall - should still surface (limit is 3)
    const result3 = await service.recall({
      userId: 'cooldown-test-user',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test 3',
      conversationTurn: 7,
    });

    // Fourth recall - should hit cooldown
    const result4 = await service.recall({
      userId: 'cooldown-test-user',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test 4',
      conversationTurn: 8,
    });

    expect(result1.timing.shouldSurface).toBe(true);
    expect(result2.timing.shouldSurface).toBe(true);
    expect(result3.timing.shouldSurface).toBe(true);
    expect(result4.timing.shouldSurface).toBe(false);
    expect(result4.timing.reason).toBe('cooldown');
  });

  it('should infer conversation phase from turn count', async () => {
    const service = getUnifiedMemoryService();

    // Turn 1 = opening
    const opening = await service.recall({
      userId: 'phase-test-user',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test',
      conversationTurn: 1,
    });
    expect(opening.timing.shouldSurface).toBe(false); // Early turn protection

    // Turn 5 = exploring - use different user to avoid cooldown
    const exploring = await service.recall({
      userId: 'phase-test-user-2',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test',
      conversationTurn: 5,
    });
    expect(exploring.timing.shouldSurface).toBe(true);

    // Turn 20 = closing (good for callbacks) - use different user
    const closing = await service.recall({
      userId: 'phase-test-user-3',
      profile: { name: 'Test', totalConversations: 5 } as any,
      query: 'test',
      conversationTurn: 20,
    });
    expect(closing.timing.shouldSurface).toBe(true);
    expect(closing.timing.reason).toBe('conversation_flow');
  });
});

describe('Memory Tools Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUnifiedMemoryService();
  });

  afterEach(() => {
    resetUnifiedMemoryService();
  });

  it('should have unified tools available', async () => {
    // Import the unified tools
    const { unifiedMemoryTools } = await import('../tools/domains/memory/tools-unified.js');

    expect(unifiedMemoryTools).toHaveLength(6);
    expect(unifiedMemoryTools.map((t) => t.id)).toContain('recallFromMemory');
    expect(unifiedMemoryTools.map((t) => t.id)).toContain('rememberAboutUser');
    expect(unifiedMemoryTools.map((t) => t.id)).toContain('surfaceRelevantMemory');
    expect(unifiedMemoryTools.map((t) => t.id)).toContain('predictUserNeed');
  });

  it('should export through domain index', async () => {
    const { getToolDefinitions } = await import('../tools/domains/memory/index.js');

    const tools = await getToolDefinitions();

    expect(tools.length).toBeGreaterThan(0);
    const toolIds = tools.map((t) => t.id);
    expect(toolIds).toContain('recallFromMemory');
    expect(toolIds).toContain('rememberAboutUser');
  });
});
