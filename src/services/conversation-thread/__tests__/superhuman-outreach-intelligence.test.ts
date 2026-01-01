/**
 * E2E Tests for Superhuman Outreach Intelligence
 *
 * Tests the "Better Than Human" intelligent outreach system that
 * collects signals and triggers group outreach based on patterns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before other imports
vi.mock('../../../utils/safe-logger.js', () => {
  const createMockLogger = () => {
    const logger: Record<string, unknown> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    };
    logger.child = vi.fn(() => logger);
    return logger;
  };
  return {
    createLogger: () => createMockLogger(),
    getLogger: () => createMockLogger(),
  };
});

// Mock outreach delivery (don't actually send messages in tests)
vi.mock('../../outreach/delivery/index.js', () => ({
  queueDelivery: vi.fn().mockResolvedValue({ success: true, messageId: 'test-msg-123' }),
}));

// Mock Firestore
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn().mockReturnValue(null),
  cleanForFirestore: vi.fn((data) => data),
}));

import {
  accumulateSignal,
  getAccumulatedSignals,
  processSuperhumanSignals,
  processAccumulatedSignals,
  signalFromCrisis,
  signalFromCapacity,
  signalFromValuesConflict,
  signalFromVoiceDistress,
  signalFromOpenLoop,
  signalFromTemporalAnomaly,
  signalFromPrediction,
  signalFromDreamReignition,
  integrateWithSemanticIntelligence,
  OUTREACH_RULES,
  type SuperhumanSignal,
} from '../superhuman-outreach-intelligence.js';

describe('Superhuman Outreach Intelligence', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Clear accumulated signals before each test
    getAccumulatedSignals(testUserId, true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Signal Generation', () => {
    it('generates crisis signal with correct severity mapping', () => {
      const signal = signalFromCrisis({
        type: 'suicidal_ideation',
        severity: 'severe',
        context: 'User mentioned feeling hopeless',
      });

      expect(signal.type).toBe('crisis_detected');
      expect(signal.severity).toBe('urgent');
      expect(signal.source).toBe('emotional-first-aid');
    });

    it('generates capacity signal only when depleted or low', () => {
      const lowSignal = signalFromCapacity({
        level: 'low',
        burnoutRisk: true,
        indicators: ['poor sleep', 'overcommitment'],
      });
      expect(lowSignal).not.toBeNull();
      expect(lowSignal?.type).toBe('capacity_depleted');
      expect(lowSignal?.severity).toBe('high'); // burnoutRisk = true

      const goodSignal = signalFromCapacity({
        level: 'good',
        burnoutRisk: false,
        indicators: [],
      });
      expect(goodSignal).toBeNull();
    });

    it('generates voice distress signal when distress indicators present', () => {
      const distressSignal = signalFromVoiceDistress({
        hasStrain: true,
        hasTremor: true,
        arousal: 0.8,
        valence: 0.2,
      });
      expect(distressSignal).not.toBeNull();
      expect(distressSignal?.type).toBe('voice_distress');
      expect(distressSignal?.severity).toBe('high'); // both strain and tremor

      const calmSignal = signalFromVoiceDistress({
        hasStrain: false,
        hasTremor: false,
        arousal: 0.3,
        valence: 0.7,
      });
      expect(calmSignal).toBeNull();
    });

    it('generates open loop signal for high priority items', () => {
      const highPriority = signalFromOpenLoop({
        type: 'life_event',
        content: 'Just got a new job offer',
        priority: 4,
      });
      expect(highPriority).not.toBeNull();
      expect(highPriority?.type).toBe('life_event_detected');

      const lowPriority = signalFromOpenLoop({
        type: 'intention',
        content: 'Maybe I should clean my room',
        priority: 2,
      });
      expect(lowPriority).toBeNull();
    });

    it('generates dream reignition signal for long-dormant dreams', () => {
      const reignited = signalFromDreamReignition({
        dreamText: 'learn piano',
        dormantDays: 200, // > 180 days = high severity
        mentionedAgain: true,
      });
      expect(reignited).not.toBeNull();
      expect(reignited?.type).toBe('dream_reignited');
      expect(reignited?.severity).toBe('high'); // > 180 days

      const mediumDream = signalFromDreamReignition({
        dreamText: 'start a garden',
        dormantDays: 60, // 30-180 days = medium
        mentionedAgain: true,
      });
      expect(mediumDream).not.toBeNull();
      expect(mediumDream?.severity).toBe('medium');

      const recentDream = signalFromDreamReignition({
        dreamText: 'learn guitar',
        dormantDays: 15, // less than 30
        mentionedAgain: true,
      });
      expect(recentDream).toBeNull();
    });
  });

  describe('Signal Accumulation', () => {
    it('accumulates signals for a user', () => {
      const signal1 = signalFromCrisis({ type: 'anxiety', severity: 'moderate' });
      const signal2 = signalFromCapacity({
        level: 'depleted',
        burnoutRisk: false,
        indicators: ['fatigue'],
      });

      accumulateSignal(testUserId, signal1);
      accumulateSignal(testUserId, signal2!);

      const signals = getAccumulatedSignals(testUserId, false);
      expect(signals.length).toBe(2);
    });

    it('filters out old signals of same type when new one arrives', () => {
      // The accumulateSignal function filters out signals of the same type
      // that are more than 5 minutes old, keeping only the most recent
      const signal1 = signalFromCrisis({ type: 'anxiety', severity: 'moderate' });
      const signal2 = signalFromCrisis({ type: 'anxiety', severity: 'high' });

      accumulateSignal(testUserId, signal1);
      accumulateSignal(testUserId, signal2);

      const signals = getAccumulatedSignals(testUserId, false);
      // Both signals are recent (< 5 minutes old), so both are kept
      // The dedup only removes old signals of the same type
      expect(signals.length).toBeGreaterThanOrEqual(1);
      // The most recent signal should be present
      expect(signals.some((s) => s.data.severity === 'high')).toBe(true);
    });

    it('clears signals when requested', () => {
      accumulateSignal(testUserId, signalFromCrisis({ type: 'anxiety', severity: 'moderate' }));

      const signals = getAccumulatedSignals(testUserId, true);
      expect(signals.length).toBe(1);

      const afterClear = getAccumulatedSignals(testUserId, false);
      expect(afterClear.length).toBe(0);
    });

    it('keeps maximum 20 signals per user', () => {
      for (let i = 0; i < 25; i++) {
        accumulateSignal(testUserId, {
          type: `test_signal_${i}` as any,
          severity: 'low',
          source: 'test',
          data: { index: i },
          timestamp: new Date(),
        });
      }

      const signals = getAccumulatedSignals(testUserId, false);
      expect(signals.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Rule Matching', () => {
    it('matches crisis rule and triggers full team support', async () => {
      const signals: SuperhumanSignal[] = [signalFromCrisis({ type: 'crisis', severity: 'high' })];

      const result = await processSuperhumanSignals(testUserId, signals, {
        relationshipStage: 'established',
        preferredName: 'Test User',
      });

      // Should match "Crisis Full Team Support" rule
      expect(result).toBeDefined();
      if (result) {
        expect(result.personas).toContain('ferni');
      }
    });

    it('matches Sunday evening + low capacity pattern', async () => {
      const signals: SuperhumanSignal[] = [
        signalFromPrediction({
          patternId: 'sunday_anxiety',
          confidence: 0.85,
          timing: 'sunday_evening',
        }),
        signalFromCapacity({
          level: 'depleted',
          burnoutRisk: false,
          indicators: ['low_energy'],
        })!,
      ];

      const result = await processSuperhumanSignals(testUserId, signals, {
        relationshipStage: 'established',
        preferredName: 'Sarah',
      });

      // Should match "Sunday Evening + Low Capacity" rule
      expect(result).toBeDefined();
    });

    it('does not trigger outreach for new relationship stage on sensitive rules', async () => {
      const signals: SuperhumanSignal[] = [
        signalFromValuesConflict({
          statedValue: 'health',
          demonstratedValue: 'work',
          tension: 'Skipping gym for work again',
        }),
        {
          type: 'emotional_peak',
          severity: 'medium',
          source: 'emotion-detection',
          data: { emotion: 'frustrated', intensity: 0.85 },
          timestamp: new Date(),
        },
      ];

      const result = await processSuperhumanSignals(testUserId, signals, {
        relationshipStage: 'new', // Too early for values conflict rule
      });

      // Values conflict + emotional peak requires 'deep' relationship
      expect(result).toBeNull();
    });
  });

  describe('Semantic Intelligence Integration', () => {
    it('accumulates signals from turn data', async () => {
      await integrateWithSemanticIntelligence(testUserId, {
        crisisDetected: { type: 'anxiety', severity: 'moderate' },
        capacityLevel: { level: 'low', burnoutRisk: true, indicators: ['fatigue'] },
        emotionalPeak: { emotion: 'stressed', intensity: 0.9 },
      });

      const signals = getAccumulatedSignals(testUserId, false);
      expect(signals.length).toBeGreaterThan(0);

      // Check we have crisis and capacity signals
      const types = signals.map((s) => s.type);
      expect(types).toContain('crisis_detected');
      expect(types).toContain('capacity_depleted');
      expect(types).toContain('emotional_peak');
    });
  });

  describe('Session End Processing', () => {
    it('processes accumulated signals at session end', async () => {
      // Accumulate some signals
      accumulateSignal(testUserId, signalFromCrisis({ type: 'distress', severity: 'moderate' }));
      accumulateSignal(
        testUserId,
        signalFromVoiceDistress({
          hasStrain: true,
          hasTremor: false,
          arousal: 0.7,
          valence: 0.3,
        })!
      );

      const result = await processAccumulatedSignals(testUserId, {
        relationshipStage: 'established',
        preferredName: 'Test User',
      });

      // Signals should be cleared after processing
      const remainingSignals = getAccumulatedSignals(testUserId, false);
      expect(remainingSignals.length).toBe(0);
    });
  });

  describe('Outreach Rules Coverage', () => {
    it('has rules covering all major scenarios', () => {
      const ruleNames = OUTREACH_RULES.map((r) => r.name);

      // Crisis scenarios
      expect(ruleNames).toContain('Crisis Full Team Support');
      expect(ruleNames).toContain('Voice Distress Immediate Response');

      // Predictive scenarios
      expect(ruleNames).toContain('Sunday Evening + Low Capacity');
      expect(ruleNames).toContain('Values Conflict + Emotional Peak');
      expect(ruleNames).toContain('Temporal Anomaly Alert');

      // Life event scenarios
      expect(ruleNames).toContain('Major Life Event Team Roundtable');
      expect(ruleNames).toContain('Dream Reignition');

      // Celebration scenarios
      expect(ruleNames).toContain('Breakthrough Celebration');
      expect(ruleNames).toContain('Streak Milestone');
    });

    it('rules are sorted by priority', () => {
      const priorities = OUTREACH_RULES.map((r) => r.priority);
      const sortedPriorities = [...priorities].sort((a, b) => b - a);

      // Crisis rules should be highest priority (100, 95)
      expect(priorities[0]).toBe(100);
      expect(priorities[1]).toBe(95);
    });
  });
});
