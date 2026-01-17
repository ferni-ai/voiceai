/**
 * Coaching Support Domain Tests
 *
 * Tests for 22 coaching tools covering:
 * - Motivation & Discipline
 * - Boundaries & Communication
 * - Self-Compassion
 * - Burnout & Energy
 * - Family Support
 * - Specialized Coaching
 * - Relationship Support
 * - Support System
 *
 * Run: pnpm vitest run src/tools/domains/coaching-support/__tests__/coaching-support.test.ts
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
  safeLog: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ============================================================================
// IMPORTS
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(agentId = 'ferni'): ToolContext {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-123',
    agentId,
    agentDisplayName: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

function assertNoPlaceholders(result: string): void {
  const placeholders = ['TODO', 'FIXME', 'placeholder', '[object Object]'];
  for (const placeholder of placeholders) {
    expect(result).not.toContain(placeholder);
  }
}

function assertHasContent(result: string, minLength = 100): void {
  expect(result.length).toBeGreaterThan(minLength);
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Coaching Support Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let ctx: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    ctx = createMockContext();

    const module = await import('../index.js');
    toolDefinitions = await module.getToolDefinitions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Domain Loading
  // --------------------------------------------------------------------------

  describe('Domain Loading', () => {
    it('should load all 22 coaching support tools', async () => {
      expect(toolDefinitions.length).toBe(22);
    });

    it('should have all tools in self-compassion domain', async () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('self-compassion');
      }
    });

    it('should include expected tool IDs', async () => {
      const expectedIds = [
        'motivationCoaching',
        'disciplineStrategy',
        'procrastinationSupport',
        'boundaryCoaching',
        'communicationStrategy',
        'conflictResolution',
        'selfCompassionCoaching',
        'affirmWorth',
        'addressPerfectionism',
        'burnoutCoaching',
        'restoreEnergy',
        'parentingSupport',
        'elderCareSupport',
        'habitCoaching',
        'sleepSupport',
        'angerCoaching',
        'breakupSupport',
        'datingAdvice',
        'datingAppStrategy',
        'buildSupportSystem',
        'authenticLiving',
        'wellnessCheckin',
      ];

      const actualIds = toolDefinitions.map((t) => t.id);
      for (const id of expectedIds) {
        expect(actualIds).toContain(id);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Motivation & Discipline Tools
  // --------------------------------------------------------------------------

  describe('Motivation & Discipline Tools', () => {
    it('motivationCoaching - should provide motivation strategies', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'motivationCoaching');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ area: 'exercise', currentState: 'stuck' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      assertHasContent(resultStr);
      expect(resultStr).toContain('Motivation');
      expect(resultStr).toContain('stuck');
    });

    it('disciplineStrategy - should provide discipline framework', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'disciplineStrategy');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ area: 'work', challenge: 'staying focused' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Discipline');
      expect(resultStr).toContain('Reduce Friction');
    });

    it('procrastinationSupport - should address procrastination patterns', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'procrastinationSupport');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ task: 'filing taxes', reason: 'overwhelmed' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Procrastination');
      expect(resultStr).toContain('2-Minute');
    });
  });

  // --------------------------------------------------------------------------
  // Boundaries & Communication Tools
  // --------------------------------------------------------------------------

  describe('Boundaries & Communication Tools', () => {
    it('boundaryCoaching - should help set boundaries', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'boundaryCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ relationship: 'coworker', situation: 'constant interruptions' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Boundary');
      expect(resultStr).toContain('Communicate');
    });

    it('communicationStrategy - should develop communication approaches', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'communicationStrategy');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ context: 'work meeting', challenge: 'speaking up' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Communication');
      expect(resultStr).toContain('Listen');
    });

    it('conflictResolution - should navigate conflicts', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'conflictResolution');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ parties: 'partner', issue: 'household chores' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Conflict');
      expect(resultStr).toContain('Common Ground');
    });
  });

  // --------------------------------------------------------------------------
  // Self-Compassion Tools
  // --------------------------------------------------------------------------

  describe('Self-Compassion Tools', () => {
    it('selfCompassionCoaching - should guide self-compassion practice', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'selfCompassionCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({
        situation: 'made a mistake at work',
        innerCritic: "I'm so stupid",
      });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Self-Compassion');
      expect(resultStr).toContain('Self-Kindness');
      expect(resultStr).toContain('Common Humanity');
    });

    it('affirmWorth - should affirm inherent worth', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'affirmWorth');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ struggle: 'not feeling good enough' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Worth');
      expect(resultStr).toContain('Inherent');
    });

    it('addressPerfectionism - should work with perfectionist patterns', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'addressPerfectionism');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ area: 'work presentations' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Perfectionism');
      expect(resultStr).toContain('Good Enough');
    });
  });

  // --------------------------------------------------------------------------
  // Burnout & Energy Tools
  // --------------------------------------------------------------------------

  describe('Burnout & Energy Tools', () => {
    it('burnoutCoaching - should support burnout recovery (severe)', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'burnoutCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ severity: 'severe', mainSymptom: 'exhaustion' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Burnout');
      expect(resultStr).toContain('Exhaustion');
      // Should include healthcare recommendation for severe
      expect(resultStr).toContain('healthcare');
    });

    it('burnoutCoaching - should handle early signs', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'burnoutCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ severity: 'early-signs' });

      const resultStr = String(result);
      expect(resultStr).toContain('Early');
      expect(resultStr).toContain('boundaries');
    });

    it('restoreEnergy - should provide restoration strategies', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'restoreEnergy');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ energyLevel: 'depleted', timeAvailable: '30 minutes' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Energy');
      expect(resultStr).toContain('Quick Wins');
    });
  });

  // --------------------------------------------------------------------------
  // Family Support Tools
  // --------------------------------------------------------------------------

  describe('Family Support Tools', () => {
    it('parentingSupport - should provide parenting guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'parentingSupport');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ childAge: '7', challenge: 'tantrums' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Parenting');
      expect(resultStr).toContain('Connection');
    });

    it('elderCareSupport - should support caregivers', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'elderCareSupport');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ situation: 'mom has dementia', challenge: 'guilt' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Elder Care');
      expect(resultStr).toContain('Caregiver');
    });
  });

  // --------------------------------------------------------------------------
  // Specialized Coaching Tools
  // --------------------------------------------------------------------------

  describe('Specialized Coaching Tools', () => {
    it('habitCoaching - should coach habit building', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'habitCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ habitType: 'build', habit: 'morning exercise' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Habit');
      expect(resultStr).toContain('Cue');
      expect(resultStr).toContain('Start Tiny');
    });

    it('habitCoaching - should coach habit breaking', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'habitCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ habitType: 'break', habit: 'doom scrolling' });

      const resultStr = String(result);
      expect(resultStr).toContain('Breaking');
      expect(resultStr).toContain('Friction');
    });

    it('sleepSupport - should provide sleep improvement', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'sleepSupport');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ issue: 'racing thoughts', currentPattern: 'midnight to 6am' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Sleep');
      expect(resultStr).toContain('Schedule');
    });

    it('angerCoaching - should address anger management', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'angerCoaching');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ trigger: 'traffic', frequency: 'frequent' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Anger');
      expect(resultStr).toContain('Iceberg');
    });
  });

  // --------------------------------------------------------------------------
  // Relationship Support Tools
  // --------------------------------------------------------------------------

  describe('Relationship Support Tools', () => {
    it('breakupSupport - should support through breakup', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'breakupSupport');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ timeframe: '2 weeks', initiated: 'them' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Breakup');
      expect(resultStr).toContain('grief');
    });

    it('datingAdvice - should provide dating guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingAdvice');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ situation: 'first date', concern: 'nervous' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Dating');
      expect(resultStr).toContain('Authentically');
    });

    it('datingAppStrategy - should optimize dating apps', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingAppStrategy');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ app: 'Hinge', challenge: 'no matches' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Profile');
      expect(resultStr).toContain('Photos');
    });
  });

  // --------------------------------------------------------------------------
  // Support System Tools
  // --------------------------------------------------------------------------

  describe('Support System Tools', () => {
    it('buildSupportSystem - should help build connections', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'buildSupportSystem');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ currentState: 'isolated', need: 'emotional support' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Support System');
      expect(resultStr).toContain('Emotional Support');
    });

    it('authenticLiving - should guide authentic living', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'authenticLiving');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ challenge: 'people pleasing' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Authentic');
      expect(resultStr).toContain('Values');
    });

    it('wellnessCheckin - should conduct full wellness check', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'wellnessCheckin');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ focus: 'full' });

      const resultStr = String(result);
      assertNoPlaceholders(resultStr);
      expect(resultStr).toContain('Physical');
      expect(resultStr).toContain('Mental');
      expect(resultStr).toContain('Social');
    });

    it('wellnessCheckin - should focus on specific area', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'wellnessCheckin');
      const tool = toolDef!.create(ctx);
      const result = await tool.execute({ focus: 'mental' });

      const resultStr = String(result);
      expect(resultStr).toContain('Mental');
      expect(resultStr).toContain('mood');
    });
  });

  // --------------------------------------------------------------------------
  // Content Quality Checks
  // --------------------------------------------------------------------------

  describe('Content Quality', () => {
    it('all tools should produce non-empty responses', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(ctx);
        const result = await tool.execute({});
        const resultStr = String(result);
        expect(resultStr.length).toBeGreaterThan(50);
      }
    });

    it('all tools should have no placeholder text', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(ctx);
        const result = await tool.execute({});
        assertNoPlaceholders(String(result));
      }
    });

    it('all tools should have descriptions', async () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.description).toBeDefined();
        expect(toolDef.description.length).toBeGreaterThan(10);
      }
    });

    it('all tools should have tags', async () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toBeDefined();
        expect(toolDef.tags!.length).toBeGreaterThan(0);
      }
    });
  });
});
