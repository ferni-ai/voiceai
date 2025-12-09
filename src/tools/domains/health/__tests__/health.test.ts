/**
 * Health Domain Tools Tests
 *
 * Tests for exercise tracking, nutrition coaching, sleep guidance, and health tools.
 *
 * Run with: npx vitest run src/tools/domains/health/__tests__/health.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock safe-logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock @livekit/agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock persistence
vi.mock('../../shared/persistence.js', () => ({
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

// Mock analytics
vi.mock('../../shared/index.js', () => ({
  trackToolUsage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { getToolDefinitions } from '../index.js';
import type { ToolDefinition, ToolContext } from '../../../registry/types.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'maya',
    agentDisplayName: 'Maya',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

// Helper to execute tools that need the second context argument
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function executeWithContext(
  tool: { execute: (params: Record<string, unknown>, context: { ctx: ToolContext }) => any },
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  return tool.execute(params, { ctx }) as Promise<string>;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Health Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Loading
  // --------------------------------------------------------------------------

  describe('Tool Loading', () => {
    it('should load all health tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have logExercise tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'logExercise');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('health');
    });

    it('should have suggestWorkout tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'suggestWorkout');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('health');
    });

    it('should have trackFitnessGoal tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'trackFitnessGoal');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('health');
    });

    it('should have coachOnNutrition tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'coachOnNutrition');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('health');
    });

    it('should have analyzeSleepPattern tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'analyzeSleepPattern');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('health');
    });
  });

  // --------------------------------------------------------------------------
  // Exercise Tools
  // --------------------------------------------------------------------------

  describe('logExercise', () => {
    it('should log cardio exercise', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logExercise');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          activityType: 'cardio',
          activityName: 'Running',
          durationMinutes: 30,
          intensity: 'moderate',
        },
        mockContext
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('Exercise Logged');
      expect(result).toContain('Running');
      expect(result).toContain('30 minutes');
    });

    it('should log strength exercise', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logExercise');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          activityType: 'strength',
          durationMinutes: 45,
          intensity: 'vigorous',
        },
        mockContext
      );

      expect(result).toContain('Exercise Logged');
      expect(result).toContain('strength');
    });

    it('should include calorie estimate when intensity is provided', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logExercise');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          activityType: 'cardio',
          durationMinutes: 30,
          intensity: 'moderate',
        },
        mockContext
      );

      expect(result).toContain('calorie');
    });

    it('should include how they feel when provided', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logExercise');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          activityType: 'yoga',
          durationMinutes: 60,
          howTheyFeel: 'Relaxed and centered',
        },
        mockContext
      );

      expect(result).toContain('Relaxed and centered');
    });
  });

  // --------------------------------------------------------------------------
  // Workout Suggestions
  // --------------------------------------------------------------------------

  describe('suggestWorkout', () => {
    it('should suggest workout for low energy', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'suggestWorkout');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        energyLevel: 'low',
        availableMinutes: 20,
        preference: 'any',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(50);
    });

    it('should suggest workout for high energy', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'suggestWorkout');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        energyLevel: 'high',
        availableMinutes: 45,
        preference: 'cardio',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Fitness Goals
  // --------------------------------------------------------------------------

  describe('trackFitnessGoal', () => {
    it('should help set a fitness goal', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackFitnessGoal');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'set',
          goalType: 'exercise-frequency',
          goalDescription: 'Exercise 3 times per week',
        },
        mockContext
      );

      expect(result).toContain('Goal');
      expect(result).toContain('Exercise 3 times per week');
    });

    it('should celebrate goal achievement', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackFitnessGoal');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'celebrate',
          goalDescription: 'Run a 5K',
        },
        mockContext
      );

      expect(result).toContain('Achievement');
    });

    it('should check goal progress', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackFitnessGoal');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'check',
          currentProgress: 'Completed 2 of 3 workouts this week',
        },
        mockContext
      );

      expect(result).toContain('Progress');
    });
  });

  // --------------------------------------------------------------------------
  // Nutrition
  // --------------------------------------------------------------------------

  describe('coachOnNutrition', () => {
    it('should provide general nutrition guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachOnNutrition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        topic: 'general-eating',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should provide hydration guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachOnNutrition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        topic: 'hydration',
      });

      expect(
        result.toLowerCase().includes('water') || result.toLowerCase().includes('hydrat')
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Sleep
  // --------------------------------------------------------------------------

  describe('analyzeSleepPattern', () => {
    it('should analyze sleep pattern', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'analyzeSleepPattern');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        concern: 'trouble-falling-asleep',
        averageHours: 6,
        wakingPattern: 'multiple-times',
      });

      expect(result).toBeDefined();
      expect(result).toContain('sleep');
    });
  });

  describe('suggestSleepHygiene', () => {
    it('should suggest sleep hygiene improvements', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'suggestSleepHygiene');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        area: 'environment',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(50);
    });
  });

  // --------------------------------------------------------------------------
  // Health Tracking
  // --------------------------------------------------------------------------

  describe('logSymptom', () => {
    it('should log a symptom', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logSymptom');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        symptom: 'Headache',
        severity: 'moderate',
        context: 'Started after staring at screen',
      });

      expect(result).toBeDefined();
      expect(result).toContain('Headache');
    });
  });

  // --------------------------------------------------------------------------
  // Energy
  // --------------------------------------------------------------------------

  describe('assessEnergyLevel', () => {
    it('should assess energy level', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'assessEnergyLevel');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        currentLevel: 'low',
        timeOfDay: 'afternoon',
        recentSleep: 'poor',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // No Placeholder Content
  // --------------------------------------------------------------------------

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logExercise');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          activityType: 'cardio',
          durationMinutes: 30,
        },
        mockContext
      );

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });

    it('should include encouraging messaging', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'logExercise');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          activityType: 'strength',
          durationMinutes: 45,
        },
        mockContext
      );

      // Should have positive/encouraging language
      expect(result.length).toBeGreaterThan(100);
    });
  });
});
