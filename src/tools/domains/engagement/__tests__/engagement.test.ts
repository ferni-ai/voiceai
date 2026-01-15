/**
 * Engagement Domain Tools Tests
 *
 * Tests for engagement games, daily rituals, and team interactions.
 *
 * Run with: npx vitest run src/tools/domains/engagement/__tests__/engagement.test.ts
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
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
}));

// Mock daily rituals service
vi.mock('../../../../services/daily-rituals.js', () => ({
  getDailyRitualsService: () => ({
    getRitualOpening: vi.fn(() => 'Good morning! How is your sky looking today?'),
    recordCompletion: vi.fn(() => ({ newStreak: 1, isNewRecord: false })),
    getWeatherResponse: vi.fn(() => "That's a beautiful sunny day!"),
    getWeatherTrends: vi.fn(() => ({ dominantWeather: 'sunny', energyTrend: 'stable' })),
    exportProfile: vi.fn(() => ({
      totalCheckIns: 10,
      longestStreak: 5,
      currentStreak: 3,
      badges: [],
      recentWeather: ['sunny', 'partly-cloudy'],
    })),
  }),
}));

// Mock persona voices
vi.mock('../../../../personas/persona-voices.js', () => ({
  PERSONA_VOICES: {
    ferni: { celebrationStyle: 'warm' },
    maya: { celebrationStyle: 'encouraging' },
    alex: { celebrationStyle: 'professional' },
    jordan: { celebrationStyle: 'enthusiastic' },
    peter: { celebrationStyle: 'analytical' },
    nayan: { celebrationStyle: 'wise' },
  },
}));

// ============================================================================
// IMPORTS
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

// Context wrapper for tools that expect { ctx: ... } as second arg
function createToolContext(ctx: ToolContext) {
  return {
    ctx: {
      ...ctx,
      userData: { userId: ctx.userId },
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Engagement Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;
  let toolCtx: ReturnType<typeof createToolContext>;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
    toolCtx = createToolContext(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Loading
  // --------------------------------------------------------------------------

  describe('Tool Loading', () => {
    it('should load all engagement tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have morningSkyCheck tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'morningSkyCheck');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('engagement');
    });

    it('should have kintsugiMoments tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'kintsugiMoments');
      expect(tool).toBeDefined();
    });

    it('should have teamHuddle tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'teamHuddle');
      expect(tool).toBeDefined();
    });

    it('should have streakTracker tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'streakTracker');
      expect(tool).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Emotional Games (Ferni)
  // --------------------------------------------------------------------------

  describe('Emotional Games', () => {
    it('should run morning sky check start mode', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'morningSkyCheck');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({ mode: 'start' }, toolCtx);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('message');
    });

    it('should record morning sky weather', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'morningSkyCheck');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        { mode: 'record-weather', weather: 'sunny', energy: 'high' },
        toolCtx
      );

      expect(result).toBeDefined();
    });

    it('should share kintsugi moments', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'kintsugiMoments');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          brokenMoment: 'I failed at a job interview',
          goldFinding: 'I learned what questions to prepare for',
        },
        toolCtx
      );

      expect(result).toBeDefined();
    });

    it('should provide question of the week', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'questionOfTheWeek');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({}, toolCtx);

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Financial Games (Maya)
  // --------------------------------------------------------------------------

  describe('Financial Games', () => {
    it('should run compound interest game', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'compoundInterestGame');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          dailyAmount: 5,
          years: 10,
        },
        toolCtx
      );

      expect(result).toBeDefined();
    });

    it('should create tiny bet', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'tinyBets');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        betDescription: 'I will exercise 3 times this week',
        stakesDescription: 'Coffee for a friend if I fail',
      });

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Life Planning Games (Jordan)
  // --------------------------------------------------------------------------

  describe('Life Planning Games', () => {
    it('should write future self letter', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'futureSelfLetter');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        timeframe: '1-year',
        topic: 'career',
      });

      expect(result).toBeDefined();
    });

    it('should run life portfolio review', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'lifePortfolioReview');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({});

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Wisdom Games (Nayan)
  // --------------------------------------------------------------------------

  describe('Wisdom Games', () => {
    it('should present paradox of the day', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'paradoxOfTheDay');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({});

      expect(result).toBeDefined();
    });

    it('should explore question beneath', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'questionBeneath');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        surfaceQuestion: 'Should I change jobs?',
      });

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Analytics Games (Peter)
  // --------------------------------------------------------------------------

  describe('Analytics Games', () => {
    it('should run pattern detective', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'patternDetective');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        domain: 'mood',
      });

      expect(result).toBeDefined();
    });

    it('should make weekly prediction', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'weeklyPrediction');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          prediction: 'I will complete my project',
          confidence: 80,
        },
        toolCtx
      );

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Productivity Games (Alex)
  // --------------------------------------------------------------------------

  describe('Productivity Games', () => {
    it('should run inbox zero challenge', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'inboxZeroChallenge');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          currentCount: 50,
        },
        toolCtx
      );

      expect(result).toBeDefined();
    });

    it('should run Sunday prep', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'sundayPrepGame');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({});

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Team Challenges
  // --------------------------------------------------------------------------

  describe('Team Challenges', () => {
    it('should run team huddle', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'teamHuddle');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        topic: 'weekly-check-in',
      });

      expect(result).toBeDefined();
    });

    it('should have quickChallenges tool defined', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickChallenges');
      expect(toolDef).toBeDefined();
      expect(toolDef?.domain).toBe('engagement');
    });

    it('should have streakTracker tool defined', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'streakTracker');
      expect(toolDef).toBeDefined();
      expect(toolDef?.domain).toBe('engagement');
    });

    it('should have celebrationMoment tool defined', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'celebrationMoment');
      expect(toolDef).toBeDefined();
      expect(toolDef?.domain).toBe('engagement');
    });
  });

  // --------------------------------------------------------------------------
  // Domain Completeness
  // --------------------------------------------------------------------------

  describe('Domain Completeness', () => {
    const expectedTools = [
      'morningSkyCheck',
      'kintsugiMoments',
      'questionOfTheWeek',
      'compoundInterestGame',
      'tinyBets',
      'futureSelfLetter',
      'lifePortfolioReview',
      'paradoxOfTheDay',
      'questionBeneath',
      'patternDetective',
      'weeklyPrediction',
      'inboxZeroChallenge',
      'sundayPrepGame',
      'teamHuddle',
      'quickChallenges',
      'streakTracker',
      'celebrationMoment',
    ];

    it('should include all expected engagement tools', () => {
      const loadedToolIds = toolDefinitions.map((t) => t.id);

      for (const expectedTool of expectedTools) {
        expect(loadedToolIds).toContain(expectedTool);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Tool Creation
  // --------------------------------------------------------------------------

  describe('Tool Creation', () => {
    it('should create tool instances with execute function', () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        expect(tool).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });
  });
});
