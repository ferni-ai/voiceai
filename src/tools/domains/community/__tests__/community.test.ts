/**
 * Community & Impact Domain Tools Tests
 *
 * Tests for volunteering, giving, civic engagement, and community building.
 *
 * Run with: npx vitest run src/tools/domains/community/__tests__/community.test.ts
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
  persistTrackedItem: vi.fn(),
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
    agentId: 'peter',
    agentDisplayName: 'Peter',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

describe('Community & Impact Domain Tools', () => {
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
    it('should load all community tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have findVolunteerOpportunity tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'findVolunteerOpportunity');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('community');
    });

    it('should have trackVolunteerHours tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'trackVolunteerHours');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('community');
    });

    it('should have planCharitableGiving tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'planCharitableGiving');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('community');
    });
  });

  describe('findVolunteerOpportunity', () => {
    it('should find volunteer opportunities', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'findVolunteerOpportunity');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        interests: ['environment', 'education'],
        timeAvailable: 'weekends',
        skills: ['teaching', 'organizing'],
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });
  });

  describe('trackVolunteerHours', () => {
    it('should track volunteer hours', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackVolunteerHours');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          organization: 'Local Food Bank',
          activity: 'Sorting donations',
          hours: 4,
          impact: 'Helped sort 200 lbs of food',
        },
        mockContext
      );

      expect(result).toBeDefined();
      expect(result).toContain('Food Bank');
    });
  });

  describe('planCharitableGiving', () => {
    it('should help plan charitable giving', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planCharitableGiving');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        budget: 1000,
        causes: ['education', 'poverty'],
        approach: 'monthly',
      });

      expect(result).toBeDefined();
    });
  });

  describe('alignGivingWithValues', () => {
    it('should align giving with values', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'alignGivingWithValues');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        values: ['environmental-sustainability', 'local-community'],
        currentGiving: 'Random donations when asked',
      });

      expect(result).toBeDefined();
    });
  });

  describe('findCommunityGroup', () => {
    it('should find community groups', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'findCommunityGroup');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        interest: 'book-club',
        format: 'in-person',
      });

      expect(result).toBeDefined();
    });
  });

  describe('engageCivically', () => {
    it('should help with civic engagement', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'engageCivically');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        issue: 'local-education',
        engagementLevel: 'moderate',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'findVolunteerOpportunity');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        interests: ['animals'],
        timeAvailable: 'flexible',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should provide meaningful impact guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planCharitableGiving');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        budget: 500,
        causes: ['healthcare'],
      });

      // Should have substantive content
      expect(result.length).toBeGreaterThan(150);
    });
  });
});
