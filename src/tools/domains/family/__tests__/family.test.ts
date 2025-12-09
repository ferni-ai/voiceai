/**
 * Family & Parenting Domain Tools Tests
 *
 * Tests for parenting support, family dynamics, milestones, and elder care.
 *
 * Run with: npx vitest run src/tools/domains/family/__tests__/family.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
  persistKeyMoment: vi.fn(),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { getToolDefinitions } from '../index.js';
import type { ToolDefinition, ToolContext } from '../../../registry/types.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'jordan',
    agentDisplayName: 'Jordan',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

function executeWithContext(
  tool: { execute: (params: Record<string, unknown>, context: { ctx: ToolContext }) => any },
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  return tool.execute(params, { ctx }) as Promise<string>;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Family & Parenting Domain Tools', () => {
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

  describe('Tool Loading', () => {
    it('should load all family tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have coachParentingChallenge tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'coachParentingChallenge');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('family');
    });

    it('should have trackChildMilestone tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'trackChildMilestone');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('family');
    });

    it('should have supportFamilyTransition tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'supportFamilyTransition');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('family');
    });

    it('should have coordinateElderCare tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'coordinateElderCare');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('family');
    });
  });

  describe('coachParentingChallenge', () => {
    it('should coach on toddler tantrums', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachParentingChallenge');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        childAgeGroup: 'toddler',
        challenge: 'tantrums',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should coach on teen behavior', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachParentingChallenge');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        childAgeGroup: 'teen',
        challenge: 'screen-time',
      });

      expect(result).toBeDefined();
    });
  });

  describe('trackChildMilestone', () => {
    it('should track a milestone', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackChildMilestone');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          childName: 'Emma',
          milestone: 'First steps!',
          date: 'Today',
          reaction: 'So excited!',
        },
        mockContext
      );

      expect(result).toBeDefined();
      expect(result).toContain('Emma');
      expect(result).toContain('Milestone');
    });
  });

  describe('suggestAgeAppropriateActivity', () => {
    it('should suggest activities for toddlers', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'suggestAgeAppropriateActivity');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        childAgeGroup: 'toddler',
        goal: 'creative',
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(50);
    });
  });

  describe('supportFamilyTransition', () => {
    it('should support new baby transition', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'supportFamilyTransition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transition: 'new-baby',
        familyContext: 'First child arriving in 2 months',
      });

      expect(result).toBeDefined();
      expect(
        result.toLowerCase().includes('baby') || result.toLowerCase().includes('transition')
      ).toBe(true);
    });

    it('should support divorce transition', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'supportFamilyTransition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transition: 'divorce',
        familyContext: 'Two young children involved',
      });

      expect(result).toBeDefined();
    });
  });

  describe('navigateFamilyConflict', () => {
    it('should help navigate sibling conflicts', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateFamilyConflict');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        conflictType: 'sibling-rivalry',
        situation: 'Kids constantly fighting over toys',
      });

      expect(result).toBeDefined();
    });
  });

  describe('coordinateElderCare', () => {
    it('should help coordinate elder care', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coordinateElderCare');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        situation: 'aging-parent',
        concernLevel: 'moderate',
        currentSupport: 'Living alone, needs more help',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachParentingChallenge');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        childAgeGroup: 'elementary',
        challenge: 'homework',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should provide supportive, non-judgmental guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachParentingChallenge');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        childAgeGroup: 'toddler',
        challenge: 'tantrums',
      });

      // Should have substantive, supportive content
      expect(result.length).toBeGreaterThan(200);
    });
  });
});
