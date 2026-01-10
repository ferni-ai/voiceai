/**
 * Weekly Summary Tools Tests
 *
 * Tests for the weekly analytics summary tool that provides
 * conversational progress updates for users.
 *
 * @module tools/domains/insights/__tests__/weekly-summary-tools
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the safe-logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock engagement store data
const mockProfile = {
  userId: 'test-user-123',
  activeRituals: ['ferni-sky-check', 'maya-habit-heartbeat'],
  engagementLevel: 'regular',
};

const mockStreaks = [
  {
    ritualId: 'ferni-sky-check',
    currentStreak: 5,
    longestStreak: 12,
    totalCompletions: 45,
    lastCompletedAt: new Date().toISOString(),
  },
  {
    ritualId: 'maya-habit-heartbeat',
    currentStreak: 3,
    longestStreak: 7,
    totalCompletions: 20,
    lastCompletedAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
  },
];

const mockWeatherHistory = [
  { weather: { primary: 'sunny' }, date: new Date().toISOString() },
  { weather: { primary: 'partly-cloudy' }, date: new Date(Date.now() - 86400000).toISOString() },
  { weather: { primary: 'sunny' }, date: new Date(Date.now() - 172800000).toISOString() },
  { weather: { primary: 'cloudy' }, date: new Date(Date.now() - 259200000).toISOString() },
  { weather: { primary: 'sunny' }, date: new Date(Date.now() - 345600000).toISOString() },
  { weather: { primary: 'rainbow' }, date: new Date(Date.now() - 432000000).toISOString() },
  { weather: { primary: 'partly-cloudy' }, date: new Date(Date.now() - 518400000).toISOString() },
];

let mockStoreError = false;
let mockEmptyData = false;

// Mock engagement store
vi.mock('../../../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(async () => {
    if (mockStoreError) {
      throw new Error('Store connection failed');
    }
    return {
      getProfile: vi.fn(async () => (mockEmptyData ? null : mockProfile)),
      getAllStreaks: vi.fn(async () => (mockEmptyData ? [] : mockStreaks)),
      getWeatherHistory: vi.fn(async () => (mockEmptyData ? [] : mockWeatherHistory)),
    };
  }),
}));

// Import after mocks are set up
import { getToolDefinitions, weeklySummaryToolDefinitions } from '../index.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Weekly Summary Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStoreError = false;
    mockEmptyData = false;
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  // --------------------------------------------------------------------------
  // TOOL LOADING
  // --------------------------------------------------------------------------

  describe('Tool Loading', () => {
    it('should load all tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should export weeklySummaryToolDefinitions', () => {
      expect(weeklySummaryToolDefinitions).toBeDefined();
      expect(Array.isArray(weeklySummaryToolDefinitions)).toBe(true);
      expect(weeklySummaryToolDefinitions.length).toBe(1);
    });

    it('should have getWeeklySummary tool', async () => {
      const tool = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('Get Weekly Summary');
      expect(tool?.domain).toBe('insights');
    });

    it('should have correct tags', async () => {
      const tool = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      expect(tool?.tags).toContain('analytics');
      expect(tool?.tags).toContain('summary');
      expect(tool?.tags).toContain('habits');
      expect(tool?.tags).toContain('mood');
    });
  });

  // --------------------------------------------------------------------------
  // TOOL CREATION
  // --------------------------------------------------------------------------

  describe('Tool Creation', () => {
    it('should create tool with context', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should have helpful LLM description', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);

      expect(tool.description).toContain('How am I doing');
      expect(tool.description).toContain('weekly summary');
    });
  });

  // --------------------------------------------------------------------------
  // SUCCESSFUL EXECUTION
  // --------------------------------------------------------------------------

  describe('Successful Execution', () => {
    it('should return summary with streak information', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('5-day streak');
    });

    it('should mention mood trends', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      // Should have mood insight (good spirits based on sunny/rainbow weather)
      expect(result).toMatch(/good spirits|balanced|challenging/i);
    });

    it('should include wins section when applicable', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      // With 5-day streak, should mention wins
      expect(result).toMatch(/win|highlight|positive/i);
    });

    it('should ask follow-up question', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      // Should end with invitation to continue
      expect(result).toMatch(/\?$/);
    });
  });

  // --------------------------------------------------------------------------
  // PERSONA-SPECIFIC RESPONSES
  // --------------------------------------------------------------------------

  describe('Persona-Specific Responses', () => {
    it('should use Maya coaching tone', async () => {
      const mayaContext = createMockContext({ agentId: 'maya' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mayaContext);
      const result = await tool.execute({});

      // Maya says "let's check in" or "celebrate"
      expect(result).toMatch(/check in|celebrate|momentum/i);
    });

    it('should use Peter data-driven tone', async () => {
      const peterContext = createMockContext({ agentId: 'peter' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(peterContext);
      const result = await tool.execute({});

      // Peter uses words like "overview", "indicators", "data"
      expect(result).toMatch(/overview|indicator|data|track/i);
    });

    it('should use Nayan reflective tone', async () => {
      const nayanContext = createMockContext({ agentId: 'nayan' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(nayanContext);
      const result = await tool.execute({});

      // Nayan uses words like "reflect", "journey", "wisdom"
      expect(result).toMatch(/reflect|journey|wisdom|rhythm/i);
    });

    it('should use Jordan progress-focused tone', async () => {
      const jordanContext = createMockContext({ agentId: 'jordan' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(jordanContext);
      const result = await tool.execute({});

      // Jordan uses words like "progress", "plan", "building"
      expect(result).toMatch(/progress|plan|building|week/i);
    });

    it('should use Ferni default tone', async () => {
      const ferniContext = createMockContext({ agentId: 'ferni' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(ferniContext);
      const result = await tool.execute({});

      // Ferni uses friendly default tone
      expect(result).toMatch(/how you've been|doing lately/i);
    });
  });

  // --------------------------------------------------------------------------
  // NO DATA SCENARIOS
  // --------------------------------------------------------------------------

  describe('No Data Scenarios', () => {
    beforeEach(() => {
      mockEmptyData = true;
    });

    it('should return friendly no-data message for Ferni', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      expect(result).toMatch(/don't have enough|not enough|few days/i);
    });

    it('should return Maya-specific no-data message', async () => {
      const mayaContext = createMockContext({ agentId: 'maya' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mayaContext);
      const result = await tool.execute({});

      expect(result).toMatch(/don't have enough data|checking in|few days/i);
    });

    it('should return Peter-specific no-data message', async () => {
      const peterContext = createMockContext({ agentId: 'peter' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(peterContext);
      const result = await tool.execute({});

      expect(result).toMatch(/insufficient data|statistical|week/i);
    });

    it('should return Nayan-specific no-data message', async () => {
      const nayanContext = createMockContext({ agentId: 'nayan' });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(nayanContext);
      const result = await tool.execute({});

      expect(result).toMatch(/beginning|journey|learn/i);
    });
  });

  // --------------------------------------------------------------------------
  // ERROR HANDLING
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle missing userId gracefully', async () => {
      const noUserContext = createMockContext({ userId: undefined });
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(noUserContext);
      const result = await tool.execute({});

      expect(result).toMatch(/need to know who|signed in/i);
    });

    it('should handle store errors gracefully', async () => {
      mockStoreError = true;
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      // When store errors, aggregateWeeklySummary catches it and returns null,
      // which triggers the no-data response (graceful degradation)
      expect(result).toMatch(/don't have enough|not enough|check in/i);
    });
  });

  // --------------------------------------------------------------------------
  // CONTENT VALIDATION
  // --------------------------------------------------------------------------

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('FIXME');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });

    it('should not contain technical jargon', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      expect(result).not.toContain('null');
      expect(result).not.toContain('NaN');
      expect(result).not.toContain('Error:');
      expect(result).not.toContain('Exception');
    });

    it('should be conversational not robotic', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      // Should use natural language, not lists of numbers
      expect(result).not.toMatch(/^\d+\.\d+%$/);
      expect(result).not.toMatch(/totalRituals: \d+/);
    });
  });

  // --------------------------------------------------------------------------
  // RITUAL NAME FORMATTING
  // --------------------------------------------------------------------------

  describe('Ritual Name Formatting', () => {
    it('should format known ritual names', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWeeklySummary');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});

      // Should use human-friendly name "Morning Sky Check" not "ferni-sky-check"
      if (result.includes('consistent')) {
        expect(result).not.toContain('ferni-sky-check');
        expect(result).toMatch(/Morning Sky Check|Habit Heartbeat/i);
      }
    });
  });
});
