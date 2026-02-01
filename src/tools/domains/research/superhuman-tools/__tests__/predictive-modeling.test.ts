/**
 * Predictive Modeling Tools Tests
 *
 * Tests for goal prediction, trajectory modeling, and habit survival analysis.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/predictive-modeling.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../firestore-persistence.js', () => ({
  getUserIdFromContext: vi.fn((ctx) => {
    if (!ctx) return null;
    if (typeof ctx === 'object' && 'userId' in ctx) return ctx.userId;
    return null;
  }),
  saveGoalProgress: vi.fn().mockResolvedValue(undefined),
  loadGoalProgress: vi.fn().mockResolvedValue([]),
  saveHabit: vi.fn().mockResolvedValue(undefined),
  loadHabits: vi.fn().mockResolvedValue([]),
  loadDecisions: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { predictiveModelingTools } from '../predictive-modeling.js';
import * as persistence from '../firestore-persistence.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(userId: string = 'test-user-123') {
  // Type as any for test mocks - production code uses proper types
  return { ctx: { userId }, toolCallId: `test-${Date.now()}` } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Predictive Modeling Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Availability
  // --------------------------------------------------------------------------

  describe('Tool Availability', () => {
    it('should export all expected tools', () => {
      expect(predictiveModelingTools).toHaveProperty('recordGoalProgress');
      expect(predictiveModelingTools).toHaveProperty('predictGoalSuccess');
      expect(predictiveModelingTools).toHaveProperty('projectBehavioralTrajectory');
      expect(predictiveModelingTools).toHaveProperty('recordHabit');
      expect(predictiveModelingTools).toHaveProperty('analyzeHabitSurvival');
      expect(predictiveModelingTools).toHaveProperty('analyzeCounterfactual');
      expect(predictiveModelingTools).toHaveProperty('predictLifeEventImpact');
    });
  });

  // --------------------------------------------------------------------------
  // recordGoalProgress
  // --------------------------------------------------------------------------

  describe('recordGoalProgress', () => {
    it('should record goal progress', async () => {
      const result = await predictiveModelingTools.recordGoalProgress.execute(
        {
          goalName: 'Save $10,000',
          currentProgress: 25, // Progress is 0-100%
          notes: 'Good month',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // predictGoalSuccess
  // --------------------------------------------------------------------------

  describe('predictGoalSuccess', () => {
    it('should predict goal success probability', async () => {
      vi.mocked(persistence.loadGoalProgress).mockResolvedValueOnce([
        {
          goalId: 'goal-1',
          userId: 'test-user-123',
          name: 'Test Goal',
          type: 'custom',
          startDate: new Date(),
          currentProgress: 50,
          milestones: [{ date: new Date(), progress: 50 }],
          status: 'active' as const,
        },
      ]);

      const result = await predictiveModelingTools.predictGoalSuccess.execute(
        { goalName: 'Test Goal' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // projectBehavioralTrajectory
  // --------------------------------------------------------------------------

  describe('projectBehavioralTrajectory', () => {
    it('should project behavioral trajectory', async () => {
      // Correct param: domain is an enum
      const result = await predictiveModelingTools.projectBehavioralTrajectory.execute(
        { domain: 'habits' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('trajectory');
    });

    it('should handle different domains', async () => {
      const domains = ['spending', 'goals', 'energy', 'productivity', 'relationships'] as const;

      for (const domain of domains) {
        const result = await predictiveModelingTools.projectBehavioralTrajectory.execute(
          { domain },
          createMockContext()
        );

        expect(result).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // recordHabit
  // --------------------------------------------------------------------------

  describe('recordHabit', () => {
    it('should record habit completion', async () => {
      const result = await predictiveModelingTools.recordHabit.execute(
        {
          habitName: 'Morning meditation',
          completed: true,
          notes: 'Felt great today',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeHabitSurvival
  // --------------------------------------------------------------------------

  describe('analyzeHabitSurvival', () => {
    it('should analyze habit survival', async () => {
      vi.mocked(persistence.loadHabits).mockResolvedValueOnce([
        {
          id: 'h-1',
          name: 'Exercise',
          type: 'health',
          startDate: new Date(),
          streak: 30,
          longestStreak: 45,
          completions: [new Date()],
          breaks: [],
          status: 'active' as const,
        },
      ]);

      const result = await predictiveModelingTools.analyzeHabitSurvival.execute(
        { habitName: 'Exercise' },
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // analyzeCounterfactual
  // --------------------------------------------------------------------------

  describe('analyzeCounterfactual', () => {
    it('should analyze counterfactual scenario', async () => {
      const result = await predictiveModelingTools.analyzeCounterfactual.execute(
        {
          decision: 'Invested in individual stocks',
          alternative: 'Invested in index funds instead',
          domain: 'financial',
          timeframe: '2 years',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // predictLifeEventImpact
  // --------------------------------------------------------------------------

  describe('predictLifeEventImpact', () => {
    it('should predict life event impact', async () => {
      // Correct params: event, eventType (enum), magnitude (enum)
      const result = await predictiveModelingTools.predictLifeEventImpact.execute(
        {
          event: 'Starting a new job at a tech company',
          eventType: 'job_change',
          magnitude: 'major',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle different event types', async () => {
      const result = await predictiveModelingTools.predictLifeEventImpact.execute(
        {
          event: 'Moving to a new city',
          eventType: 'move',
          magnitude: 'moderate',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });
});
