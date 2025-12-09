/**
 * Career Domain Tools Tests
 *
 * Tests for job search, interview prep, career development, and professional tools.
 *
 * Run with: npx vitest run src/tools/domains/career/__tests__/career.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock safe-logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock @livekit/agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock persistence
vi.mock('../../shared/persistence.js', () => ({
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

// Mock analytics
vi.mock('../../shared/index.js', () => ({
  trackToolUsage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
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

// Helper to execute tools that need the second context argument
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

describe('Career Domain Tools', () => {
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
    it('should load all career tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have trackJobApplication tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('career');
    });

    it('should have practiceInterview tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'practiceInterview');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('career');
    });

    it('should have researchSalary tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'researchSalary');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('career');
    });

    it('should have assessBurnout tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'assessBurnout');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('career');
    });
  });

  // --------------------------------------------------------------------------
  // Job Application Tracking
  // --------------------------------------------------------------------------

  describe('trackJobApplication', () => {
    it('should add a new job application', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'add',
          company: 'Tech Corp',
          role: 'Software Engineer',
          status: 'applied',
        },
        mockContext
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('Application Logged');
      expect(result).toContain('Tech Corp');
      expect(result).toContain('Software Engineer');
    });

    it('should update application status to interview', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'update',
          company: 'Tech Corp',
          status: 'interview-scheduled',
        },
        mockContext
      );

      expect(result).toContain('Updated');
      expect(result).toContain('interview');
    });

    it('should celebrate job offer', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'update',
          company: 'Dream Company',
          role: 'Senior Developer',
          status: 'offer',
        },
        mockContext
      );

      expect(result).toContain('Congratulations');
      expect(result).toContain('offer');
    });

    it('should handle rejection compassionately', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'update',
          company: 'Some Company',
          status: 'rejected',
        },
        mockContext
      );

      expect(result).toContain('Rejection');
      // Should have supportive messaging
      expect(result.length).toBeGreaterThan(100);
    });

    it('should provide job search statistics', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'stats',
        },
        mockContext
      );

      expect(result).toContain('Statistics');
    });
  });

  // --------------------------------------------------------------------------
  // Interview Preparation
  // --------------------------------------------------------------------------

  describe('practiceInterview', () => {
    it('should provide behavioral interview practice', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'practiceInterview');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        questionType: 'behavioral',
        role: 'Product Manager',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should provide technical interview practice', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'practiceInterview');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        questionType: 'technical',
        role: 'Software Engineer',
      });

      expect(result).toBeDefined();
    });

    it('should provide case interview practice', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'practiceInterview');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        questionType: 'case',
        role: 'Consultant',
      });

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // STAR Stories
  // --------------------------------------------------------------------------

  describe('prepareSTARStories', () => {
    it('should help prepare STAR stories', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'prepareSTARStories');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        storyType: 'leadership',
        roughIdea: 'Led a team through a difficult project',
      });

      expect(result).toBeDefined();
      expect(result.includes('STAR') || result.includes('leadership')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Salary Research
  // --------------------------------------------------------------------------

  describe('researchSalary', () => {
    it('should provide salary research guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'researchSalary');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        role: 'Software Engineer',
        location: 'San Francisco',
        yearsExperience: 5,
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('salary');
    });
  });

  // --------------------------------------------------------------------------
  // Burnout Assessment
  // --------------------------------------------------------------------------

  describe('assessBurnout', () => {
    it('should assess mild burnout symptoms', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'assessBurnout');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        symptoms: ['exhaustion'],
        duration: 'days',
      });

      expect(result).toBeDefined();
      expect(result).toContain('Burnout');
    });

    it('should assess moderate burnout with recommendations', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'assessBurnout');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        symptoms: ['exhaustion', 'cynicism', 'sleep_issues'],
        duration: 'weeks',
      });

      expect(result).toContain('Burnout');
      expect(result).toContain('Recommendation');
    });

    it('should flag severe burnout and recommend professional help', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'assessBurnout');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        symptoms: ['exhaustion', 'cynicism', 'inefficacy', 'dread', 'physical_symptoms'],
        duration: 'months',
        workHours: 60,
      });

      // Should contain either severe or Important
      const containsSevereOrImportant = result.includes('severe') || result.includes('Important');
      expect(containsSevereOrImportant).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Work Boundaries
  // --------------------------------------------------------------------------

  describe('setWorkBoundary', () => {
    it('should help set work boundaries', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setWorkBoundary');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        boundaryType: 'time',
        currentSituation: 'Working late every night',
        desiredState: 'Leave by 6pm',
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('boundary');
    });
  });

  // --------------------------------------------------------------------------
  // Skill Development
  // --------------------------------------------------------------------------

  describe('identifySkillGaps', () => {
    it('should identify skill gaps', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'identifySkillGaps');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        currentRole: 'Junior Developer',
        targetRole: 'Senior Developer',
        currentSkills: ['JavaScript', 'React'],
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Career Transition
  // --------------------------------------------------------------------------

  describe('planCareerTransition', () => {
    it('should help plan career transition', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planCareerTransition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        currentField: 'Marketing',
        targetField: 'Product Management',
        timeline: '6-12 months',
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('transition');
    });
  });

  // --------------------------------------------------------------------------
  // Content Validation
  // --------------------------------------------------------------------------

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'add',
          company: 'Test Corp',
          role: 'Engineer',
        },
        mockContext
      );

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });

    it('should provide actionable next steps', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackJobApplication');
      const tool = toolDef!.create(mockContext);

      const result = await executeWithContext(
        tool,
        {
          action: 'add',
          company: 'Great Company',
          role: 'Designer',
          status: 'applied',
        },
        mockContext
      );

      // Should include next steps or recommendations
      const hasNextSteps =
        result.includes('follow-up') || result.includes('research') || result.includes('Next');
      expect(hasNextSteps).toBe(true);
    });
  });
});
