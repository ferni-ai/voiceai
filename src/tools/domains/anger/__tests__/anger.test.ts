/**
 * Anger Domain Tests
 *
 * Tests for emotional regulation and anger management tools.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger FIRST - before any imports
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
    fourTendency: 'questioner',
    boundaryHistory: [],
  }),
  updateLifeCoachingProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../life-coaching-shared/safety-guards.js', () => ({
  assessSafety: vi.fn().mockReturnValue({ level: 'safe' }),
  getCrisisResponse: vi.fn().mockReturnValue('Crisis support resources...'),
}));

vi.mock('../../life-coaching-shared/content-databases.js', () => ({
  ANGER_FRAMEWORKS: [
    {
      id: 'anger-as-secondary',
      name: 'Anger as Secondary Emotion',
      description: 'Understanding anger as a response to underlying emotions',
      questions: ['What are you really feeling?'],
    },
  ],
  COPING_TECHNIQUES: [
    {
      id: 'physiological-sigh',
      steps: ['Double inhale', 'Long exhale'],
    },
  ],
}));

vi.mock('../../life-coaching-shared/tool-content-integration.js', () => ({
  getEnhancedToolContext: vi.fn().mockResolvedValue({
    personaId: 'ferni',
    methodology: { openingPhrases: ["Let's explore this together"] },
  }),
  getOpeningPhrase: vi.fn().mockReturnValue("I'm here with you."),
  getValidationPhrase: vi.fn().mockReturnValue('Your feelings are valid.'),
  getEncouragementPhrase: vi.fn().mockReturnValue("You're doing great work."),
  buildResearchBackedResponse: vi.fn().mockReturnValue('Research shows...'),
  getCognitiveDistortionContext: vi.fn().mockReturnValue({}),
  getDBTSkillContext: vi.fn().mockReturnValue({}),
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

describe('Anger Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all anger tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('understandAnger');
      expect(toolIds).toContain('angerInTheMoment');
      expect(toolIds).toContain('expressAngerHealthily');
      expect(toolIds).toContain('repairAfterAnger');
    });

    it('should have all tools in anger domain', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('anger');
      }
    });

    it('should have descriptions for all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.description).toBeDefined();
        expect(toolDef.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Tool Execution', () => {
    it('understandAnger - should provide anger understanding guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'understandAnger');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        currentAngerLevel: 'moderate',
        pattern: 'explosive',
      });
      expect(result).toContain('anger');
      expect(result).not.toContain('TODO');
    });

    it('angerInTheMoment - should provide de-escalation techniques', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'angerInTheMoment');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        intensity: 'hot',
        aloneOrWithPeople: 'alone',
      });
      expect(result).toContain('Right now');
      expect(result).not.toContain('placeholder');
    });

    it('expressAngerHealthily - should provide healthy expression scripts', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'expressAngerHealthily');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        targetPerson: 'my boss',
        whatYouWant: 'to be treated fairly',
      });
      expect(result).toContain('boss');
      expect(result).toContain('expression');
    });

    it('repairAfterAnger - should guide repair process', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'repairAfterAnger');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        whatHappened: 'I yelled at my partner',
        whoWasHurt: 'my partner',
        howYouFeel: 'ashamed',
      });
      expect(result).toContain('repair');
      expect(result).toContain('responsibility');
    });

    it('identifyAngerTriggers - should help identify patterns', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'identifyAngerTriggers');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        recentExample: 'Traffic made me furious',
      });
      expect(result).toContain('trigger');
    });

    it('angerCoolDown - should provide cool down techniques', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'angerCoolDown');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        available: 'private',
        timeAvailable: 'minutes',
      });
      expect(result).toContain('cool-down');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        // Use minimal valid params
        const params =
          toolDef.id === 'angerCoolDown'
            ? { available: 'private' }
            : toolDef.id === 'angerInTheMoment'
              ? { intensity: 'hot' }
              : {};
        const result = await tool.execute(params);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
      }
    });

    it('should include supportive language', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'understandAnger');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});
      expect(result).toMatch(/valid|understand|feel|boundary/i);
    });
  });
});
