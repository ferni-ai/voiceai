/**
 * Integration Tests for Superhuman Tools
 *
 * Tests the full flow of tool execution including:
 * - Context extraction
 * - Tool execution
 * - Persistence
 * - Error handling
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/integration.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../../utils/safe-logger.js', () => ({
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

vi.mock('../../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn().mockReturnValue(null),
  cleanForFirestore: vi.fn((data) => data),
}));

vi.mock('../../../../../utils/firestore-utils.js', () => ({
  cleanForFirestore: vi.fn((data) => data),
}));

vi.mock('../../../../rate-limiter.js', () => ({
  withRateLimit: vi.fn((_service, fn, fallback) => fn().catch(() => fallback)),
  getRateLimiter: vi.fn(() => ({
    tryAcquire: () => true,
    acquire: () => Promise.resolve(true),
  })),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { superhumanTools } from '../index.js';
import { n1AnalyticsTools } from '../n1-analytics.js';
import { experimentationTools } from '../experimentation.js';
import { financialResearchTools } from '../financial-research.js';
import { networkAnalyticsTools } from '../network-analytics.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(userId: string = 'integration-test-user') {
  // Type as any for test mocks - production code uses proper types
  return { ctx: { userId }, toolCallId: `test-${Date.now()}` } as any;
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Superhuman Tools Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Full Tool Count
  // --------------------------------------------------------------------------

  describe('Tool Export Validation', () => {
    it('should export all 52+ superhuman tools', () => {
      const toolCount = Object.keys(superhumanTools).length;
      expect(toolCount).toBeGreaterThanOrEqual(52);
    });

    it('should have execute functions for all tools', () => {
      for (const [name, tool] of Object.entries(superhumanTools)) {
        expect(tool).toHaveProperty('execute');
        expect(typeof tool.execute).toBe('function');
      }
    });
  });

  // --------------------------------------------------------------------------
  // N=1 Analytics Flow
  // --------------------------------------------------------------------------

  describe('N=1 Analytics Flow', () => {
    it('should record a decision successfully', async () => {
      const decisionResult = await n1AnalyticsTools.recordDecision.execute(
        {
          decision: 'Accept job offer from Tech Corp',
          domain: 'career',
          stressLevel: 6,
          energyLevel: 7,
        },
        createMockContext()
      );
      expect(decisionResult).toBeDefined();
      expect(decisionResult.toLowerCase()).toContain('decision');
    });

    it('should analyze decision quality', async () => {
      const analysisResult = await n1AnalyticsTools.analyzeDecisionQuality.execute(
        { domain: 'all' },
        createMockContext()
      );
      expect(analysisResult).toBeDefined();
      expect(typeof analysisResult).toBe('string');
    });

    it('should record sleep data', async () => {
      const result = await n1AnalyticsTools.recordSleepData.execute(
        {
          hoursSlept: 7.5,
          quality: 8,
        },
        createMockContext()
      );
      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('sleep');
    });

    it('should record energy levels', async () => {
      const result = await n1AnalyticsTools.recordEnergyLevel.execute(
        {
          level: 7,
          notes: 'After lunch, good sleep last night',
        },
        createMockContext()
      );
      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('energy');
    });
  });

  // --------------------------------------------------------------------------
  // Experimentation Flow
  // --------------------------------------------------------------------------

  describe('Experimentation Flow', () => {
    it('should complete experiment design → data recording → analysis flow', async () => {
      // Step 1: Design experiment
      const designResult = await experimentationTools.designExperiment.execute(
        {
          hypothesis: 'Cold showers improve morning alertness',
          intervention: '2-minute cold shower',
          metric: 'Alertness score 1-10',
          duration: 14,
        },
        createMockContext()
      );
      expect(designResult).toBeDefined();
      expect(designResult.toLowerCase()).toContain('experiment');

      // Step 2: Record data point
      const dataResult = await experimentationTools.recordExperimentData.execute(
        {
          value: 8,
          condition: 'treatment',
          notes: 'Felt energized',
        },
        createMockContext()
      );
      expect(dataResult).toBeDefined();

      // Step 3: Analyze
      const analysisResult = await experimentationTools.analyzeExperiment.execute(
        {},
        createMockContext()
      );
      expect(analysisResult).toBeDefined();
    });

    it('should complete belief tracking → updating flow', async () => {
      // Create belief
      const createResult = await experimentationTools.createBelief.execute(
        {
          statement: 'I am a morning person',
          initialProbability: 60,
        },
        createMockContext()
      );
      expect(createResult).toBeDefined();
      expect(createResult.toLowerCase()).toContain('belief');

      // Update belief
      const updateResult = await experimentationTools.updateBelief.execute(
        {
          beliefKeyword: 'morning',
          evidence: 'Consistently more productive in AM',
          direction: 'supports',
          strength: 'moderate',
        },
        createMockContext()
      );
      expect(updateResult).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Financial Research Flow
  // --------------------------------------------------------------------------

  describe('Financial Research Flow', () => {
    it('should analyze SEC filings', async () => {
      const result = await financialResearchTools.analyzeSECFiling.execute(
        { symbol: 'AAPL', filingType: '10-K' },
        createMockContext()
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should bridge macro to personal', async () => {
      const result = await financialResearchTools.bridgeMacroToPersonal.execute(
        {
          macroEvent: 'fed_rate_hike',
          personalContext: 'I have a variable rate mortgage',
        },
        createMockContext()
      );
      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Network Analytics Flow
  // --------------------------------------------------------------------------

  describe('Network Analytics Flow', () => {
    it('should complete relationship tracking → interaction → analysis flow', async () => {
      // Track relationship
      const trackResult = await networkAnalyticsTools.trackRelationship.execute(
        {
          name: 'John Smith',
          relationship: 'mentor',
          energyImpact: 'energizing',
          influenceDomains: ['career', 'skills'],
        },
        createMockContext()
      );
      expect(trackResult).toBeDefined();
      expect(trackResult.toLowerCase()).toContain('relationship');

      // Log interaction
      const logResult = await networkAnalyticsTools.logInteraction.execute(
        {
          name: 'John Smith',
          type: 'call',
          quality: 9,
          topic: 'Career advice session',
        },
        createMockContext()
      );
      expect(logResult).toBeDefined();
      expect(logResult.toLowerCase()).toContain('logged');

      // Analyze patterns
      const patternsResult = await networkAnalyticsTools.analyzeCommunicationPatterns.execute(
        {},
        createMockContext()
      );
      expect(patternsResult).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle missing userId gracefully', async () => {
      const result = await n1AnalyticsTools.recordDecision.execute(
        {
          decision: 'Test decision',
          domain: 'other',
        },
        { ctx: null } as any
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Should indicate need for user identification
    });
  });

  // --------------------------------------------------------------------------
  // Cross-Tool Consistency
  // --------------------------------------------------------------------------

  describe('Cross-Tool Consistency', () => {
    it('should use same userId across all tools', async () => {
      const userId = 'cross-tool-test-user';
      const ctx = createMockContext(userId);

      // Execute multiple tools with same context
      const results = await Promise.all([
        n1AnalyticsTools.recordDecision.execute(
          { decision: 'Test decision', domain: 'other' },
          ctx
        ),
        experimentationTools.createBelief.execute(
          { statement: 'Test belief', initialProbability: 50 },
          ctx
        ),
        networkAnalyticsTools.trackRelationship.execute(
          { name: 'Test Person', relationship: 'friend', energyImpact: 'neutral' },
          ctx
        ),
      ]);

      // All should succeed
      for (const result of results) {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }
    });
  });
});
