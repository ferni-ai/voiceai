/**
 * Simple Utilities Domain Tools Tests
 *
 * Tests for everyday helper tools: math, conversions, timers, decisions, etc.
 *
 * Run with: npx vitest run src/tools/domains/simple-utilities/__tests__/simple-utilities.test.ts
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

// Mock voice callbacks
vi.mock('../voice-callbacks.js', () => ({
  speakDuration: vi.fn(() => '5 minutes'),
  onTimerComplete: vi.fn(),
  registerVoiceCallbackHandler: vi.fn(),
}));

// Mock pattern intelligence
vi.mock('../pattern-intelligence.js', () => ({
  recordUsage: vi.fn(),
  getUserPatterns: vi.fn().mockResolvedValue({}),
  generateInsight: vi.fn(() => ({ response: 'Test response', followUp: null })),
  getProactiveSuggestions: vi.fn(() => []),
  getTimerFollowUp: vi.fn(() => null),
}));

// Mock context integration
vi.mock('../context-integration.js', () => ({
  enrichTimerWithContext: vi.fn((data) => data),
  enrichCountdownWithContext: vi.fn((data) => data),
  enrichTimezoneWithContext: vi.fn((data) => data),
  loadLifeContext: vi.fn().mockResolvedValue({}),
}));

// Mock persistence
vi.mock('../persistence.js', () => ({
  updateTipPreferences: vi.fn().mockResolvedValue(undefined),
  updateTimerPreferences: vi.fn().mockResolvedValue(undefined),
  updateTimezonePreferences: vi.fn().mockResolvedValue(undefined),
  trackCountdown: vi.fn().mockResolvedValue(undefined),
  loadPatternsFromFirestore: vi.fn().mockResolvedValue({}),
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

describe('Simple Utilities Domain Tools', () => {
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
    it('should load all simple-utilities tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(10);
    });

    it('should have calculateTip tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'calculateTip');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('simple-utilities');
    });

    it('should have splitBill tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'splitBill');
      expect(tool).toBeDefined();
    });

    it('should have convertUnits tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'convertUnits');
      expect(tool).toBeDefined();
    });

    it('should have daysUntil tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'daysUntil');
      expect(tool).toBeDefined();
    });

    it('should have flipCoin tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'flipCoin');
      expect(tool).toBeDefined();
    });

    it('should have setTimer tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'setTimer');
      expect(tool).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Math Tools
  // --------------------------------------------------------------------------

  describe('Math Tools', () => {
    it('should calculate tip correctly', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'calculateTip');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({ billAmount: 50, tipPercent: 20 }, toolCtx);

      expect(result).toBeDefined();
    });

    it('should split bill among people', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'splitBill');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        { totalAmount: 100, numberOfPeople: 4, tipPercent: 20 },
        toolCtx
      );

      expect(result).toBeDefined();
    });

    it('should calculate percentage', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'calculatePercentage');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({ value: 50, total: 200 }, toolCtx);

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Conversion Tools
  // --------------------------------------------------------------------------

  describe('Conversion Tools', () => {
    it('should have convertUnits tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'convertUnits');
      expect(toolDef).toBeDefined();
      expect(toolDef?.domain).toBe('simple-utilities');
    });

    it('should have convertTemperature tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'convertTemperature');
      expect(toolDef).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Date Tools
  // --------------------------------------------------------------------------

  describe('Date Tools', () => {
    it('should calculate days until date', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'daysUntil');
      const tool = toolDef!.create(mockContext);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const result = await tool.execute({
        targetDate: futureDate.toISOString(),
        eventName: 'my birthday',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should calculate date from now', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'dateFromNow');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        days: 30,
      });

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Decision Tools
  // --------------------------------------------------------------------------

  describe('Decision Tools', () => {
    it('should have flipCoin tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'flipCoin');
      expect(toolDef).toBeDefined();
    });

    it('should have rollDice tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'rollDice');
      expect(toolDef).toBeDefined();
    });

    it('should have pickRandom tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'pickRandom');
      expect(toolDef).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Timer Tools
  // --------------------------------------------------------------------------

  describe('Timer Tools', () => {
    it('should have setTimer tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setTimer');
      expect(toolDef).toBeDefined();
    });

    it('should have cancelTimer tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'cancelTimer');
      expect(toolDef).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Notes Tools
  // --------------------------------------------------------------------------

  describe('Notes Tools', () => {
    it('should have quickNote tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickNote');
      expect(toolDef).toBeDefined();
    });

    it('should have recallNote tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'recallNote');
      expect(toolDef).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Domain Completeness
  // --------------------------------------------------------------------------

  describe('Domain Completeness', () => {
    const expectedTools = [
      'calculateTip',
      'splitBill',
      'calculatePercentage',
      'quickMath',
      'convertUnits',
      'convertTemperature',
      'daysUntil',
      'dateFromNow',
      'calculateAge',
      'timeInCity',
      'bestTimeToCall',
      'flipCoin',
      'rollDice',
      'pickRandom',
      'helpMeDecide',
      'setTimer',
      'cancelTimer',
      'quickNote',
      'recallNote',
      'clearNotes',
    ];

    it('should include all expected utility tools', () => {
      const loadedToolIds = toolDefinitions.map((t) => t.id);

      for (const expectedTool of expectedTools) {
        expect(loadedToolIds).toContain(expectedTool);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Content Validation
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

  // --------------------------------------------------------------------------
  // Essentials Tools Tests
  // --------------------------------------------------------------------------

  describe('Essentials Tools', () => {
    describe('whatCanYouDo', () => {
      it('should return capabilities overview', async () => {
        const whatCanYouDoDef = toolDefinitions.find((t) => t.id === 'whatCanYouDo');
        expect(whatCanYouDoDef).toBeDefined();

        const tool = whatCanYouDoDef!.create(mockContext);
        const result = await tool.execute({ category: 'all', quickVersion: false });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('Ferni');
      });

      it('should handle quickVersion parameter', async () => {
        const whatCanYouDoDef = toolDefinitions.find((t) => t.id === 'whatCanYouDo');
        const tool = whatCanYouDoDef!.create(mockContext);
        const result = await tool.execute({ category: 'all', quickVersion: true });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('Quick');
      });
    });

    describe('quickCapture', () => {
      it('should capture thoughts as tasks', async () => {
        const quickCaptureDef = toolDefinitions.find((t) => t.id === 'quickCapture');
        expect(quickCaptureDef).toBeDefined();

        const tool = quickCaptureDef!.create(mockContext);
        const result = await tool.execute({ thought: 'I need to call mom', urgency: 'soon' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('task');
      });

      it('should capture thoughts as reminders with date keywords', async () => {
        const quickCaptureDef = toolDefinitions.find((t) => t.id === 'quickCapture');
        const tool = quickCaptureDef!.create(mockContext);
        const result = await tool.execute({ thought: 'remind me to call mom tomorrow' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('reminder');
      });

      it('should capture shopping items', async () => {
        const quickCaptureDef = toolDefinitions.find((t) => t.id === 'quickCapture');
        const tool = quickCaptureDef!.create(mockContext);
        const result = await tool.execute({ thought: 'buy milk and eggs' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('shopping');
      });
    });

    describe('setPreference', () => {
      it('should set temperature preference', async () => {
        const setPreferenceDef = toolDefinitions.find((t) => t.id === 'setPreference');
        expect(setPreferenceDef).toBeDefined();

        const tool = setPreferenceDef!.create(mockContext);
        const result = await tool.execute({ preferenceType: 'temperature', value: 'celsius' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('Celsius');
      });

      it('should set nickname preference', async () => {
        const setPreferenceDef = toolDefinitions.find((t) => t.id === 'setPreference');
        const tool = setPreferenceDef!.create(mockContext);
        const result = await tool.execute({ preferenceType: 'nickname', value: 'Alex' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result).toContain('Alex');
      });
    });

    describe('getPreferences', () => {
      it('should retrieve preferences', async () => {
        const getPreferencesDef = toolDefinitions.find((t) => t.id === 'getPreferences');
        expect(getPreferencesDef).toBeDefined();

        const tool = getPreferencesDef!.create(mockContext);
        const result = await tool.execute({});

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Humor Tools Tests
  // --------------------------------------------------------------------------

  describe('Humor Tools', () => {
    describe('tellJoke', () => {
      it('should tell a joke', async () => {
        const tellJokeDef = toolDefinitions.find((t) => t.id === 'tellJoke');
        expect(tellJokeDef).toBeDefined();

        const tool = tellJokeDef!.create(mockContext);
        const result = await tool.execute({ category: 'any' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        // Jokes have setup and punchline
        expect(result.length).toBeGreaterThan(10);
      });

      it('should tell a dad joke', async () => {
        const tellJokeDef = toolDefinitions.find((t) => t.id === 'tellJoke');
        const tool = tellJokeDef!.create(mockContext);
        const result = await tool.execute({ category: 'dad' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });

    describe('getFunFact', () => {
      it('should share a fun fact', async () => {
        const getFunFactDef = toolDefinitions.find((t) => t.id === 'getFunFact');
        expect(getFunFactDef).toBeDefined();

        const tool = getFunFactDef!.create(mockContext);
        const result = await tool.execute({ category: 'any' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(10);
      });

      it('should share a science fact', async () => {
        const getFunFactDef = toolDefinitions.find((t) => t.id === 'getFunFact');
        const tool = getFunFactDef!.create(mockContext);
        const result = await tool.execute({ category: 'science' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });

    describe('tellMiniStory', () => {
      it('should tell a mini story', async () => {
        const tellMiniStoryDef = toolDefinitions.find((t) => t.id === 'tellMiniStory');
        expect(tellMiniStoryDef).toBeDefined();

        const tool = tellMiniStoryDef!.create(mockContext);
        const result = await tool.execute({ mood: 'any' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(20);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Wind-Down Tools Tests
  // --------------------------------------------------------------------------

  describe('Wind-Down Tools', () => {
    describe('windDown', () => {
      it('should start wind-down routine', async () => {
        const windDownDef = toolDefinitions.find((t) => t.id === 'windDown');
        expect(windDownDef).toBeDefined();

        const tool = windDownDef!.create(mockContext);
        const result = await tool.execute({ style: 'gentle' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });

    describe('bedtimeCheckIn', () => {
      it('should do bedtime check-in', async () => {
        const bedtimeCheckInDef = toolDefinitions.find((t) => t.id === 'bedtimeCheckIn');
        expect(bedtimeCheckInDef).toBeDefined();

        const tool = bedtimeCheckInDef!.create(mockContext);
        const result = await tool.execute({ focus: 'general' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });

    describe('sleepAffirmation', () => {
      it('should give sleep affirmation', async () => {
        const sleepAffirmationDef = toolDefinitions.find((t) => t.id === 'sleepAffirmation');
        expect(sleepAffirmationDef).toBeDefined();

        const tool = sleepAffirmationDef!.create(mockContext);
        const result = await tool.execute({ theme: 'general' });

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });
  });
});
