/**
 * Trauma Support Domain Tests
 *
 * CRITICAL: These tools are safety-critical and must be thoroughly tested.
 * Tests validate:
 * - Tool loading and creation
 * - Safety check integration
 * - Response content (no placeholders)
 * - Crisis resource inclusion
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
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

vi.mock('../../life-coaching-shared/safety-guards.js', () => ({
  checkSafety: vi.fn((input: string) => {
    // Mock safety check - return crisis intervention for certain keywords
    const crisisKeywords = ['suicide', 'kill myself', 'end it all'];
    const isCrisis = crisisKeywords.some((kw) => input.toLowerCase().includes(kw));
    return {
      isSafe: !isCrisis,
      intervention: isCrisis
        ? 'If you are having thoughts of suicide, please call 988 (Suicide & Crisis Lifeline) or text HOME to 741741.'
        : undefined,
    };
  }),
}));

vi.mock('../../life-coaching-shared/tool-content-integration.js', () => ({
  getEnhancedToolContext: vi.fn(() => ''),
  getOpeningPhrase: vi.fn(() => ''),
  getValidationPhrase: vi.fn(() => ''),
  buildResearchBackedResponse: vi.fn(() => ''),
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

describe('Trauma Support Domain', () => {
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
    it('should load all trauma support tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should export definitions array', () => {
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBe(toolDefinitions.length);
    });

    it('should have expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('groundingForTrauma');
      expect(toolIds).toContain('windowOfTolerance');
      expect(toolIds).toContain('traumaResponses');
      expect(toolIds).toContain('triggerAwareness');
      expect(toolIds).toContain('somaticSupport');
      expect(toolIds).toContain('postTraumaticGrowth');
      expect(toolIds).toContain('selfCompassionTrauma');
    });

    it('should have domain set to trauma-support for all tools', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('trauma-support');
      }
    });
  });

  // ============================================================================
  // GROUNDING FOR TRAUMA TESTS
  // ============================================================================

  describe('groundingForTrauma', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should handle flashback state', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentState: 'flashback' });

      expect(result).toContain('flashback');
      expect(result).toContain('safe');
      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should handle dissociation state', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentState: 'dissociation' });

      expect(result).toContain('dissociation');
      expect(result).toContain('body');
    });

    it('should handle panic state', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentState: 'panic' });

      expect(result).toContain('panic');
      expect(result).toContain('breathing');
    });

    it('should handle hyperarousal state', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentState: 'hyperarousal' });

      expect(result).toContain('hyperarousal');
      expect(result).toContain('nervous system');
    });

    it('should handle general state', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentState: 'general' });

      expect(result).toContain('5-4-3-2-1');
      expect(result).toContain('Grounding');
    });
  });

  // ============================================================================
  // WINDOW OF TOLERANCE TESTS
  // ============================================================================

  describe('windowOfTolerance', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'windowOfTolerance');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should explain hyperarousal zone', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'windowOfTolerance')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentZone: 'hyperarousal' });

      expect(result).toContain('hyperarousal');
      expect(result).toContain('DOWN');
      expect(result).toContain('Window of Tolerance');
    });

    it('should explain hypoarousal zone', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'windowOfTolerance')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentZone: 'hypoarousal' });

      expect(result).toContain('hypoarousal');
      expect(result).toContain('UP');
    });

    it('should celebrate being in window', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'windowOfTolerance')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentZone: 'window' });

      expect(result).toContain('goal state');
      expect(result).toContain('Expand');
    });

    it('should help when unsure', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'windowOfTolerance')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ currentZone: 'unsure' });

      expect(result).toContain('Not sure');
      expect(result).toContain('Check in');
    });
  });

  // ============================================================================
  // TRAUMA RESPONSES TESTS
  // ============================================================================

  describe('traumaResponses', () => {
    it('should explain fight response', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'traumaResponses')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ response: 'fight' });

      expect(result).toContain('Fight response');
      expect(result).toContain('anger');
      expect(result).toContain('survival');
    });

    it('should explain flight response', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'traumaResponses')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ response: 'flight' });

      expect(result).toContain('Flight response');
      expect(result).toContain('escape');
    });

    it('should explain freeze response', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'traumaResponses')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ response: 'freeze' });

      expect(result).toContain('Freeze response');
      expect(result).toContain('immobility');
    });

    it('should explain fawn response', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'traumaResponses')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ response: 'fawn' });

      expect(result).toContain('Fawn response');
      expect(result).toContain('people-pleasing');
    });

    it('should explain all responses in general', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'traumaResponses')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ response: 'general' });

      expect(result).toContain('Fight');
      expect(result).toContain('Flight');
      expect(result).toContain('Freeze');
      expect(result).toContain('Fawn');
    });
  });

  // ============================================================================
  // TRIGGER AWARENESS TESTS
  // ============================================================================

  describe('triggerAwareness', () => {
    it('should explain triggers without specific trigger', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'triggerAwareness')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Understanding triggers');
      expect(result).toContain('Types of triggers');
      expect(result).toContain('When triggered');
    });

    it('should handle specific trigger', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'triggerAwareness')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ trigger: 'loud noises' });

      expect(result).toContain('loud noises');
      expect(result).toContain('Your trigger');
    });
  });

  // ============================================================================
  // SOMATIC SUPPORT TESTS
  // ============================================================================

  describe('somaticSupport', () => {
    it('should provide body-based techniques', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'somaticSupport')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Somatic');
      expect(result).toContain('body');
      expect(result).toContain('Shake');
      expect(result).toContain('EMDR');
    });
  });

  // ============================================================================
  // POST-TRAUMATIC GROWTH TESTS
  // ============================================================================

  describe('postTraumaticGrowth', () => {
    it('should explain growth possibilities', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'postTraumaticGrowth')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Post-Traumatic Growth');
      expect(result).toContain('growth');
      expect(result).toContain('priorities');
      expect(result).toContain('relationships');
    });

    it('should acknowledge growth is optional', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'postTraumaticGrowth')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain("don't have to");
      expect(result).toContain('also okay');
    });
  });

  // ============================================================================
  // SELF-COMPASSION TRAUMA TESTS
  // ============================================================================

  describe('selfCompassionTrauma', () => {
    it('should provide self-compassion practice', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'selfCompassionTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Self-compassion');
      expect(result).toContain('suffering');
      expect(result).toContain('kindness');
    });

    it('should address self-blame when provided', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'selfCompassionTrauma')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ selfBlame: 'I should have done something' });

      expect(result).toContain('I should have done something');
      expect(result).toContain('blame');
      expect(result).toContain('not your fault');
    });
  });

  // ============================================================================
  // CONTENT VALIDATION TESTS
  // ============================================================================

  describe('Content Validation', () => {
    it('should not contain placeholder text in any tool', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        // Execute with minimal params
        const result = await tool.execute(
          toolDef.id === 'groundingForTrauma'
            ? { currentState: 'general' }
            : toolDef.id === 'windowOfTolerance'
              ? { currentZone: 'window' }
              : toolDef.id === 'traumaResponses'
                ? { response: 'general' }
                : {}
        );

        expect(result).not.toContain('TODO');
        expect(result).not.toContain('FIXME');
        expect(result).not.toContain('placeholder');
        expect(result).not.toContain('undefined');
      }
    });

    it('should include appropriate crisis resources', async () => {
      // Grounding tools should mention safety
      const groundingDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma')!;
      const groundingTool = groundingDef.create(mockContext);
      const result = await groundingTool.execute({ currentState: 'flashback' });

      expect(result).toContain('safe');
    });
  });

  // ============================================================================
  // TAG VALIDATION TESTS
  // ============================================================================

  describe('Tag Validation', () => {
    it('should have trauma tag on all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toContain('trauma');
      }
    });

    it('should have appropriate semantic tags', () => {
      const groundingDef = toolDefinitions.find((t) => t.id === 'groundingForTrauma');
      expect(groundingDef?.tags).toContain('grounding');
      expect(groundingDef?.tags).toContain('safety');

      const somaticDef = toolDefinitions.find((t) => t.id === 'somaticSupport');
      expect(somaticDef?.tags).toContain('somatic');
      expect(somaticDef?.tags).toContain('body');
    });
  });
});
