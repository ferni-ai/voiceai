/**
 * Boundaries Domain Tests
 *
 * Tests for boundary setting, maintenance, and healing tools.
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

// Mock life-coaching-shared dependencies
vi.mock('../../life-coaching-shared/user-profile.js', () => ({
  getLifeCoachingProfile: vi.fn().mockResolvedValue({
    userId: 'test-user',
    fourTendency: 'obliger',
    boundaryHistory: [],
  }),
  updateLifeCoachingProfile: vi.fn().mockResolvedValue(undefined),
  recordBoundaryAttempt: vi.fn().mockResolvedValue(undefined),
  getBoundaryPatterns: vi.fn().mockResolvedValue({
    successRate: 0.6,
    commonChallenges: ['work'],
    growth: ['Getting better at saying no'],
  }),
  detectTendencyCues: vi.fn().mockReturnValue(null),
  updateTendency: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../life-coaching-shared/adaptive-response.js', () => ({
  generateAdaptiveResponse: vi.fn((response) => response),
  adaptForTendency: vi.fn((response) => response),
  TENDENCY_FRAMINGS: {},
  detectPeoplePleasing: vi.fn().mockReturnValue(3),
  recognizeProgress: vi.fn().mockReturnValue(null),
}));

vi.mock('../../life-coaching-shared/content-databases.js', () => ({
  BOUNDARY_SCRIPTS: [],
  getScriptForCategory: vi.fn().mockReturnValue(['I am not available for that.']),
  getAdaptedScript: vi.fn().mockReturnValue('As an obliger, external accountability helps.'),
  TENDENCY_STRATEGIES: {
    obliger: {
      boundaries: ['Use external accountability', 'Find a boundary buddy'],
    },
    questioner: {
      boundaries: ['Understand why the boundary matters'],
    },
  },
  REFLECTION_QUESTIONS: {
    boundaries: ['What drains you?', 'Where do you feel resentment?'],
  },
}));

vi.mock('../../life-coaching-shared/tool-content-integration.js', () => ({
  getEnhancedToolContext: vi.fn().mockResolvedValue({
    personaId: 'maya',
    methodology: {},
  }),
  getOpeningPhrase: vi.fn().mockReturnValue("Let's explore this together."),
  getValidationPhrase: vi.fn().mockReturnValue('Your need for this boundary is valid.'),
  getExpertReference: vi.fn().mockReturnValue('Brené Brown says...'),
  buildResearchBackedResponse: vi.fn().mockReturnValue('Research shows...'),
  getDBTSkillContext: vi.fn().mockReturnValue({}),
}));

// Import AFTER mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'maya',
    agentDisplayName: 'Maya',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Boundaries Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all boundaries tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('identifyBoundaryNeeds');
      expect(toolIds).toContain('setBoundary');
      expect(toolIds).toContain('sayNoWithGrace');
      expect(toolIds).toContain('maintainBoundary');
      expect(toolIds).toContain('healFromBoundaryViolation');
      expect(toolIds).toContain('recoverFromPeoplePleasing');
      expect(toolIds).toContain('boundaryInventory');
    });

    it('should have all tools in boundaries domain', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('boundaries');
      }
    });
  });

  describe('Tool Execution', () => {
    it('identifyBoundaryNeeds - should help identify boundary needs', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'identifyBoundaryNeeds');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        situation: 'My boss keeps asking me to work weekends',
        feelingDrained: true,
      });
      expect(result).toContain('Boundaries');
      expect(result).not.toContain('TODO');
    });

    it('setBoundary - should provide scripts for boundary setting', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setBoundary');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        boundaryType: 'time',
        personType: 'boss',
        situation: 'Expectations of after-hours availability',
        firmness: 'firm',
      });
      expect(result).toContain('boundary');
      expect(result).toContain('Scripts');
    });

    it('sayNoWithGrace - should provide graceful refusal scripts', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'sayNoWithGrace');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        request: 'Can you cover my shift this weekend?',
        whyHard: 'I feel guilty saying no',
        relationship: 'coworker',
      });
      expect(result).toContain('no');
      expect(result).toMatch(/sentence|complete/i);
    });

    it('maintainBoundary - should support boundary maintenance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'maintainBoundary');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        boundarySet: "I don't work after 6pm",
        howTested: "They keep calling me at night",
        personReaction: 'guilt-trip',
      });
      expect(result).toContain('boundary');
    });

    it('healFromBoundaryViolation - should guide healing process', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'healFromBoundaryViolation');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        whatHappened: 'They shared my private information',
        howYouFeel: 'betrayed and angry',
        isOngoing: false,
      });
      expect(result).toContain('violation');
      expect(result).toContain('valid');
    });

    it('recoverFromPeoplePleasing - should address people-pleasing patterns', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'recoverFromPeoplePleasing');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        awareness: 'just-realized',
        specificPattern: 'I always say yes even when I want to say no',
      });
      expect(result).toContain('people-pleasing');
    });

    it('boundaryInventory - should assess boundaries across domains', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'boundaryInventory');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        focusArea: 'work',
      });
      expect(result).toContain('Inventory');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      for (const toolDef of toolDefinitions.slice(0, 3)) {
        const tool = toolDef.create(mockContext);
        // Provide minimal required params based on tool
        let params: Record<string, unknown> = {};
        if (toolDef.id === 'setBoundary') {
          params = {
            boundaryType: 'time',
            personType: 'boss',
            situation: 'test',
          };
        } else if (toolDef.id === 'maintainBoundary') {
          params = {
            boundarySet: 'test',
            howTested: 'test',
            personReaction: 'pushback',
          };
        } else if (toolDef.id === 'healFromBoundaryViolation') {
          params = { whatHappened: 'test', howYouFeel: 'upset' };
        } else if (toolDef.id === 'recoverFromPeoplePleasing') {
          params = { awareness: 'working-on-it' };
        } else if (toolDef.id === 'sayNoWithGrace') {
          params = { request: 'test' };
        }

        const result = await tool.execute(params);
        expect(result).not.toContain('TODO');
        expect(result).not.toContain('placeholder');
      }
    });
  });
});





