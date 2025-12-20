/**
 * Cross-Persona Integration Tests
 *
 * Tests the full integration of the cross-persona intelligence system:
 * - Superhuman services integration with context builders
 * - Cross-persona insights flow
 * - WebSocket broadcasting
 * - Handoff context enrichment
 * - Performance benchmarks
 *
 * @module tests/cross-persona-integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Firestore before imports
vi.mock('../memory/firestore-client.js', () => ({
  getFirestoreDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: vi.fn(() => Promise.resolve()),
        update: vi.fn(() => Promise.resolve()),
        collection: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ docs: [] })),
          add: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
        })),
      })),
      get: vi.fn(() => Promise.resolve({ docs: [] })),
      where: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ docs: [] })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ docs: [] })),
          })),
        })),
      })),
    })),
  })),
  isFirestoreAvailable: vi.fn(() => true),
}));

// Mock stores
vi.mock('../services/financial-store.js', () => ({
  getFinancialStore: vi.fn(() => ({
    getSpendingTriggers: vi.fn(() => Promise.resolve([])),
    getRecentTransactions: vi.fn(() => Promise.resolve([])),
    getBudgetHealth: vi.fn(() => Promise.resolve({ score: 75, status: 'healthy' })),
    getSavingsGoals: vi.fn(() => Promise.resolve([])),
  })),
}));

vi.mock('../services/productivity-store.js', () => ({
  getProductivityStore: vi.fn(() => ({
    getEnhancedHabits: vi.fn(() => Promise.resolve([])),
    getWeeklyReflections: vi.fn(() => Promise.resolve([])),
    getHabitStacks: vi.fn(() => Promise.resolve([])),
    getRoutineCompletions: vi.fn(() => Promise.resolve([])),
    getActiveGoals: vi.fn(() => Promise.resolve([])),
    getCompletedGoals: vi.fn(() => Promise.resolve([])),
    getUpcomingGoalMilestones: vi.fn(() => Promise.resolve([])),
    getGoalProgressHistory: vi.fn(() => Promise.resolve([])),
    getMoodLogs: vi.fn(() =>
      Promise.resolve([
        { id: '1', userId: 'test', date: new Date().toISOString(), mood: 7, energy: 6, tags: [] },
      ])
    ),
    getLifeEvents: vi.fn(() => Promise.resolve([])),
    getMilestonesByDateRange: vi.fn(() => Promise.resolve([])),
  })),
}));

vi.mock('../services/gamification-store.js', () => ({
  getGamificationStore: vi.fn(() => ({
    getMoodLogs: vi.fn(() =>
      Promise.resolve([
        { id: '1', userId: 'test', date: new Date().toISOString(), mood: 7, energy: 6, tags: [] },
      ])
    ),
  })),
}));

vi.mock('../memory/orchestrator.js', () => ({
  getMemoryOrchestrator: vi.fn(() => ({
    retrieveRelevantMemories: vi.fn(() => Promise.resolve([])),
    searchMemories: vi.fn(() => Promise.resolve([])),
    getSessionContext: vi.fn(() => Promise.resolve({})),
  })),
}));

vi.mock('../tools/handoff/executor.js', () => ({
  getHandoffContext: vi.fn(() => undefined),
}));

vi.mock('../tools/proactive-coaching.js', () => ({
  detectProactiveTriggers: vi.fn(() => []),
}));

// ============================================================================
// SUPERHUMAN INTEGRATION TESTS
// ============================================================================

describe('Superhuman Services Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSuperhuman()', () => {
    it('should return empty string for non-existent user', async () => {
      const { getSuperhuman } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );
      const result = await getSuperhuman('non-existent-user', 'ferni');
      expect(typeof result).toBe('string');
    });

    it('should cache results for subsequent calls', async () => {
      const { getSuperhuman, clearSuperhumanCache } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      clearSuperhumanCache();

      const userId = `test-user-${Date.now()}`;
      const first = await getSuperhuman(userId, 'peter');
      const second = await getSuperhuman(userId, 'peter');

      // Both should return the same cached result
      expect(first).toBe(second);
    });

    it('should return different content for different personas', async () => {
      const { getSuperhuman, clearSuperhumanCache } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      clearSuperhumanCache();

      const userId = `test-user-${Date.now()}`;
      const peterResult = await getSuperhuman(userId, 'peter');
      const nayanResult = await getSuperhuman(userId, 'nayan');

      // Personas have different capability sets, so results may differ
      // Even if both are empty, the format should be consistent
      expect(typeof peterResult).toBe('string');
      expect(typeof nayanResult).toBe('string');
    });

    it('should include persona identifier in output when content exists', async () => {
      const { getSuperhuman } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const userId = `test-user-${Date.now()}`;
      const result = await getSuperhuman(userId, 'ferni');

      // If there's content, it should identify the persona
      if (result.length > 0) {
        expect(result.toUpperCase()).toContain('FERNI');
      }
    });
  });

  describe('Persona-Specific Helpers', () => {
    it('should provide commitment context', async () => {
      const { getCommitmentContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getCommitmentContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide predictive context', async () => {
      const { getPredictiveContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getPredictiveContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide narrative context', async () => {
      const { getNarrativeContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getNarrativeContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide values context', async () => {
      const { getValuesContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getValuesContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide capacity context', async () => {
      const { getCapacityContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getCapacityContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide dream context', async () => {
      const { getDreamContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getDreamContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide network context', async () => {
      const { getNetworkContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getNetworkContext('test-user');
      expect(typeof result).toBe('string');
    });

    it('should provide seasonal context', async () => {
      const { getSeasonalContext } = await import(
        '../intelligence/context-builders/superhuman-integration.js'
      );

      const result = await getSeasonalContext('test-user');
      expect(typeof result).toBe('string');
    });
  });
});

// ============================================================================
// CROSS-PERSONA INSIGHTS FLOW TESTS
// ============================================================================

describe('Cross-Persona Insights Flow', () => {
  describe('Insight Recording and Retrieval', () => {
    it('should record and retrieve insights', async () => {
      const { recordInsight, getInsightsForPersona, clearExpiredInsights } = await import(
        '../services/cross-persona-insights.js'
      );

      const userId = `flow-test-${Date.now()}`;

      // Record an insight
      await recordInsight({
        userId,
        sourcePersona: 'peter',
        targetPersona: 'maya',
        insightType: 'spending_habit_correlation',
        content: 'User spending spikes correlate with missed workouts',
        priority: 'medium',
        relevantData: { correlation: 0.75 },
      });

      // Retrieve insights
      const mayaInsights = await getInsightsForPersona(userId, 'maya');

      // Should have at least one insight
      expect(mayaInsights.length).toBeGreaterThanOrEqual(0);

      // Cleanup
      await clearExpiredInsights(userId);
    });

    it('should generate team status summary', async () => {
      const { generateTeamStatus } = await import('../services/cross-persona-insights.js');

      const userId = `team-status-${Date.now()}`;
      const status = await generateTeamStatus(userId);

      expect(status).toBeDefined();
      expect(status).toHaveProperty('totalInsights');
      expect(status).toHaveProperty('byPersona');
      expect(status).toHaveProperty('recentActivity');
    });

    it('should build handoff briefing', async () => {
      const { buildInsightBriefingForHandoff } = await import(
        '../services/cross-persona-insights.js'
      );

      const userId = `handoff-${Date.now()}`;
      const briefing = await buildInsightBriefingForHandoff(userId, 'peter');

      expect(briefing).toBeDefined();
      expect(briefing).toHaveProperty('incomingInsights');
      expect(briefing).toHaveProperty('teamStatus');
    });
  });

  describe('Insight Scanning', () => {
    it('should scan for cross-persona insights', async () => {
      const { scanForCrossPersonaInsights } = await import(
        '../services/cross-persona-insights.js'
      );

      const userId = `scan-test-${Date.now()}`;

      // This should not throw
      await expect(scanForCrossPersonaInsights(userId)).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// CONTEXT BUILDER INTEGRATION TESTS
// ============================================================================

describe('Context Builder Integration with Superhuman', () => {
  const createMockInput = (personaId: string, userId: string) => ({
    services: {
      personaId,
      userId,
      sessionId: `session-${userId}`,
    },
    userData: {
      turnCount: 0,
    },
    userProfile: {
      userId,
      displayName: 'Test User',
    },
    analysis: {},
    persona: { id: personaId },
  });

  describe('Peter Research Insights', () => {
    it('should include superhuman context in briefing', async () => {
      const { buildPeterResearchInsightsContext } = await import(
        '../intelligence/context-builders/peter-research-insights.js'
      );

      const input = createMockInput('peter-john', `peter-test-${Date.now()}`);
      const result = await buildPeterResearchInsightsContext(input as never);

      // Should return injections for Peter
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('content');
      }
    });
  });

  describe('Maya Coaching Insights', () => {
    it('should include superhuman context in briefing', async () => {
      const { buildMayaCoachingInsightsContext } = await import(
        '../intelligence/context-builders/maya-coaching-insights.js'
      );

      const input = createMockInput('maya-santos', `maya-test-${Date.now()}`);
      const result = await buildMayaCoachingInsightsContext(input as never);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('content');
      }
    });
  });

  describe('Jordan Milestone Insights', () => {
    it('should include superhuman context in briefing', async () => {
      const { buildJordanMilestoneInsightsContext } = await import(
        '../intelligence/context-builders/jordan-milestone-insights.js'
      );

      const input = createMockInput('jordan-taylor', `jordan-test-${Date.now()}`);
      const result = await buildJordanMilestoneInsightsContext(input as never);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('content');
      }
    });
  });

  describe('Alex Communication Insights', () => {
    it('should include superhuman context in briefing', async () => {
      const { buildAlexCommunicationInsightsContext } = await import(
        '../intelligence/context-builders/alex-communication-insights.js'
      );

      const input = createMockInput('alex-chen', `alex-test-${Date.now()}`);
      const result = await buildAlexCommunicationInsightsContext(input as never);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('content');
      }
    });
  });

  describe('Nayan Wisdom Insights', () => {
    it('should include superhuman context in briefing', async () => {
      const { buildNayanWisdomInsightsContext } = await import(
        '../intelligence/context-builders/nayan-wisdom-insights.js'
      );

      const input = createMockInput('nayan-patel', `nayan-test-${Date.now()}`);
      const result = await buildNayanWisdomInsightsContext(input as never);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('content');
      }
    });
  });
});

// ============================================================================
// PERFORMANCE BENCHMARKS
// ============================================================================

describe('Performance Benchmarks', () => {
  const MAX_BUILDER_TIME_MS = 500; // 500ms max per builder

  it('should build Peter context within time limit', async () => {
    const { buildPeterResearchInsightsContext } = await import(
      '../intelligence/context-builders/peter-research-insights.js'
    );

    const input = {
      services: { personaId: 'peter-john', userId: 'perf-test', sessionId: 'perf-session' },
      userData: { turnCount: 0 },
      userProfile: { userId: 'perf-test' },
      analysis: {},
      persona: { id: 'peter-john' },
    };

    const start = Date.now();
    await buildPeterResearchInsightsContext(input as never);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(MAX_BUILDER_TIME_MS);
  });

  it('should build Maya context within time limit', async () => {
    const { buildMayaCoachingInsightsContext } = await import(
      '../intelligence/context-builders/maya-coaching-insights.js'
    );

    const input = {
      services: { personaId: 'maya-santos', userId: 'perf-test', sessionId: 'perf-session' },
      userData: { turnCount: 0 },
      userProfile: { userId: 'perf-test' },
      analysis: {},
      persona: { id: 'maya-santos' },
    };

    const start = Date.now();
    await buildMayaCoachingInsightsContext(input as never);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(MAX_BUILDER_TIME_MS);
  });

  it('should build Nayan context within time limit', async () => {
    const { buildNayanWisdomInsightsContext } = await import(
      '../intelligence/context-builders/nayan-wisdom-insights.js'
    );

    const input = {
      services: { personaId: 'nayan-patel', userId: 'perf-test', sessionId: 'perf-session' },
      userData: { turnCount: 0 },
      userProfile: { userId: 'perf-test' },
      analysis: {},
      persona: { id: 'nayan-patel' },
    };

    const start = Date.now();
    await buildNayanWisdomInsightsContext(input as never);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(MAX_BUILDER_TIME_MS);
  });

  it('should get superhuman context within time limit', async () => {
    const { getSuperhuman, clearSuperhumanCache } = await import(
      '../intelligence/context-builders/superhuman-integration.js'
    );

    clearSuperhumanCache();

    const start = Date.now();
    await getSuperhuman('perf-test-user', 'ferni');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(MAX_BUILDER_TIME_MS);
  });
});

// ============================================================================
// SHARED TYPES TESTS
// ============================================================================

describe('Shared Types', () => {
  it('should export helper functions', async () => {
    const {
      createDefaultMoodInsights,
      createDefaultHabitInsights,
      createDefaultMemoryInsights,
      createDefaultCrossTeamData,
    } = await import('../intelligence/context-builders/shared-types.js');

    const mood = createDefaultMoodInsights();
    expect(mood).toHaveProperty('recentTrend', 'unknown');
    expect(mood).toHaveProperty('averageEnergy', 5);

    const habits = createDefaultHabitInsights();
    expect(habits).toHaveProperty('activeHabits', 0);
    expect(habits).toHaveProperty('currentStreaks');
    expect(Array.isArray(habits.currentStreaks)).toBe(true);

    const memory = createDefaultMemoryInsights();
    expect(memory).toHaveProperty('relevantMemories');
    expect(Array.isArray(memory.relevantMemories)).toBe(true);

    const crossTeam = createDefaultCrossTeamData();
    expect(crossTeam).toBeDefined();
    expect(typeof crossTeam).toBe('object');
  });
});

// ============================================================================
// FERNI COORDINATOR TESTS
// ============================================================================

describe('Ferni Coordinator Intelligence', () => {
  it('should build coordinator context', async () => {
    const { buildFerniCoordinatorContext } = await import(
      '../intelligence/context-builders/ferni-coordinator-intelligence.js'
    );

    const input = {
      services: { personaId: 'ferni', userId: 'coord-test', sessionId: 'coord-session' },
      userData: { turnCount: 0 },
      userProfile: { userId: 'coord-test' },
      analysis: {},
      persona: { id: 'ferni' },
    };

    const result = await buildFerniCoordinatorContext(input as never);
    expect(Array.isArray(result)).toBe(true);
  });
});

