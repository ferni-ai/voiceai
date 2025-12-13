/**
 * Workflow Mastery Domain Tools Tests (Alex Chen's Specialty)
 *
 * Tests for superhuman organization, communication clarity, and calendar optimization.
 *
 * Run with: npx vitest run src/tools/domains/workflow-mastery/__tests__/workflow-mastery.test.ts
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
}));

vi.mock('../../shared/persistence.js', () => ({
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

vi.mock('../../shared/index.js', () => ({
  trackToolUsage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'alex-chen',
    agentDisplayName: 'Alex',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Workflow Mastery Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Loading
  // --------------------------------------------------------------------------

  describe('Tool Loading', () => {
    it('should load all workflow mastery tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      expect(toolDefinitions.length).toBe(6); // 6 tools defined
    });

    it('should have correct domain for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.domain).toBe('workflow-mastery');
      }
    });

    it('should have required fields for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.id).toBeDefined();
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.create).toBeDefined();
        expect(typeof def.create).toBe('function');
      }
    });

    it('should include all expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('systemDesign');
      expect(toolIds).toContain('chaosToOrder');
      expect(toolIds).toContain('calendarArchitecture');
      expect(toolIds).toContain('messageCrafting');
      expect(toolIds).toContain('difficultEmailDraft');
      expect(toolIds).toContain('communicationStrategy');
    });
  });

  // --------------------------------------------------------------------------
  // systemDesign Tool
  // --------------------------------------------------------------------------

  describe('systemDesign', () => {
    it('should design systems for recurring tasks', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'systemDesign');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        problem: 'managing inbox overwhelm',
        frequency: 'daily',
        painPoints: 'I check email 50 times a day and never feel caught up',
      });

      expect(result).toContain('System Design');
      expect(result).toContain('inbox');
      expect(result).toContain('daily');
      expect(result).toContain('Capture');
      expect(result).toContain('Process');
    });

    it('should handle complex frequency systems', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'systemDesign');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        problem: 'quarterly business reviews',
        frequency: 'complex',
      });

      expect(result).toContain('complex');
      expect(result).toContain('sustainable');
    });
  });

  // --------------------------------------------------------------------------
  // chaosToOrder Tool
  // --------------------------------------------------------------------------

  describe('chaosToOrder', () => {
    it('should handle crisis urgency with triage', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chaosToOrder');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        chaos: 'Multiple deadlines, team conflicts, client emergency',
        urgency: 'crisis',
      });

      expect(result).toContain('Bringing Order to Chaos');
      expect(result).toContain('Crisis mode');
      expect(result).toContain('RIGHT NOW');
      expect(result).toContain('TODAY');
    });

    it('should provide structured approach for building chaos', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'chaosToOrder');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        chaos: 'Too many projects, unclear priorities',
        urgency: 'building',
      });

      expect(result).toContain('Brain Dump');
      expect(result).toContain('Categorize');
      expect(result).toContain('Sequence');
    });
  });

  // --------------------------------------------------------------------------
  // calendarArchitecture Tool
  // --------------------------------------------------------------------------

  describe('calendarArchitecture', () => {
    it('should design calendar that protects priorities', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'calendarArchitecture');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        currentProblem: 'Back-to-back meetings leave no time for deep work',
        priorities: 'Strategic thinking and family dinner',
      });

      expect(result).toContain('Calendar Architecture');
      expect(result).toContain('Protect first');
      expect(result).toContain('Buffer time');
      expect(result).toContain('Energy mapping');
    });
  });

  // --------------------------------------------------------------------------
  // messageCrafting Tool
  // --------------------------------------------------------------------------

  describe('messageCrafting', () => {
    it('should craft professional messages', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'messageCrafting');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        context: 'Asking for a project extension',
        recipient: 'My manager',
        goal: 'Get 2 weeks more time without looking unprepared',
        tone: 'professional',
      });

      expect(result).toContain('Message Crafting');
      expect(result).toContain('professional');
      expect(result).toContain('Clear subject');
      expect(result).toContain('Next steps');
    });

    it('should adapt to diplomatic tone', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'messageCrafting');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        context: 'Pushing back on unrealistic timeline',
        recipient: 'Executive stakeholder',
        goal: 'Negotiate better timeline without damaging relationship',
        tone: 'diplomatic',
      });

      expect(result).toContain('diplomatic');
      expect(result).toContain('Acknowledge their position');
      expect(result).toContain('mutual benefit');
    });
  });

  // --------------------------------------------------------------------------
  // difficultEmailDraft Tool
  // --------------------------------------------------------------------------

  describe('difficultEmailDraft', () => {
    it('should help with saying no gracefully', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'difficultEmailDraft');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        situation: 'Asked to take on another project when already overloaded',
        difficulty: 'saying-no',
        relationship: 'peer colleague',
      });

      expect(result).toContain('Saying No');
      expect(result).toContain('Thank them');
      expect(result).toContain('Preserve the relationship');
    });

    it('should help with giving feedback', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'difficultEmailDraft');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'Team member consistently misses deadlines',
        difficulty: 'giving-feedback',
        relationship: 'direct report',
      });

      expect(result).toContain('Giving Feedback');
      expect(result).toContain('specific about what needs to change');
    });

    it('should help with apologizing professionally', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'difficultEmailDraft');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'Sent an email with incorrect information to client',
        difficulty: 'apologizing',
        relationship: 'external client',
      });

      expect(result).toContain('Apologizing');
      expect(result).toContain('Acknowledge impact');
    });
  });

  // --------------------------------------------------------------------------
  // communicationStrategy Tool
  // --------------------------------------------------------------------------

  describe('communicationStrategy', () => {
    it('should develop strategic communication plans', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'communicationStrategy');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        situation: 'Announcing organizational restructure',
        stakeholders: 'Executive team, managers, individual contributors',
        goal: 'Minimize anxiety and maintain trust',
        complications: 'Some roles will be eliminated',
      });

      expect(result).toContain('Communication Strategy');
      expect(result).toContain('Sequence Matters');
      expect(result).toContain('Channel Selection');
      expect(result).toContain('Anticipate Reactions');
    });

    it('should handle situations without complications', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'communicationStrategy');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'Rolling out new company-wide tool',
        stakeholders: 'All employees',
        goal: 'High adoption within first month',
      });

      expect(result).toContain('Communication Strategy');
      expect(result).not.toContain('undefined');
    });
  });

  // --------------------------------------------------------------------------
  // Content Quality
  // --------------------------------------------------------------------------

  describe('Content Quality', () => {
    it('should not contain placeholder text in outputs', async () => {
      for (const def of toolDefinitions) {
        const tool = def.create(mockContext);
        const result = await tool.execute({
          problem: 'test problem',
          frequency: 'weekly',
          chaos: 'test chaos',
          urgency: 'pressing',
          currentProblem: 'test',
          priorities: 'test',
          context: 'test context',
          recipient: 'test recipient',
          goal: 'test goal',
          tone: 'professional',
          situation: 'test situation',
          difficulty: 'saying-no',
          relationship: 'test',
          stakeholders: 'test',
        });

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
        expect(resultStr).not.toContain('[object Object]');
      }
    });
  });
});

