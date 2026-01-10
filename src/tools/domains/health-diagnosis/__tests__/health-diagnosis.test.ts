/**
 * Health Diagnosis Domain Tests
 *
 * Tests for tools that help users navigate receiving significant health diagnoses.
 * These tools support emotional processing, not medical advice.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
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

vi.mock('../../../../services/cross-persona-insights.js', () => ({
  addCrossPersonaInsight: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../utils/tool-descriptions.js', () => ({
  getToolDescription: vi.fn((id: string) => `Description for ${id}`),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions, definitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available in test');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Health Diagnosis Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // TOOL LOADING TESTS
  // ============================================================================

  describe('Tool Loading', () => {
    it('should load all health diagnosis tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should export definitions array', () => {
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
    });

    it('should have expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('diagnosisShock');
      expect(toolIds).toContain('chronicIllnessLife');
      expect(toolIds).toContain('invisibleIllness');
      expect(toolIds).toContain('tellingOthers');
    });

    it('should have domain set to health-diagnosis for all tools', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('health-diagnosis');
      }
    });
  });

  // ============================================================================
  // DIAGNOSIS SHOCK TESTS
  // ============================================================================

  describe('diagnosisShock', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'diagnosisShock');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should handle diagnosis without specific details', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'diagnosisShock')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Grief');
      expect(result).toContain('before and after');
      expect(result).not.toContain('TODO');
    });

    it('should handle diagnosis with specific details', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'diagnosisShock')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        diagnosis: 'Type 2 diabetes',
        howLongAgo: '2 weeks',
      });

      expect(result).toContain('Type 2 diabetes');
      expect(result).toContain('2 weeks');
      expect(result).toContain('Normal Responses');
    });

    it('should acknowledge grief for healthy self', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'diagnosisShock')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('body you thought you had');
      expect(result).toContain('health you assumed');
    });

    it('should provide timeline of adjustment', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'diagnosisShock')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Acute phase');
      expect(result).toContain('Processing');
      expect(result).toContain('Adjustment');
      expect(result).toContain('Integration');
    });
  });

  // ============================================================================
  // CHRONIC ILLNESS LIFE TESTS
  // ============================================================================

  describe('chronicIllnessLife', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chronicIllnessLife');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should explain spoon theory', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chronicIllnessLife')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Spoon theory');
      expect(result).toContain('Energy');
    });

    it('should address invisible reality', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chronicIllnessLife')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('You look fine');
      expect(result).toContain('Invisible');
    });

    it('should handle current struggle parameter', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chronicIllnessLife')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        currentStruggle: 'fatigue',
        illnessDuration: '3 years',
      });

      expect(result).toContain('fatigue');
      expect(result).toContain('3 years');
    });

    it('should affirm user value is not productivity', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chronicIllnessLife')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('value is not your productivity');
    });
  });

  // ============================================================================
  // INVISIBLE ILLNESS TESTS
  // ============================================================================

  describe('invisibleIllness', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'invisibleIllness');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should address double burden', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'invisibleIllness')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Double Burden');
      expect(result).toContain('proving');
    });

    it('should address hurtful comments', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'invisibleIllness')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        whatPeopleSay: "You don't look sick",
      });

      expect(result).toContain("You don't look sick");
      expect(result).toContain("I don't believe you");
    });

    it('should provide validation', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'invisibleIllness')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('symptoms are real');
      expect(result).toContain('pain is real');
      expect(result).toContain('exhaustion is real');
    });

    it('should mention ADA protections', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'invisibleIllness')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('ADA');
    });
  });

  // ============================================================================
  // TELLING OTHERS TESTS
  // ============================================================================

  describe('tellingOthers', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'tellingOthers');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should affirm user control over story', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'tellingOthers')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('control your story');
      expect(result).toContain('decide');
    });

    it('should handle specific audience', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'tellingOthers')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        whoToTell: 'work',
        concern: "afraid I'll lose my job",
      });

      expect(result).toContain('work');
      expect(result).toContain("afraid I'll lose my job");
      expect(result).toContain('FMLA');
    });

    it('should address family disclosure', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'tellingOthers')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ whoToTell: 'family' });

      expect(result).toContain('family');
      expect(result).toContain('Family');
    });

    it('should provide script ideas', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'tellingOthers')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Script Ideas');
      expect(result).toContain('wanted to let you know');
    });
  });

  // ============================================================================
  // CONTENT VALIDATION TESTS
  // ============================================================================

  describe('Content Validation', () => {
    it('should not contain placeholder text in any tool', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        const result = await tool.execute({});

        expect(result).not.toContain('TODO');
        expect(result).not.toContain('FIXME');
        expect(result).not.toContain('placeholder');
      }
    });

    it('should contain compassionate language', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        const result = await tool.execute({});

        // Should have at least one compassionate element
        const hasCompassion =
          result.includes('grief') ||
          result.includes('valid') ||
          result.includes('real') ||
          result.includes('deserve') ||
          result.includes('support');

        expect(hasCompassion).toBe(true);
      }
    });
  });

  // ============================================================================
  // TAG VALIDATION TESTS
  // ============================================================================

  describe('Tag Validation', () => {
    it('should have health tag on all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toContain('health');
      }
    });

    it('should have appropriate semantic tags', () => {
      const diagnosisDef = toolDefinitions.find((t) => t.id === 'diagnosisShock');
      expect(diagnosisDef?.tags).toContain('diagnosis');
      expect(diagnosisDef?.tags).toContain('shock');
      expect(diagnosisDef?.tags).toContain('grief');

      const chronicDef = toolDefinitions.find((t) => t.id === 'chronicIllnessLife');
      expect(chronicDef?.tags).toContain('chronic-illness');
    });
  });
});
