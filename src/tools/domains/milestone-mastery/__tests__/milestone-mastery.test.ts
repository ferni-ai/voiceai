/**
 * Milestone Mastery Domain Tools Tests (Jordan Taylor's Specialty)
 *
 * Tests for superhuman celebration, event anticipation, and life milestone navigation.
 *
 * Run with: npx vitest run src/tools/domains/milestone-mastery/__tests__/milestone-mastery.test.ts
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
    agentId: 'jordan-taylor',
    agentDisplayName: 'Jordan',
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

describe('Milestone Mastery Domain Tools', () => {
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
    it('should load all milestone mastery tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      expect(toolDefinitions.length).toBe(8); // 8 tools defined
    });

    it('should have correct domain for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.domain).toBe('milestone-mastery');
      }
    });

    it('should include all expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('celebrateWin');
      expect(toolIds).toContain('markTheMoment');
      expect(toolIds).toContain('createTradition');
      expect(toolIds).toContain('buildCountdown');
      expect(toolIds).toContain('anticipationBuilder');
      expect(toolIds).toContain('navigateFirstTime');
      expect(toolIds).toContain('honorEnding');
      expect(toolIds).toContain('embraceBeginning');
    });
  });

  // --------------------------------------------------------------------------
  // celebrateWin Tool
  // --------------------------------------------------------------------------

  describe('celebrateWin', () => {
    it('should celebrate huge wins with full protocol', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'celebrateWin');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        win: 'Got promoted to VP',
        size: 'huge',
        theyreDownplaying: false,
      });

      expect(result).toContain('CELEBRATION');
      expect(result).toContain('BIG deal');
      expect(result).toContain('Tell people');
      expect(result).toContain('Mark it');
    });

    it('should address downplaying behavior', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'celebrateWin');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        win: 'finished a difficult project',
        size: 'meaningful',
        theyreDownplaying: true,
      });

      // The tool uses curly apostrophe: let's not skip past
      expect(result).toContain("not skip past");
      expect(result).toContain("not nothing");
    });

    it('should validate small but real wins', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'celebrateWin');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        win: 'made my bed every day this week',
        size: 'small-but-real',
      });

      expect(result).toContain('Small wins compound');
      expect(result).toContain('I did this');
    });
  });

  // --------------------------------------------------------------------------
  // markTheMoment Tool
  // --------------------------------------------------------------------------

  describe('markTheMoment', () => {
    it('should mark achievement moments', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'markTheMoment');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        moment: 'Paid off all student loans',
        type: 'achievement',
      });

      expect(result).toContain('Marking');
      expect(result).toContain('achievement');
      expect(result).toContain('Document it');
    });

    it('should handle transition moments with appropriate guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'markTheMoment');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        moment: 'Last day at my job of 10 years',
        type: 'transition',
      });

      expect(result).toContain('transition');
      expect(result).toContain('ending');
      expect(result).toContain('beginning');
    });
  });

  // --------------------------------------------------------------------------
  // createTradition Tool
  // --------------------------------------------------------------------------

  describe('createTradition', () => {
    it('should help create meaningful traditions', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'createTradition');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        occasion: 'Sunday family dinners',
        who: 'Our immediate family',
        values: 'Connection and presence',
      });

      expect(result).toContain('Creating a Tradition');
      expect(result).toContain('Predictability');
      expect(result).toContain('Participation');
      expect(result).toContain('Symbolism');
    });
  });

  // --------------------------------------------------------------------------
  // buildCountdown Tool
  // --------------------------------------------------------------------------

  describe('buildCountdown', () => {
    it('should build countdown for life-defining events', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'buildCountdown');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        event: 'My wedding',
        daysAway: 60,
        importanceLevel: 'life-defining',
      });

      expect(result).toContain('Countdown');
      expect(result).toContain('60 days');
      expect(result).toContain('life-defining');
      expect(result).toContain('Journal');
    });

    it('should handle short countdowns appropriately', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'buildCountdown');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        event: 'Important presentation',
        daysAway: 3,
        importanceLevel: 'major',
      });

      expect(result).toContain('3 days');
      expect(result).toContain('Day before');
    });
  });

  // --------------------------------------------------------------------------
  // anticipationBuilder Tool
  // --------------------------------------------------------------------------

  describe('anticipationBuilder', () => {
    it('should convert anxiety to excitement', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'anticipationBuilder');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        event: 'First marathon',
        currentFeeling: 'anxious',
        whatMakesItSpecial: 'First athletic goal I ever set',
      });

      expect(result).toContain('anxiety');
      expect(result).toContain('redirect');
      expect(result).toContain('within your control');
    });

    it('should amplify existing excitement', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'anticipationBuilder');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        event: 'Trip to Japan',
        currentFeeling: 'very-excited',
      });

      expect(result).toContain('amplify');
      expect(result).toContain('Dream bigger');
    });
  });

  // --------------------------------------------------------------------------
  // navigateFirstTime Tool
  // --------------------------------------------------------------------------

  describe('navigateFirstTime', () => {
    it('should provide encouragement for first times', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateFirstTime');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        firstTime: 'giving a keynote speech',
        feelings: 'terrified but determined',
        support: 'encouragement',
      });

      expect(result).toContain('Your First');
      expect(result).toContain("You've got this");
      expect(result).toContain('Making mistakes is part of first times');
    });

    it('should help with preparation for first times', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateFirstTime');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        firstTime: 'managing a direct report',
        feelings: 'uncertain about how to start',
        support: 'preparation',
      });

      expect(result).toContain("Let's get you ready");
      expect(result).toContain('minimum you need');
    });
  });

  // --------------------------------------------------------------------------
  // honorEnding Tool
  // --------------------------------------------------------------------------

  describe('honorEnding', () => {
    it('should honor endings meaningfully', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'honorEnding');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        ending: 'my 20-year career in medicine',
        duration: '20 years',
        whatItMeant: 'my entire adult identity',
      });

      expect(result).toContain('Honoring the Ending');
      expect(result).toContain('20 years');
      expect(result).toContain('Acknowledge');
      expect(result).toContain('Thank');
      expect(result).toContain('Release');
    });
  });

  // --------------------------------------------------------------------------
  // embraceBeginning Tool
  // --------------------------------------------------------------------------

  describe('embraceBeginning', () => {
    it('should embrace beginnings with mixed feelings', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'embraceBeginning');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        beginning: 'starting my own business',
        feelings: 'mixed',
        intention: 'Build something meaningful while having flexibility',
      });

      expect(result).toContain('New Beginning');
      expect(result).toContain('Mixed feelings');
      expect(result).toContain('honest feelings');
      expect(result).toContain('intention');
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
          win: 'test win',
          size: 'meaningful',
          moment: 'test moment',
          type: 'achievement',
          occasion: 'test occasion',
          who: 'test who',
          event: 'test event',
          daysAway: 30,
          importanceLevel: 'major',
          currentFeeling: 'neutral',
          firstTime: 'test first',
          feelings: 'test',
          support: 'encouragement',
          ending: 'test ending',
          beginning: 'test beginning',
        });

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
        expect(resultStr).not.toContain('[object Object]');
      }
    });
  });
});

