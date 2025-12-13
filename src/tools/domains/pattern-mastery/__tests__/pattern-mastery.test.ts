/**
 * Pattern Mastery Domain Tools Tests (Peter John's Specialty)
 *
 * Tests for superhuman pattern recognition, cross-domain connections, and data insights.
 *
 * Run with: npx vitest run src/tools/domains/pattern-mastery/__tests__/pattern-mastery.test.ts
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
    agentId: 'peter-john',
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

// ============================================================================
// TESTS
// ============================================================================

describe('Pattern Mastery Domain Tools', () => {
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
    it('should load all pattern mastery tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      expect(toolDefinitions.length).toBe(6); // 6 tools defined
    });

    it('should have correct domain for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.domain).toBe('pattern-mastery');
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
      expect(toolIds).toContain('discoverPattern');
      expect(toolIds).toContain('crossDomainConnection');
      expect(toolIds).toContain('historicalParallel');
      expect(toolIds).toContain('dataStorytelling');
      expect(toolIds).toContain('counterIntuitiveInsight');
      expect(toolIds).toContain('patternPrediction');
    });
  });

  // --------------------------------------------------------------------------
  // discoverPattern Tool
  // --------------------------------------------------------------------------

  describe('discoverPattern', () => {
    it('should discover patterns in spending behavior', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'discoverPattern');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        dataType: 'spending',
        observation: 'You spend 40% more on weekends than weekdays',
        timeframe: 'the past 3 months',
      });

      expect(result).toContain('Pattern Discovered');
      expect(result).toContain('spending');
      expect(result).toContain('40%');
      expect(result).toContain('Why this matters');
    });

    it('should analyze mood patterns', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'discoverPattern');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        dataType: 'mood',
        observation: 'Your energy dips every Wednesday afternoon',
      });

      expect(result).toContain('mood');
      expect(result).toContain('Questions to explore');
    });

    it('should handle behavior patterns without timeframe', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'discoverPattern');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        dataType: 'behavior',
        observation: 'You tend to avoid difficult conversations after lunch',
      });

      expect(result).toContain('behavior');
      expect(result).not.toContain('undefined');
    });
  });

  // --------------------------------------------------------------------------
  // crossDomainConnection Tool
  // --------------------------------------------------------------------------

  describe('crossDomainConnection', () => {
    it('should find unexpected connections between life areas', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'crossDomainConnection');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        domainA: 'sleep quality',
        domainB: 'spending habits',
        connection: 'Poor sleep leads to 30% more impulse purchases',
      });

      expect(result).toContain('Unexpected Connection');
      expect(result).toContain('sleep quality');
      expect(result).toContain('spending habits');
      expect(result).toContain('Cross-domain patterns matter');
    });
  });

  // --------------------------------------------------------------------------
  // historicalParallel Tool
  // --------------------------------------------------------------------------

  describe('historicalParallel', () => {
    it('should provide historical perspective', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'historicalParallel');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        currentSituation: 'market volatility',
        parallel: 'The 2008 financial crisis showed similar patterns',
        lesson: 'Those who stayed invested recovered within 5 years',
      });

      expect(result).toContain('Historical Perspective');
      expect(result).toContain('market volatility');
      expect(result).toContain('2008');
      expect(result).toContain('history teaches');
    });
  });

  // --------------------------------------------------------------------------
  // dataStorytelling Tool
  // --------------------------------------------------------------------------

  describe('dataStorytelling', () => {
    it('should turn numbers into narratives', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'dataStorytelling');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        dataPoint: 'Your savings rate increased from 5% to 15%',
        humanMeaning: "You're building financial security for your family",
        trajectory: 'improving',
      });

      expect(result).toContain('Story in the Numbers');
      expect(result).toContain('15%');
      expect(result).toContain('upward');
    });

    it('should handle declining trajectories gracefully', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'dataStorytelling');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        dataPoint: 'Exercise frequency dropped 50% this month',
        humanMeaning: "Life got busy, and self-care took a back seat",
        trajectory: 'declining',
      });

      expect(result).toContain('downward');
      expect(result).toContain('reversible');
    });
  });

  // --------------------------------------------------------------------------
  // counterIntuitiveInsight Tool
  // --------------------------------------------------------------------------

  describe('counterIntuitiveInsight', () => {
    it('should reveal counter-intuitive truths', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'counterIntuitiveInsight');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        conventionalWisdom: 'More meetings mean better communication',
        actualTruth: 'Teams with fewer meetings show 35% higher productivity',
        topic: 'workplace productivity',
      });

      expect(result).toContain('Counter-Intuitive');
      expect(result).toContain('workplace productivity');
      expect(result).toContain('conventional wisdom gets it wrong');
    });
  });

  // --------------------------------------------------------------------------
  // patternPrediction Tool
  // --------------------------------------------------------------------------

  describe('patternPrediction', () => {
    it('should make high confidence predictions', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'patternPrediction');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        pattern: 'Your energy peaks at 9am every day',
        prediction: 'Scheduling important work for morning will boost output',
        confidence: 'high',
      });

      expect(result).toContain('Pattern-Based Outlook');
      expect(result).toContain('quite confident');
      expect(result).toContain('9am');
    });

    it('should handle speculative predictions with appropriate caveats', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'patternPrediction');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        pattern: 'Market showing unusual volume patterns',
        prediction: 'Volatility may increase in coming weeks',
        confidence: 'speculative',
        caveat: 'External events could change this quickly',
      });

      expect(result).toContain('Speculation mode');
      expect(result).toContain('holding it loosely');
      expect(result).toContain('What could change this');
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
          dataType: 'behavior',
          observation: 'test pattern',
          experience: 'test experience',
          dataPoint: 'test data',
          humanMeaning: 'test meaning',
          pattern: 'test pattern',
          prediction: 'test prediction',
          confidence: 'medium',
          conventionalWisdom: 'test wisdom',
          actualTruth: 'test truth',
          topic: 'test topic',
          currentSituation: 'test situation',
          parallel: 'test parallel',
          lesson: 'test lesson',
          domainA: 'test domain a',
          domainB: 'test domain b',
          connection: 'test connection',
        });

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
        expect(resultStr).not.toContain('undefined');
        expect(resultStr).not.toContain('[object Object]');
      }
    });
  });
});

