/**
 * Dating Domain Tests
 *
 * Tests for dating navigation, values, and reflection tools.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger FIRST
vi.mock('../../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    safeLog: () => mockLogger,
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../../life-coaching-shared/tool-content-integration.js', () => ({
  getEnhancedToolContext: vi.fn().mockResolvedValue({
    personaId: 'ferni',
    methodology: {},
  }),
  getOpeningPhrase: vi.fn().mockReturnValue("Let's talk about this."),
  getValidationPhrase: vi.fn().mockReturnValue('Your feelings make sense.'),
  buildResearchBackedResponse: vi.fn().mockReturnValue('Research shows...'),
  getAttachmentContext: vi.fn().mockReturnValue({}),
}));

// Import AFTER mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
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
  };
}

describe('Dating Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all dating tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('datingIntentions');
      expect(toolIds).toContain('datingReadiness');
      expect(toolIds).toContain('datingRedFlags');
      expect(toolIds).toContain('datingAppFatigue');
      expect(toolIds).toContain('datingRejection');
      expect(toolIds).toContain('datingValues');
      expect(toolIds).toContain('dealbreakers');
      expect(toolIds).toContain('afterDateReflection');
    });

    it('should have all tools in dating domain', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('dating');
      }
    });
  });

  describe('Tool Execution', () => {
    it('datingIntentions - should clarify dating goals', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingIntentions');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        currentGoal: 'serious',
        whyDating: 'Looking for a life partner',
      });
      expect(result).toContain('intentions');
      expect(result).toContain('serious');
      expect(result).not.toContain('TODO');
    });

    it('datingReadiness - should assess readiness to date', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingReadiness');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        recentBreakup: true,
        howLongAgo: '6 months',
      });
      expect(result).toContain('ready');
      expect(result).toContain('Signs');
    });

    it('datingRedFlags - should identify red flags', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingRedFlags');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        behavior: 'They get angry when I spend time with friends',
      });
      expect(result).toContain('red flag');
    });

    it('datingAppFatigue - should address app burnout', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingAppFatigue');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        currentState: 'exhausted',
      });
      expect(result).toContain('fatigue');
      expect(result).toContain('exhausted');
    });

    it('datingRejection - should help process rejection', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingRejection');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        whatHappened: "They ghosted me after 3 dates",
        feeling: 'hurt and confused',
      });
      expect(result).toContain('rejection');
    });

    it('datingValues - should explore relationship values', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingValues');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});
      expect(result).toContain('values');
    });

    it('dealbreakers - should identify dealbreakers', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'dealbreakers');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        potentialDealbreaker: "They don't want kids",
      });
      expect(result).toContain('Dealbreaker');
    });

    it('afterDateReflection - should guide post-date reflection', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'afterDateReflection');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        howItWent: 'good',
        howYouFelt: 'excited and curious',
      });
      expect(result).toContain('reflection');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        // Provide minimal required params
        let params: Record<string, unknown> = {};
        if (toolDef.id === 'datingIntentions') {
          params = { currentGoal: 'exploring' };
        } else if (toolDef.id === 'datingAppFatigue') {
          params = { currentState: 'frustrated' };
        } else if (toolDef.id === 'datingRedFlags') {
          params = { behavior: 'test' };
        } else if (toolDef.id === 'datingRejection') {
          params = { whatHappened: 'test', feeling: 'sad' };
        } else if (toolDef.id === 'afterDateReflection') {
          params = { howItWent: 'okay', howYouFelt: 'neutral' };
        }
        const result = await tool.execute(params);
        expect(result).not.toContain('TODO');
        expect(result).not.toContain('placeholder');
      }
    });

    it('should include supportive language', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'datingRejection');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        whatHappened: 'test',
        feeling: 'hurt',
      });
      // Should be supportive
      expect(result).toMatch(/valid|stings|hard|worth/i);
    });
  });
});

