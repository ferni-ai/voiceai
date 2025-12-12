/**
 * E2E Tool Chain Tests
 *
 * Tests for complete user journeys that chain multiple tools together.
 * These validate real-world scenarios where users interact with Ferni
 * across multiple domains and tools.
 *
 * Run with: npx vitest run src/tools/__tests__/e2e-tool-chains.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../domains/shared/persistence.js', () => ({
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

vi.mock('../domains/shared/index.js', () => ({
  trackToolUsage: vi.fn(() => ({ success: vi.fn(), error: vi.fn() })),
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
}));

vi.mock('../../memory/index.js', () => ({
  memoryService: {
    remember: vi.fn().mockResolvedValue({ success: true }),
    recall: vi.fn().mockResolvedValue({ success: true, facts: [] }),
    search: vi.fn().mockResolvedValue({ success: true, results: [] }),
  },
}));

// ============================================================================
// IMPORTS
// ============================================================================

import type { ToolContext, ToolDefinition } from '../registry/types.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(agentId = 'ferni'): ToolContext {
  return {
    userId: 'e2e-test-user',
    sessionId: 'e2e-test-session',
    agentId,
    agentDisplayName: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

interface ChainStep {
  toolId: string;
  params: Record<string, unknown>;
  expectedInResult?: string[];
}

async function runToolChain(
  steps: ChainStep[],
  toolDefinitions: ToolDefinition[],
  ctx: ToolContext
): Promise<{
  results: string[];
  success: boolean;
  failedStep?: number;
  error?: string;
}> {
  const results: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const toolDef = toolDefinitions.find((t) => t.id === step.toolId);

    if (!toolDef) {
      return {
        results,
        success: false,
        failedStep: i,
        error: `Tool not found: ${step.toolId}`,
      };
    }

    try {
      const tool = toolDef.create(ctx);
      const result = await tool.execute(step.params, { ctx });
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      results.push(resultStr);

      // Validate expected content
      if (step.expectedInResult) {
        for (const expected of step.expectedInResult) {
          if (!resultStr.toLowerCase().includes(expected.toLowerCase())) {
            return {
              results,
              success: false,
              failedStep: i,
              error: `Step ${i}: Expected "${expected}" in result`,
            };
          }
        }
      }
    } catch (error) {
      return {
        results,
        success: false,
        failedStep: i,
        error: `Step ${i} (${step.toolId}): ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { results, success: true };
}

// ============================================================================
// E2E TEST SUITES
// ============================================================================

describe('E2E Tool Chains', () => {
  let careerTools: ToolDefinition[];
  let griefTools: ToolDefinition[];
  let engagementTools: ToolDefinition[];
  let ctx: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    ctx = createMockContext();

    // Load tool definitions
    const careerModule = await import('../domains/career/index.js');
    careerTools = await careerModule.getToolDefinitions();

    const griefModule = await import('../domains/grief/index.js');
    griefTools = await griefModule.getToolDefinitions();

    const engagementModule = await import('../domains/engagement/index.js');
    engagementTools = await engagementModule.getToolDefinitions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Career Journey: Job Search to Interview
  // --------------------------------------------------------------------------

  describe('Career Journey: Job Search to Interview', () => {
    it('should complete: clarify goals → explore gaps → track application → practice interview', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'clarifyCareerGoals',
          params: { timeHorizon: '1-year', clarity: 'vague' },
          expectedInResult: ['goal'],
        },
        {
          toolId: 'exploreGrowthAreas',
          params: { currentRole: 'Junior Developer', targetRole: 'Senior Developer' },
          expectedInResult: ['growth', 'skill'],
        },
        {
          toolId: 'trackJobApplication',
          params: {
            action: 'add',
            company: 'Tech Corp',
            role: 'Senior Developer',
            status: 'applied',
          },
          expectedInResult: ['logged', 'tech corp'],
        },
        {
          toolId: 'practiceInterview',
          params: { interviewType: 'behavioral', role: 'Senior Developer' },
          expectedInResult: ['interview', 'star'],
        },
      ];

      const result = await runToolChain(chain, careerTools, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);
    });

    it('should handle career satisfaction assessment flow', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'assessCareerSatisfaction',
          params: { currentRole: 'Product Manager', yearsInRole: 3 },
          expectedInResult: ['satisfaction', 'work'],
        },
        {
          toolId: 'assessBurnout',
          params: { symptoms: ['exhaustion', 'cynicism'], duration: 'weeks' },
          expectedInResult: ['burnout'],
        },
        {
          toolId: 'setWorkBoundary',
          params: { boundaryArea: 'hours', currentSituation: 'Working 60+ hours' },
          expectedInResult: ['boundary'],
        },
      ];

      const result = await runToolChain(chain, careerTools, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it('should support salary negotiation journey', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'trackJobApplication',
          params: { action: 'update', company: 'Dream Co', status: 'offer' },
          expectedInResult: ['offer'],
        },
        {
          toolId: 'researchSalary',
          params: { role: 'Engineer', location: 'SF', yearsExperience: 5 },
          expectedInResult: ['salary', 'research'],
        },
        {
          toolId: 'rolePlayNegotiation',
          params: { scenario: 'initial-offer', theirOffer: 150000, theirTarget: 180000 },
          expectedInResult: ['negotiat'],
        },
      ];

      const result = await runToolChain(chain, careerTools, ctx);

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Grief Support Journey
  // --------------------------------------------------------------------------

  describe('Grief Support Journey', () => {
    it('should support fresh grief → wave navigation → companionship', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'processGrief',
          params: { lossType: 'death', whatWasLost: 'my father', whereTheyAre: 'fresh' },
          expectedInResult: ['father', 'valid'],
        },
        {
          toolId: 'navigateGriefWave',
          params: { intensity: 'overwhelming', trigger: 'his favorite song' },
          expectedInResult: ['wave'],
        },
        {
          toolId: 'companionInGrief',
          params: { whatTheyNeed: 'talk' },
          expectedInResult: ['listen'],
        },
      ];

      const result = await runToolChain(chain, griefTools, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it('should support loss acknowledgment and validation flow', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'acknowledgeLoss',
          params: { loss: 'my dog', whyItMayNotBeRecognized: 'people say its just a pet' },
          expectedInResult: ['real', 'valid'],
        },
        {
          toolId: 'validateGrief',
          params: { dismissiveMessage: 'time-heals' },
          expectedInResult: ['time'],
        },
      ];

      const result = await runToolChain(chain, griefTools, ctx);

      expect(result.success).toBe(true);
    });

    it('should support transition journey', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'navigateTransition',
          params: { transition: 'divorce', stage: 'beginning' },
          expectedInResult: ['transition'],
        },
        {
          toolId: 'processEnding',
          params: { whatIsEnding: 'my marriage of 10 years', howItFeels: 'scary and liberating' },
          expectedInResult: ['ending'],
        },
        {
          toolId: 'embraceNewIdentity',
          params: { oldIdentity: 'wife', trigger: 'divorce', howItFeels: 'uncertain' },
          expectedInResult: ['identity'],
        },
      ];

      const result = await runToolChain(chain, griefTools, ctx);

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Daily Engagement Journey
  // --------------------------------------------------------------------------

  describe('Daily Engagement Journey', () => {
    it('should complete morning check-in flow', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'morningSkyCheck',
          params: { mode: 'record-weather', weather: 'partly-cloudy', energy: 'medium' },
        },
        {
          toolId: 'questionOfTheWeek',
          params: { mode: 'get-question' },
        },
      ];

      const result = await runToolChain(chain, engagementTools, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should run wisdom engagement flow', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'paradoxOfTheDay',
          params: {},
        },
        {
          toolId: 'questionBeneath',
          params: { surfaceQuestion: 'Should I quit my job?' },
        },
      ];

      const result = await runToolChain(chain, engagementTools, ctx);

      expect(result.success).toBe(true);
    });

    it('should complete streak and celebration flow', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'streakTracker',
          params: { action: 'check' },
        },
        {
          toolId: 'celebrationMoment',
          params: { achievement: '30-day streak', scale: 'big', personaStyle: 'ferni' },
        },
      ];

      const result = await runToolChain(chain, engagementTools, ctx);

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Cross-Domain Journeys
  // --------------------------------------------------------------------------

  describe('Cross-Domain Journeys', () => {
    it('should handle career disappointment with emotional support', async () => {
      // Career rejection followed by grief processing
      const careerResult = await runToolChain(
        [
          {
            toolId: 'trackJobApplication',
            params: { action: 'update', company: 'Dream Job', status: 'rejected' },
            expectedInResult: ['rejection'],
          },
        ],
        careerTools,
        ctx
      );

      expect(careerResult.success).toBe(true);

      // Then grief support for the loss of the opportunity
      const griefResult = await runToolChain(
        [
          {
            toolId: 'acknowledgeLoss',
            params: { loss: 'the job opportunity I really wanted' },
            expectedInResult: ['real'],
          },
        ],
        griefTools,
        ctx
      );

      expect(griefResult.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling in Chains', () => {
    it('should report failed step correctly', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'clarifyCareerGoals',
          params: { timeHorizon: '1-year', clarity: 'vague' },
        },
        {
          toolId: 'nonExistentTool', // This should fail
          params: {},
        },
      ];

      const result = await runToolChain(chain, careerTools, ctx);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe(1);
      expect(result.error).toContain('Tool not found');
    });

    it('should preserve results from successful steps before failure', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'clarifyCareerGoals',
          params: { timeHorizon: '1-year', clarity: 'clear' },
        },
        {
          toolId: 'nonExistentTool',
          params: {},
        },
      ];

      const result = await runToolChain(chain, careerTools, ctx);

      expect(result.results.length).toBe(1); // First result should be preserved
    });
  });

  // --------------------------------------------------------------------------
  // Content Validation
  // --------------------------------------------------------------------------

  describe('Content Quality in Chains', () => {
    it('should maintain context quality across chain', async () => {
      const chain: ChainStep[] = [
        {
          toolId: 'processGrief',
          params: { lossType: 'death', whatWasLost: 'my grandmother', whereTheyAre: 'waves' },
        },
        {
          toolId: 'rememberLoved',
          params: {
            personName: 'Grandma Rose',
            relationship: 'grandmother',
            whatToRemember: 'their-essence',
          },
        },
      ];

      const result = await runToolChain(chain, griefTools, ctx);

      expect(result.success).toBe(true);

      // Ensure no placeholder text in any result
      for (const resultStr of result.results) {
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
        expect(resultStr).not.toContain('undefined');
      }
    });
  });
});
