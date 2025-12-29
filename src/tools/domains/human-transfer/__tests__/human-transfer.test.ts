/**
 * Human Transfer Domain Tools Tests
 *
 * > "Better than human means knowing when to bring in a human."
 *
 * Tests for crisis escalation, human expert connection, and quick crisis resources.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock the human-transfer service
vi.mock('../../../../services/human-transfer/index.js', () => ({
  humanTransfer: {
    evaluateTransferNeed: vi.fn((transcript: string) => {
      // Simulate crisis detection
      if (
        transcript.toLowerCase().includes('want to die') ||
        transcript.toLowerCase().includes('kill myself')
      ) {
        return {
          type: 'crisis_immediate',
          urgency: 'immediate',
          reason: 'Active crisis indicators detected',
          confidence: 0.95,
          suggestedService: '988 Suicide & Crisis Lifeline',
          safetyFlags: { suicidalIdeation: true },
        };
      }
      if (transcript.toLowerCase().includes('depressed for months')) {
        return {
          type: 'therapy',
          urgency: 'when_ready',
          reason: 'Persistent depression may benefit from professional support',
          confidence: 0.8,
          suggestedService: 'Licensed therapist',
        };
      }
      return {
        type: 'none',
        urgency: 'informational',
        reason: 'Within life coaching scope',
        confidence: 0.8,
      };
    }),
    getAvailableServices: vi.fn((type: string) => {
      if (type === 'crisis_immediate' || type === 'crisis_support') {
        return [
          { name: '988 Suicide & Crisis Lifeline', phone: '988', available: '24/7' },
          { name: 'Crisis Text Line', sms: 'HOME to 741741', available: '24/7' },
        ];
      }
      return [{ name: '211', phone: '211', available: '24/7' }];
    }),
  },
  buildTransferAwarenessContext: vi.fn(() => null),
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

// Import after mocks
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

describe('Human Transfer Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // TOOL LOADING TESTS
  // ============================================================================

  describe('Tool Loading', () => {
    it('should load all three tool definitions', async () => {
      expect(toolDefinitions.length).toBe(3);
    });

    it('should have evaluateHumanTransfer tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('crisis');
    });

    it('should have connectToHumanExpert tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('crisis');
    });

    it('should have quickCrisisResources tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('crisis');
    });
  });

  // ============================================================================
  // EVALUATE HUMAN TRANSFER TESTS
  // ============================================================================

  describe('evaluateHumanTransfer', () => {
    it('should detect crisis indicators in suicidal statements', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        userStatement: "I don't want to be here anymore, I want to die",
        context: 'User has been expressing hopelessness',
      });

      expect(result).toContain('IMMEDIATE');
      expect(result).toContain('988');
    });

    it('should suggest therapy for persistent depression', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        userStatement: "I've been depressed for months and can't function",
      });

      expect(result).toContain('THERAPY');
    });

    it('should return within coaching scope for normal conversations', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        userStatement: 'I want to improve my morning routine',
      });

      expect(result).toContain('Within life coaching scope');
    });

    it('should always return crisis resources on error', async () => {
      // Mock the service to throw an error
      const { humanTransfer } = await import('../../../../services/human-transfer/index.js');
      vi.mocked(humanTransfer.evaluateTransferNeed).mockImplementationOnce(() => {
        throw new Error('Service unavailable');
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        userStatement: 'test statement',
      });

      // Should still include crisis resources as fallback
      expect(result).toContain('988');
      expect(result).toContain('Crisis Text Line');
    });
  });

  // ============================================================================
  // CONNECT TO HUMAN EXPERT TESTS
  // ============================================================================

  describe('connectToHumanExpert', () => {
    it('should provide crisis resources for immediate crisis', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transferType: 'crisis_immediate',
        userConsent: 'minimal',
      });

      expect(result).toContain('988');
      expect(result).toContain("I'm also still here with you");
    });

    it('should provide therapy resources with suggested topics', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transferType: 'therapy',
        userConsent: 'topics_only',
        keyTopics: ['anxiety', 'work stress', 'relationship issues'],
      });

      expect(result).toContain('Psychology Today');
      expect(result).toContain('BetterHelp');
      expect(result).toContain('Open Path');
      expect(result).toContain('anxiety');
    });

    it('should not include topics when consent is none', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transferType: 'therapy',
        userConsent: 'none',
        keyTopics: ['anxiety', 'depression'],
      });

      expect(result).toContain('Psychology Today');
      // Should NOT include the topics since consent is 'none'
      expect(result).not.toContain('Based on our conversations');
    });

    it('should provide legal resources for legal transfer', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transferType: 'legal',
        userConsent: 'minimal',
      });

      expect(result).toContain('Legal');
      expect(result).toContain('LawHelp.org');
    });

    it('should provide financial resources for financial transfer', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transferType: 'financial',
        userConsent: 'minimal',
      });

      expect(result).toContain('211');
      expect(result).toContain('NFCC');
    });

    it('should provide medical resources for medical transfer', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transferType: 'medical',
        userConsent: 'minimal',
      });

      expect(result).toContain('911');
      expect(result).toContain('Urgent Care');
    });
  });

  // ============================================================================
  // QUICK CRISIS RESOURCES TESTS
  // ============================================================================

  describe('quickCrisisResources', () => {
    it('should provide default crisis resources', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({});

      expect(result).toContain('988');
      expect(result).toContain('741741'); // Crisis Text Line
      expect(result).toContain("You Don't Have to Face This Alone");
    });

    it('should provide DV-specific resources for domestic violence', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'domestic-violence',
      });

      expect(result).toContain('National Domestic Violence Hotline');
      expect(result).toContain('1-800-799-7233');
      expect(result).toContain('88788');
    });

    it('should provide substance-specific resources for substance crisis', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'substance-crisis',
      });

      expect(result).toContain('SAMHSA');
      expect(result).toContain('1-800-662-4357');
    });

    it('should provide resources for suicidal thoughts', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'suicidal-thoughts',
      });

      expect(result).toContain('988');
      expect(result).toContain('Crisis Text Line');
    });
  });

  // ============================================================================
  // CONTENT VALIDATION TESTS
  // ============================================================================

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);

        // Execute with valid params based on tool
        let result: string;
        if (toolDef.id === 'evaluateHumanTransfer') {
          result = await tool.execute({ userStatement: 'test statement' });
        } else if (toolDef.id === 'connectToHumanExpert') {
          result = await tool.execute({ transferType: 'therapy', userConsent: 'minimal' });
        } else {
          result = await tool.execute({});
        }

        expect(result).not.toContain('TODO');
        expect(result).not.toContain('placeholder');
        expect(result).not.toContain('FIXME');
      }
    });

    it('crisis resources should always include 988', async () => {
      const quickCrisis = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = quickCrisis!.create(mockContext);

      // Test all situations
      const situations = [
        'suicidal-thoughts',
        'self-harm',
        'panic-attack',
        'domestic-violence',
        'substance-crisis',
        'general-crisis',
      ];

      for (const situation of situations) {
        const result = await tool.execute({ situation });
        expect(result).toContain('988');
      }
    });

    it('therapy resources should include multiple options', async () => {
      const connectTool = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const tool = connectTool!.create(mockContext);

      const result = await tool.execute({
        transferType: 'therapy',
        userConsent: 'full_summary',
      });

      // Should provide multiple therapy finding options
      expect(result).toContain('Psychology Today');
      expect(result).toContain('BetterHelp');
      expect(result).toContain('Open Path');
    });
  });

  // ============================================================================
  // TOOL TAGS AND METADATA TESTS
  // ============================================================================

  describe('Tool Metadata', () => {
    it('all tools should have safety tag', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toContain('safety');
      }
    });

    it('all tools should be in crisis domain', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('crisis');
      }
    });

    it('all tools should have meaningful descriptions', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.description.length).toBeGreaterThan(20);
      }
    });
  });
});
