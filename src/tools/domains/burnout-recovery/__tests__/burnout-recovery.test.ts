/**
 * Burnout Recovery Domain Tests
 *
 * Tests for burnout assessment, recovery, and prevention tools.
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
    personaId: 'maya',
    methodology: {},
  }),
  getOpeningPhrase: vi.fn().mockReturnValue("Let's talk about what you're experiencing."),
  getValidationPhrase: vi.fn().mockReturnValue('This is understandable.'),
  buildResearchBackedResponse: vi.fn().mockReturnValue('Research indicates...'),
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

describe('Burnout Recovery Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all burnout recovery tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('assessBurnout');
      expect(toolIds).toContain('restAsSkill');
      expect(toolIds).toContain('burnoutRecoveryPlan');
      expect(toolIds).toContain('burnoutWarningSigns');
      expect(toolIds).toContain('boundariesForRecovery');
    });

    it('should have all tools in burnout-recovery domain', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('burnout-recovery');
      }
    });
  });

  describe('Tool Execution', () => {
    it('assessBurnout - should provide burnout assessment', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'assessBurnout');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        symptoms: "I'm exhausted all the time",
        duration: '3 months',
        workSituation: 'demanding startup',
      });
      expect(result).toContain('Burnout');
      expect(result).toContain('exhaustion');
      expect(result).not.toContain('TODO');
    });

    it('restAsSkill - should teach rest techniques', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'restAsSkill');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        restStuggle: 'cant-relax',
      });
      expect(result).toContain('rest');
      expect(result).toContain('7 types');
    });

    it('burnoutRecoveryPlan - should create recovery plan', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'burnoutRecoveryPlan');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        stage: 'chronic',
        constraints: "can't quit my job",
      });
      expect(result).toContain('Recovery');
      expect(result).toContain('Immediate'); // Capital I
      expect(result).toContain('Long-term');
    });

    it('burnoutWarningSigns - should list warning signs', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'burnoutWarningSigns');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});
      expect(result).toContain('warning');
      expect(result).toContain('Physical');
      expect(result).toContain('Emotional');
    });

    it('boundariesForRecovery - should suggest protective boundaries', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'boundariesForRecovery');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        area: 'work',
      });
      expect(result).toContain('Boundaries');
      expect(result).toContain('work');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        const params =
          toolDef.id === 'restAsSkill'
            ? { restStuggle: 'cant-relax' }
            : toolDef.id === 'burnoutRecoveryPlan'
              ? { stage: 'chronic' }
              : toolDef.id === 'boundariesForRecovery'
                ? { area: 'work' }
                : toolDef.id === 'assessBurnout'
                  ? { symptoms: 'test' }
                  : {};
        const result = await tool.execute(params);
        expect(result).not.toContain('TODO');
        expect(result).not.toContain('placeholder');
      }
    });

    it('should include compassionate language', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'assessBurnout');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({ symptoms: "I'm burned out" });
      // Should be supportive, not clinical
      expect(result).not.toMatch(/error|failed|invalid/i);
    });
  });
});

