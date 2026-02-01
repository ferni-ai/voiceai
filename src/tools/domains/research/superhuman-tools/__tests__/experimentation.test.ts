/**
 * Personal Experimentation Framework Tools Tests
 *
 * Tests for A/B testing, Bayesian updating, and hypothesis tracking.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/experimentation.test.ts
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

vi.mock('../firestore-persistence.js', () => ({
  getUserIdFromContext: vi.fn((ctx) => {
    if (!ctx) return null;
    if (typeof ctx === 'object' && 'userId' in ctx) return ctx.userId;
    return null;
  }),
  saveExperiment: vi.fn().mockResolvedValue(undefined),
  loadExperiments: vi.fn().mockResolvedValue([]),
  saveBelief: vi.fn().mockResolvedValue(undefined),
  loadBeliefs: vi.fn().mockResolvedValue([]),
  saveHypothesis: vi.fn().mockResolvedValue(undefined),
  loadHypotheses: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { experimentationTools } from '../experimentation.js';
import * as persistence from '../firestore-persistence.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(userId: string = 'test-user-123') {
  // Type as any for test mocks - production code uses proper types
  return { ctx: { userId }, toolCallId: `test-${Date.now()}` } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Personal Experimentation Framework Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Availability
  // --------------------------------------------------------------------------

  describe('Tool Availability', () => {
    it('should export all expected tools', () => {
      expect(experimentationTools).toHaveProperty('designExperiment');
      expect(experimentationTools).toHaveProperty('recordExperimentData');
      expect(experimentationTools).toHaveProperty('analyzeExperiment');
      expect(experimentationTools).toHaveProperty('createBelief');
      expect(experimentationTools).toHaveProperty('updateBelief');
      expect(experimentationTools).toHaveProperty('trackHypothesis');
      expect(experimentationTools).toHaveProperty('updateHypothesis');
      expect(experimentationTools).toHaveProperty('detectConfounds');
      expect(experimentationTools).toHaveProperty('calculateEffectSize');
    });
  });

  // --------------------------------------------------------------------------
  // designExperiment
  // --------------------------------------------------------------------------

  describe('designExperiment', () => {
    it('should design a new experiment', async () => {
      // Correct parameters: hypothesis, intervention, metric, duration
      const params = {
        hypothesis: 'Cold showers increase morning alertness',
        intervention: '2-minute cold shower',
        metric: 'alertness score 1-10',
        duration: 30,
      };

      const result = await experimentationTools.designExperiment.execute(
        params,
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('experiment');
      expect(persistence.saveExperiment).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // recordExperimentData
  // --------------------------------------------------------------------------

  describe('recordExperimentData', () => {
    it('should record data for experiment', async () => {
      // Correct parameters: value, condition, notes (optional)
      const result = await experimentationTools.recordExperimentData.execute(
        {
          value: 8,
          condition: 'treatment' as const,
          notes: 'Felt good today',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeExperiment
  // --------------------------------------------------------------------------

  describe('analyzeExperiment', () => {
    it('should analyze experiment results', async () => {
      // No parameters needed
      const result = await experimentationTools.analyzeExperiment.execute({}, createMockContext());

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // createBelief
  // --------------------------------------------------------------------------

  describe('createBelief', () => {
    it('should create a new belief', async () => {
      // Correct parameters: statement, initialProbability
      const result = await experimentationTools.createBelief.execute(
        {
          statement: 'I am a morning person',
          initialProbability: 60,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('belief');
      expect(persistence.saveBelief).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // updateBelief (Bayesian)
  // --------------------------------------------------------------------------

  describe('updateBelief', () => {
    it('should update belief with new evidence', async () => {
      // Correct parameters: beliefKeyword, evidence, direction, strength
      const result = await experimentationTools.updateBelief.execute(
        {
          beliefKeyword: 'morning',
          evidence: 'Consistently performed better in morning meetings',
          direction: 'supports' as const,
          strength: 'moderate' as const,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // trackHypothesis
  // --------------------------------------------------------------------------

  describe('trackHypothesis', () => {
    it('should create new hypothesis', async () => {
      // Correct parameters: hypothesis, domain
      const result = await experimentationTools.trackHypothesis.execute(
        {
          hypothesis: 'Reducing screen time before bed improves sleep',
          domain: 'health' as const,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('hypothesis');
      expect(persistence.saveHypothesis).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // updateHypothesis
  // --------------------------------------------------------------------------

  describe('updateHypothesis', () => {
    it('should update hypothesis status', async () => {
      // Correct parameters: hypothesisKeyword, evidence (optional), newStatus (optional)
      const result = await experimentationTools.updateHypothesis.execute(
        {
          hypothesisKeyword: 'screen time',
          evidence: 'Consistent sleep improvement observed',
          newStatus: 'confirmed' as const,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // detectConfounds
  // --------------------------------------------------------------------------

  describe('detectConfounds', () => {
    it('should detect potential confounding variables', async () => {
      // Correct parameters: observation, domain
      const result = await experimentationTools.detectConfounds.execute(
        {
          observation: 'When I exercise, I sleep better',
          domain: 'health' as const,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('confound');
    });
  });

  // --------------------------------------------------------------------------
  // calculateEffectSize
  // --------------------------------------------------------------------------

  describe('calculateEffectSize', () => {
    it('should calculate effect size for experiment', async () => {
      // Correct parameters: beforeValues, afterValues, context
      const result = await experimentationTools.calculateEffectSize.execute(
        {
          beforeValues: [5, 6, 5, 6],
          afterValues: [8, 7, 8, 9],
          context: 'Focus score before and after cold showers',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('effect');
    });
  });
});
