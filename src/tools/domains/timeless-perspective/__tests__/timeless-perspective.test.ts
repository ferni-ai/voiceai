/**
 * Timeless Perspective Domain Tools Tests (Nayan Patel's Specialty)
 *
 * Tests for superhuman patience, wisdom across decades, and the long view.
 *
 * Run with: npx vitest run src/tools/domains/timeless-perspective/__tests__/timeless-perspective.test.ts
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
    agentId: 'nayan-patel',
    agentDisplayName: 'Nayan',
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

describe('Timeless Perspective Domain Tools', () => {
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
    it('should load all timeless perspective tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      expect(toolDefinitions.length).toBe(6); // 6 tools defined
    });

    it('should have correct domain for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.domain).toBe('timeless-perspective');
      }
    });

    it('should include all expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('decadeView');
      expect(toolIds).toContain('thisTooPasses');
      expect(toolIds).toContain('ancientParallel');
      expect(toolIds).toContain('zoomOut');
      expect(toolIds).toContain('whatWillMatter');
      expect(toolIds).toContain('seasonalWisdom');
    });
  });

  // --------------------------------------------------------------------------
  // decadeView Tool
  // --------------------------------------------------------------------------

  describe('decadeView', () => {
    it('should provide decade-long perspective', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'decadeView');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        currentSituation: 'Got passed over for promotion',
        concern: "My career is stalling and I'll never advance",
      });

      expect(result).toContain('Decade View');
      expect(result).toContain('ten years');
      // Check for general decade-related content
      expect(result.toLowerCase()).toContain('decade');
    });

    it('should include decades context when provided', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'decadeView');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        currentSituation: 'Considering major career change at 45',
        concern: "It's too late to start over",
        decadesContext: 'Could have 20+ more working years ahead',
      });

      expect(result).toContain('arc of your life');
      expect(result).toContain('20+');
    });
  });

  // --------------------------------------------------------------------------
  // thisTooPasses Tool
  // --------------------------------------------------------------------------

  describe('thisTooPasses', () => {
    it('should offer impermanence wisdom', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'thisTooPasses');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        whatTheyreFeeling: 'crushing anxiety about a work presentation',
        howLong: 'the past two weeks',
        worryItsPermanent: true,
      });

      expect(result).toContain('This Too Shall Pass');
      expect(result).toContain('worried this is permanent');
      expect(result).toContain("It isn't");
      expect(result).toContain('everything passes');
    });

    it('should work without worryItsPermanent flag', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'thisTooPasses');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        whatTheyreFeeling: 'grief after a breakup',
      });

      expect(result).toContain('passes');
      expect(result).not.toContain('undefined');
    });
  });

  // --------------------------------------------------------------------------
  // ancientParallel Tool
  // --------------------------------------------------------------------------

  describe('ancientParallel', () => {
    it('should connect to timeless human experiences', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'ancientParallel');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        experience: 'feeling like an imposter in my new role',
        feelingAlone: true,
      });

      expect(result).toContain('Ancient Parallel');
      expect(result).toContain('feel alone');
      expect(result).toContain("You're not");
      expect(result).toContain('thousands of years');
      expect(result).toContain('Marcus Aurelius');
    });

    it('should work without feeling alone', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'ancientParallel');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        experience: 'wondering what my legacy will be',
      });

      expect(result).toContain('part of being human');
    });
  });

  // --------------------------------------------------------------------------
  // zoomOut Tool
  // --------------------------------------------------------------------------

  describe('zoomOut', () => {
    it('should zoom out to day level', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'zoomOut');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        stuckOn: 'A frustrating email exchange with a colleague',
        zoomLevel: 'day',
      });

      expect(result).toContain('Zooming Out');
      expect(result).toContain("today's view");
      expect(result).toContain('feel about this tonight');
    });

    it('should zoom out to decade level', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'zoomOut');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        stuckOn: 'Whether to buy a house now or wait',
        zoomLevel: 'decade',
      });

      expect(result).toContain('decade view');
      expect(result).toContain('ten years');
    });

    it('should zoom out to lifetime level', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'zoomOut');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        stuckOn: 'Regret over past decisions',
        zoomLevel: 'lifetime',
      });

      expect(result).toContain("lifetime's view");
      expect(result).toContain('look back on your life');
    });
  });

  // --------------------------------------------------------------------------
  // whatWillMatter Tool
  // --------------------------------------------------------------------------

  describe('whatWillMatter', () => {
    it('should identify what truly matters', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'whatWillMatter');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        decision: 'Whether to take a lower-paying but more meaningful job',
        stakesFeelLike: 'everything',
      });

      expect(result).toContain('What Will Actually Matter');
      expect(result).toContain('everything feels like it matters');
      expect(result).toContain('Relationships');
      expect(result).toContain('Growth');
      expect(result).toContain('rarely matters as much');
    });
  });

  // --------------------------------------------------------------------------
  // seasonalWisdom Tool
  // --------------------------------------------------------------------------

  describe('seasonalWisdom', () => {
    it('should apply winter season wisdom', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'seasonalWisdom');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        situation: 'Nothing feels like it is working and growth has stopped',
        season: 'winter',
      });

      expect(result).toContain('Seasonal Wisdom');
      expect(result).toContain("You're in winter");
      expect(result).toContain('rest');
      expect(result).toContain('Spring comes');
    });

    it('should apply spring season wisdom', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'seasonalWisdom');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'Starting fresh after a difficult period',
        season: 'spring',
      });

      expect(result).toContain("You're in spring");
      expect(result).toContain('new beginnings');
      expect(result).toContain('fragile');
    });

    it('should apply summer season wisdom', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'seasonalWisdom');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'Everything is going well and I have lots of energy',
        season: 'summer',
      });

      expect(result).toContain("You're in summer");
      expect(result).toContain('abundance');
      expect(result).toContain("don't last forever");
    });

    it('should handle unsure season', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'seasonalWisdom');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: "I'm not sure where I am in life right now",
        season: 'unsure',
      });

      expect(result).toContain('between seasons');
      expect(result).toContain('disorienting');
      expect(result).toContain('Trust');
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
          currentSituation: 'test situation',
          concern: 'test concern',
          whatTheyreFeeling: 'test feeling',
          experience: 'test experience',
          stuckOn: 'test focus',
          zoomLevel: 'year',
          decision: 'test decision',
          stakesFeelLike: 'medium',
          situation: 'test',
          season: 'summer',
        });

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
        expect(resultStr).not.toContain('[object Object]');
      }
    });
  });
});
