/**
 * Habit Persistence Domain Tools Tests (Maya Santos's Specialty)
 *
 * Tests for superhuman patience for behavior change, compassionate habit coaching.
 *
 * Run with: npx vitest run src/tools/domains/habit-persistence/__tests__/habit-persistence.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
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

vi.mock('../../shared/persistence.js', () => ({
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

vi.mock('../../shared/index.js', () => ({
  trackToolUsage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'maya-santos',
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

// ============================================================================
// TESTS
// ============================================================================

describe('Habit Persistence Domain Tools', () => {
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
    it('should load all habit persistence tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      expect(toolDefinitions.length).toBe(10); // Updated: 10 tools now defined
    });

    it('should have correct domain for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.domain).toBe('habit-persistence');
      }
    });

    it('should include all expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('gentleAccountability');
      expect(toolIds).toContain('compassionateReset');
      expect(toolIds).toContain('celebrateTinyWin');
      expect(toolIds).toContain('identifyResistance');
      expect(toolIds).toContain('findSustainablePace');
      expect(toolIds).toContain('behaviorArchitecture');
    });
  });

  // --------------------------------------------------------------------------
  // gentleAccountability Tool
  // --------------------------------------------------------------------------

  describe('gentleAccountability', () => {
    it('should celebrate on-track status', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'gentleAccountability');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        habit: 'daily meditation',
        status: 'on-track',
      });

      expect(result).toContain("You're doing it");
      expect(result).toContain('showing up');
      expect(result).toContain('Proud of you');
    });

    it('should handle struggling without shame', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'gentleAccountability');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        habit: 'exercise 3x per week',
        status: 'struggling',
        struggle: 'Work has been insane and I have no energy',
      });

      expect(result).toContain('Struggling');
      expect(result).toContain("That's okay");
      expect(result).toContain("isn't failing");
      expect(result).toContain('adjusting');
    });

    it('should handle slips compassionately', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'gentleAccountability');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        habit: 'no alcohol',
        status: 'slipped',
      });

      expect(result).toContain('slipped');
      expect(result).toContain('slip is not a slide');
      expect(result).toContain('picking back up');
    });

    it('should address abandoned habits without judgment', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'gentleAccountability');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        habit: 'journaling every night',
        status: 'abandoned',
      });

      expect(result).toContain('fell off');
      expect(result).toContain('not judging');
      expect(result).toContain('What do YOU want');
    });

    it('should encourage restarting', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'gentleAccountability');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        habit: 'morning runs',
        status: 'restarting',
      });

      expect(result).toContain('Restarting');
      expect(result).toContain('brave');
      expect(result).toContain('doing this together');
    });
  });

  // --------------------------------------------------------------------------
  // compassionateReset Tool
  // --------------------------------------------------------------------------

  describe('compassionateReset', () => {
    it('should address inner critic messages', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'compassionateReset');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        whatFellOff: 'my diet',
        howLong: 'two weeks',
        innerCriticSaying: "You have no willpower, you'll never change",
      });

      expect(result).toContain('Compassionate Reset');
      expect(result).toContain('inner critic');
      expect(result).toContain("That's not true");
      expect(result).toContain('shame talking');
    });

    it('should emphasize not starting from zero', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'compassionateReset');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        whatFellOff: 'gym routine',
        howLong: 'a month',
      });

      expect(result).toContain('not starting from zero');
      expect(result).toContain('love yourself into it');
    });
  });

  // --------------------------------------------------------------------------
  // celebrateTinyWin Tool
  // --------------------------------------------------------------------------

  describe('celebrateTinyWin', () => {
    it('should celebrate when they are minimizing', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'celebrateTinyWin');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        win: 'drank 8 glasses of water',
        theyreMinimizing: true,
      });

      expect(result).toContain("don't skip past this");
      expect(result).toContain('Stop');
    });

    it('should celebrate streaks with identity framing', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'celebrateTinyWin');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        win: 'made my bed again',
        theyreMinimizing: false,
        streakLength: 14,
      });

      expect(result).toContain('Tiny Win');
      expect(result).toContain('14 days');
      expect(result).toContain('identity forming');
    });
  });

  // --------------------------------------------------------------------------
  // identifyResistance Tool
  // --------------------------------------------------------------------------

  describe('identifyResistance', () => {
    it('should explore sources of resistance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'identifyResistance');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        wantedChange: 'be more assertive at work',
        resistanceLooksLike: 'I keep finding excuses not to speak up in meetings',
        hypothesis: "Maybe I'm afraid of being seen as aggressive",
      });

      expect(result).toContain('Understanding Your Resistance');
      expect(result).toContain('protective');
      expect(result).toContain('Fear of failure');
      expect(result).toContain('Fear of success');
    });

    it('should work without hypothesis', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'identifyResistance');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        wantedChange: 'save more money',
        resistanceLooksLike: 'I always find something to spend on',
      });

      expect(result).toContain('Resistance');
      expect(result).not.toContain('undefined');
    });
  });

  // --------------------------------------------------------------------------
  // findSustainablePace Tool
  // --------------------------------------------------------------------------

  describe('findSustainablePace', () => {
    it('should address too-fast pace', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'findSustainablePace');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        goal: 'lose 30 pounds',
        currentPace: 'too-fast',
        energyLevel: 'depleted',
      });

      expect(result).toContain('Sustainable Pace');
      expect(result).toContain('too fast');
      expect(result).toContain('urgency');
      expect(result).toContain('energy level');
    });

    it('should address inconsistent pace', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'findSustainablePace');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        goal: 'learn Spanish',
        currentPace: 'inconsistent',
      });

      expect(result).toContain('inconsistent');
      expect(result).toContain('Consistency beats intensity');
    });
  });

  // --------------------------------------------------------------------------
  // behaviorArchitecture Tool
  // --------------------------------------------------------------------------

  describe('behaviorArchitecture', () => {
    it('should design home environment changes', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'behaviorArchitecture');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        behavior: 'reading before bed instead of scrolling',
        currentObstacles: 'Phone is always on my nightstand',
        environmentType: 'home',
      });

      expect(result).toContain('Behavior Architecture');
      expect(result).toContain('Reduce friction');
      expect(result).toContain('Add friction');
      expect(result).toContain('Home environment');
    });

    it('should address digital environments', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'behaviorArchitecture');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        behavior: 'checking email only twice a day',
        currentObstacles: 'Notifications constantly pull me back',
        environmentType: 'digital',
      });

      expect(result).toContain('Digital environment');
      expect(result).toContain('app blockers');
    });
  });

  // --------------------------------------------------------------------------
  // Content Quality
  // --------------------------------------------------------------------------

  describe('Content Quality', () => {
    it('should not contain placeholder text in outputs', async () => {
      for (const def of toolDefinitions) {
        const tool = def.create(mockContext);
        const result = await tool.execute({
          habit: 'test habit',
          status: 'on-track',
          whatFellOff: 'test habit',
          win: 'test win',
          wantedChange: 'test change',
          resistanceLooksLike: 'test resistance',
          goal: 'test goal',
          currentPace: 'inconsistent',
          behavior: 'test behavior',
          currentObstacles: 'test obstacles',
          environmentType: 'home',
        });

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
        expect(resultStr).not.toContain('[object Object]');
      }
    });
  });
});
