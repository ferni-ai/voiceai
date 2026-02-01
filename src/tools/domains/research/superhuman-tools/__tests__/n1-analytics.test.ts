/**
 * N=1 Personal Analytics Tools Tests
 *
 * Tests for decision tracking, sleep analysis, energy prediction,
 * and peak performance tools.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/n1-analytics.test.ts
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
  saveDecision: vi.fn().mockResolvedValue(undefined),
  loadDecisions: vi.fn().mockResolvedValue([]),
  updateDecision: vi.fn().mockResolvedValue(undefined),
  saveSleepData: vi.fn().mockResolvedValue(undefined),
  loadSleepData: vi.fn().mockResolvedValue([]),
  saveEnergyData: vi.fn().mockResolvedValue(undefined),
  loadEnergyData: vi.fn().mockResolvedValue([]),
  savePerformanceProfile: vi.fn().mockResolvedValue(undefined),
  loadPerformanceProfile: vi.fn().mockResolvedValue(null),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { n1AnalyticsTools } from '../n1-analytics.js';
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

describe('N=1 Personal Analytics Tools', () => {
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
      expect(n1AnalyticsTools).toHaveProperty('recordDecision');
      expect(n1AnalyticsTools).toHaveProperty('recordDecisionOutcome');
      expect(n1AnalyticsTools).toHaveProperty('analyzeDecisionQuality');
      expect(n1AnalyticsTools).toHaveProperty('recordSleepData');
      expect(n1AnalyticsTools).toHaveProperty('analyzeSleepCorrelations');
      expect(n1AnalyticsTools).toHaveProperty('recordEnergyLevel');
      expect(n1AnalyticsTools).toHaveProperty('predictEnergy');
      expect(n1AnalyticsTools).toHaveProperty('analyzePeakPerformance');
      expect(n1AnalyticsTools).toHaveProperty('calculateLifestyleImpact');
    });
  });

  // --------------------------------------------------------------------------
  // recordDecision
  // --------------------------------------------------------------------------

  describe('recordDecision', () => {
    it('should record a decision successfully', async () => {
      // recordDecision params: decision, domain, optional sleepHours/stressLevel/energyLevel/tags
      const params = {
        decision: 'Switch jobs to new company',
        domain: 'career' as const,
        stressLevel: 6,
        energyLevel: 7,
      };

      const result = await n1AnalyticsTools.recordDecision.execute(params, createMockContext());

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(50);
      expect(persistence.saveDecision).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // recordDecisionOutcome
  // --------------------------------------------------------------------------

  describe('recordDecisionOutcome', () => {
    it('should handle missing decision gracefully', async () => {
      vi.mocked(persistence.loadDecisions).mockResolvedValueOnce([]);

      // Correct params: decisionKeywords, wasReversed, satisfaction
      const result = await n1AnalyticsTools.recordDecisionOutcome.execute(
        {
          decisionKeywords: 'nonexistent job',
          wasReversed: false,
          satisfaction: 8,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should record outcome for existing decision', async () => {
      vi.mocked(persistence.loadDecisions).mockResolvedValueOnce([
        {
          id: 'dec-123',
          userId: 'test-user-123',
          timestamp: new Date(),
          decision: 'switch jobs',
          domain: 'career',
          context: { timeOfDay: 10, dayOfWeek: 1 },
          tags: ['career'],
        },
      ]);

      const result = await n1AnalyticsTools.recordDecisionOutcome.execute(
        {
          decisionKeywords: 'switch jobs',
          wasReversed: false,
          satisfaction: 9,
        },
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // analyzeDecisionQuality
  // --------------------------------------------------------------------------

  describe('analyzeDecisionQuality', () => {
    it('should handle no decisions gracefully', async () => {
      vi.mocked(persistence.loadDecisions).mockResolvedValueOnce([]);

      const result = await n1AnalyticsTools.analyzeDecisionQuality.execute(
        { domain: 'all' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // recordSleepData
  // --------------------------------------------------------------------------

  describe('recordSleepData', () => {
    it('should record sleep data successfully', async () => {
      const params = {
        hoursSlept: 7.5,
        quality: 8,
        bedtime: '22:30',
        wakeTime: '06:00',
        factors: ['quiet room', 'cool temperature'],
      };

      const result = await n1AnalyticsTools.recordSleepData.execute(params, createMockContext());

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('sleep');
      expect(persistence.saveSleepData).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // analyzeSleepCorrelations
  // --------------------------------------------------------------------------

  describe('analyzeSleepCorrelations', () => {
    it('should handle no sleep data gracefully', async () => {
      vi.mocked(persistence.loadSleepData).mockResolvedValueOnce([]);

      const result = await n1AnalyticsTools.analyzeSleepCorrelations.execute(
        {},
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // recordEnergyLevel
  // --------------------------------------------------------------------------

  describe('recordEnergyLevel', () => {
    it('should record energy level successfully', async () => {
      const params = {
        level: 7,
        time: '14:00',
        context: 'After lunch',
        factors: ['good sleep', 'light meal'],
      };

      const result = await n1AnalyticsTools.recordEnergyLevel.execute(params, createMockContext());

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('energy');
      expect(persistence.saveEnergyData).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // predictEnergy
  // --------------------------------------------------------------------------

  describe('predictEnergy', () => {
    it('should handle no energy data gracefully', async () => {
      vi.mocked(persistence.loadEnergyData).mockResolvedValueOnce([]);

      const result = await n1AnalyticsTools.predictEnergy.execute(
        { sleepLastNight: 7, calendarLoad: 'moderate' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // analyzePeakPerformance
  // --------------------------------------------------------------------------

  describe('analyzePeakPerformance', () => {
    it('should handle no performance data gracefully', async () => {
      vi.mocked(persistence.loadEnergyData).mockResolvedValueOnce([]);

      const result = await n1AnalyticsTools.analyzePeakPerformance.execute({}, createMockContext());

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // calculateLifestyleImpact
  // --------------------------------------------------------------------------

  describe('calculateLifestyleImpact', () => {
    it('should calculate lifestyle factor impact', async () => {
      // Correct params: change, type (enum), magnitude (enum)
      const result = await n1AnalyticsTools.calculateLifestyleImpact.execute(
        {
          change: 'Start exercising every morning',
          type: 'habit_add',
          magnitude: 'medium',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle different change types', async () => {
      const result = await n1AnalyticsTools.calculateLifestyleImpact.execute(
        {
          change: 'Cut out caffeine after 2pm',
          type: 'diet_change',
          magnitude: 'small',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });
});
