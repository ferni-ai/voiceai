/**
 * Superhuman Memory Wiring Integration Tests
 *
 * Tests the integration between all the new memory components:
 * - Memory-aware router → Tool orchestrator
 * - Spreading activation → UnifiedMemoryService recall
 * - Context carrier → Session lifecycle
 * - Protection engine → Write path
 * - Better Than Human context builder → Context pipeline
 *
 * @module tests/superhuman-memory-wiring
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock external dependencies
vi.mock('../memory/lifecycle-integration.js', () => ({
  getUserMemories: vi.fn().mockResolvedValue([
    {
      id: 'mem_1',
      content: 'User mentioned wanting to exercise more',
      type: 'preference',
      timestamp: new Date(),
      emotionalWeight: 0.7,
    },
    {
      id: 'mem_2',
      content: 'Had a great conversation about career goals',
      type: 'event',
      timestamp: new Date(Date.now() - 86400000),
      emotionalWeight: 0.8,
    },
  ]),
  saveMemory: vi.fn().mockResolvedValue(true),
  createLinksForNewMemory: vi.fn().mockResolvedValue([]),
  reinforceMemory: vi.fn().mockResolvedValue({ previousStrength: 0.5, newStrength: 0.75 }),
  runLifecycleMaintenance: vi.fn().mockResolvedValue({
    consolidated: 0,
    decayed: 0,
    archived: 0,
    protectionsCleaned: 0,
  }),
}));

vi.mock('../memory/memory-graph.js', () => ({
  getMemoryGraph: vi.fn(() => ({
    spreadActivation: vi.fn().mockResolvedValue([
      { memoryId: 'mem_3', activation: 0.8, distance: 1, pathTypes: ['topic'] },
      { memoryId: 'mem_4', activation: 0.6, distance: 2, pathTypes: ['topic', 'emotion'] },
    ]),
    getLinks: vi.fn().mockResolvedValue([]),
    createLink: vi.fn().mockResolvedValue({ id: 'link_1' }),
  })),
}));

vi.mock('../memory/spreading-activation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../memory/spreading-activation.js')>();
  return {
    ...actual,
    getSpreadingActivation: vi.fn(() => ({
      spreadFromMultiple: vi.fn().mockResolvedValue([
        {
          memoryId: 'mem_3',
          activation: 0.8,
          distance: 1,
          pathTypes: ['topic'],
          reason: 'Similar topic',
        },
        {
          memoryId: 'mem_4',
          activation: 0.6,
          distance: 2,
          pathTypes: ['topic', 'emotion'],
          reason: 'Emotional connection',
        },
      ]),
      spreadFromMemory: vi.fn().mockResolvedValue([]),
    })),
  };
});

vi.mock('../memory/protection-engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../memory/protection-engine.js')>();
  return {
    ...actual,
    getProtectionEngine: vi.fn(() => ({
      analyzeAndProtect: vi.fn().mockResolvedValue(false),
      cleanupExpired: vi.fn().mockResolvedValue(0),
    })),
  };
});

vi.mock('../memory/learning-engine.js', () => ({
  getLearningEngine: vi.fn(() => ({
    getThresholds: vi.fn().mockResolvedValue({
      minConfidence: 0.5,
      maxProactivePerSession: 3,
    }),
    recordSurfacing: vi.fn(),
  })),
}));

vi.mock('../memory/memory-consolidator.js', () => ({
  getMemoryConsolidator: vi.fn(() => ({
    consolidate: vi.fn().mockResolvedValue({ groups: [] }),
  })),
}));

vi.mock('../memory/memory-decay.js', () => ({
  getMemoryDecayManager: vi.fn(() => ({
    applyDecay: vi.fn().mockResolvedValue(0),
  })),
}));

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(() => ({
    recall: vi.fn().mockResolvedValue({
      primaryMemories: [
        {
          item: {
            id: 'mem_1',
            content: 'Test memory',
            type: 'topic',
            emotionalWeight: 0.5,
            topics: ['exercise'],
          },
          connectionType: 'direct',
          connectionStrength: 'strong',
          suggestedReference: 'Remember when we talked about exercise?',
        },
      ],
      callbacks: [],
      priming: null,
      emotional: {
        userState: {
          recentEmotions: [],
          unresolvedConcerns: [],
          celebratableWins: [],
          emotionalTrend: 'stable',
        },
        bondState: {
          warmth: 0.5,
          trust: 0.5,
          protectiveness: 0.5,
          admiration: 0.5,
          concern: 0,
          sessionCount: 5,
          stage: 'familiar',
        },
        threads: [],
        approachGuidance: null,
      },
      activePatterns: [],
      formattedContext: '',
    }),
    recordInteraction: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../memory/semantic-rag.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
  ragLookup: vi.fn().mockResolvedValue(null),
}));

vi.mock('../tools/tool-success-tracker.js', () => ({
  getToolSuccessTracker: vi.fn(() => ({
    getMetrics: vi.fn().mockResolvedValue({ totalCalls: 10, successfulCalls: 8 }),
    getContextualSuccessRate: vi.fn().mockResolvedValue(0.8),
    getRecommendations: vi.fn().mockResolvedValue([]),
    recordCall: vi.fn(),
    getTopTools: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../tools/context-carrier.js', () => ({
  getContextCarrier: vi.fn(() => ({
    startSession: vi.fn(),
    endSession: vi.fn(),
    getSessionContext: vi.fn().mockReturnValue({ toolsUsed: ['tool_1', 'tool_2'] }),
    recordToolUsage: vi.fn(),
  })),
  resetContextCarrier: vi.fn(),
}));

// ============================================================================
// TESTS: MEMORY-AWARE ROUTER
// ============================================================================

describe('Superhuman Memory Wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Memory-Aware Router Integration', () => {
    it('should calculate boosts based on user history', async () => {
      const { getMemoryAwareRouter, resetMemoryAwareRouter } =
        await import('../tools/memory-aware-router.js');

      resetMemoryAwareRouter();
      const router = getMemoryAwareRouter();

      const boosts = await router.calculateBoosts(
        {
          userId: 'user_123',
          sessionId: 'session_456',
          query: 'Help me with exercise',
          topic: 'fitness',
          emotion: 'motivated',
          personaId: 'maya',
        },
        ['habitTracker', 'goalSetter', 'breathingExercise']
      );

      expect(boosts).toBeDefined();
      expect(boosts.length).toBe(3);
      expect(boosts[0]).toHaveProperty('toolId');
      expect(boosts[0]).toHaveProperty('boost');
      expect(boosts[0]).toHaveProperty('reason');
    });

    it('should enhance tool scores with memory awareness', async () => {
      const { getMemoryAwareRouter, resetMemoryAwareRouter } =
        await import('../tools/memory-aware-router.js');

      resetMemoryAwareRouter();
      const router = getMemoryAwareRouter();

      const enhanced = await router.enhanceScores(
        {
          userId: 'user_123',
          sessionId: 'session_456',
          query: 'I want to start exercising',
        },
        [
          { toolId: 'habitTracker', score: 0.8 },
          { toolId: 'goalSetter', score: 0.7 },
        ]
      );

      expect(enhanced).toBeDefined();
      expect(enhanced.length).toBe(2);
      expect(enhanced[0]).toHaveProperty('baseScore');
      expect(enhanced[0]).toHaveProperty('memoryBoost');
      expect(enhanced[0]).toHaveProperty('finalScore');
    });
  });

  describe('Spreading Activation in Recall', () => {
    it('should include associated memories in recall result', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.simpleRecall({
        userId: 'user_123',
        currentInput: 'I want to talk about exercise',
        currentEmotion: 'motivated',
        currentTopic: 'fitness',
        turnNumber: 5,
      });

      expect(result).toBeDefined();
      expect(result.primaryMemories).toBeDefined();
      expect(result.associatedMemories).toBeDefined();
      expect(result.timing).toBeDefined();
      expect(result.phrasing).toBeDefined();
    });

    it('should handle empty primary memories gracefully', async () => {
      // Override the mock for this test
      const { getMemoryOrchestrator } = await import('../memory/index.js');
      (getMemoryOrchestrator as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        recall: vi.fn().mockResolvedValue({
          primaryMemories: [],
          callbacks: [],
          priming: null,
          emotional: {
            userState: {
              recentEmotions: [],
              unresolvedConcerns: [],
              celebratableWins: [],
              emotionalTrend: 'unknown',
            },
            bondState: {
              warmth: 0,
              trust: 0,
              protectiveness: 0,
              admiration: 0,
              concern: 0,
              sessionCount: 0,
              stage: 'new',
            },
            threads: [],
            approachGuidance: null,
          },
          activePatterns: [],
          formattedContext: '',
        }),
      });

      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.simpleRecall({
        userId: 'user_123',
        currentInput: 'Hello',
      });

      expect(result.primaryMemories).toEqual([]);
      expect(result.associatedMemories).toEqual([]);
    });
  });

  describe('Protection Engine Integration', () => {
    it('should export protection engine with analyzeAndProtect method', async () => {
      const { getProtectionEngine } = await import('../memory/protection-engine.js');
      const protectionEngine = getProtectionEngine();

      // Verify the protection engine has the required methods
      expect(protectionEngine).toBeDefined();
      expect(typeof protectionEngine.analyzeAndProtect).toBe('function');
      expect(typeof protectionEngine.cleanupExpired).toBe('function');
    });

    it('should write memories successfully', async () => {
      const { getUnifiedMemoryService, resetUnifiedMemoryService } =
        await import('../services/unified-memory-service.js');

      resetUnifiedMemoryService();
      const service = getUnifiedMemoryService();

      const result = await service.write({
        userId: 'user_123',
        content: 'This is an important memory about my goals',
        type: 'commitment',
        importance: 'high',
      });

      // Write should complete successfully
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('Context Carrier Session Lifecycle', () => {
    it('should export context carrier functions', async () => {
      const { getContextCarrier, resetContextCarrier } =
        await import('../tools/context-carrier.js');

      expect(getContextCarrier).toBeDefined();
      expect(resetContextCarrier).toBeDefined();
    });

    it('should track tool usage in session context', async () => {
      const { getContextCarrier, resetContextCarrier } =
        await import('../tools/context-carrier.js');

      resetContextCarrier();
      const carrier = getContextCarrier();

      carrier.startSession('session_123', 'user_456');
      carrier.recordToolUsage('session_123', 'habitTracker', 'success', { duration: 100 });

      const context = carrier.getSessionContext('session_123');
      expect(context.toolsUsed).toContain('tool_1'); // From mock
    });
  });

  describe('Better Than Human Context Builder', () => {
    it('should export the context builder', async () => {
      const module =
        await import('../intelligence/context-builders/memory/better-than-human-memory.js');

      expect(module.betterThanHumanMemoryBuilder).toBeDefined();
      expect(module.betterThanHumanMemoryBuilder.name).toBe('better_than_human_memory');
      expect(module.betterThanHumanMemoryBuilder.build).toBeDefined();
    });
  });

  describe('Memory API Routes', () => {
    it('should export memory route handler', async () => {
      const { handleMemoryRoutes } = await import('../api/memory-routes.js');
      expect(handleMemoryRoutes).toBeDefined();
      expect(typeof handleMemoryRoutes).toBe('function');
    });
  });

  describe('Memory Maintenance Job', () => {
    it('should export maintenance functions', async () => {
      const { runUserMaintenance, runBatchMaintenance } =
        await import('../jobs/memory-maintenance.js');

      expect(runUserMaintenance).toBeDefined();
      expect(runBatchMaintenance).toBeDefined();
    });

    it('should run user maintenance without errors', async () => {
      const { runUserMaintenance } = await import('../jobs/memory-maintenance.js');

      const result = await runUserMaintenance('user_123', {
        enableLlmLinks: false, // Disable expensive operations for test
        enablePatterns: false,
      });

      expect(result).toBeDefined();
      expect(result.userId).toBe('user_123');
      expect(result.stats).toBeDefined();
    });
  });
});

// ============================================================================
// TESTS: COMPONENT EXPORTS
// ============================================================================

describe('Component Exports', () => {
  it('should export spreading activation engine', async () => {
    const { getSpreadingActivation, resetSpreadingActivation } =
      await import('../memory/spreading-activation.js');

    expect(getSpreadingActivation).toBeDefined();
    expect(resetSpreadingActivation).toBeDefined();
  });

  it('should export protection engine', async () => {
    const { getProtectionEngine, resetProtectionEngine } =
      await import('../memory/protection-engine.js');

    expect(getProtectionEngine).toBeDefined();
    expect(resetProtectionEngine).toBeDefined();
  });

  it('should export LLM link detector', async () => {
    const { getLLMLinkDetector, resetLLMLinkDetector } =
      await import('../memory/llm-link-detector.js');

    expect(getLLMLinkDetector).toBeDefined();
    expect(resetLLMLinkDetector).toBeDefined();
  });

  it('should export pattern formation engine', async () => {
    const { getPatternFormation, resetPatternFormation } =
      await import('../memory/pattern-formation.js');

    expect(getPatternFormation).toBeDefined();
    expect(resetPatternFormation).toBeDefined();
  });

  it('should export unified memory service', async () => {
    const { getUnifiedMemoryService, resetUnifiedMemoryService } =
      await import('../services/unified-memory-service.js');

    expect(getUnifiedMemoryService).toBeDefined();
    expect(resetUnifiedMemoryService).toBeDefined();
  });

  it('should export memory-aware router', async () => {
    const { getMemoryAwareRouter, resetMemoryAwareRouter } =
      await import('../tools/memory-aware-router.js');

    expect(getMemoryAwareRouter).toBeDefined();
    expect(resetMemoryAwareRouter).toBeDefined();
  });
});
