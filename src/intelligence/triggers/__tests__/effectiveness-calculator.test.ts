/**
 * Effectiveness Calculator Tests
 *
 * Phase 4: Effectiveness Learning
 *
 * Tests for engagement/deflection detection, effectiveness scoring,
 * and feedback loop protection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Configuration
  DEFAULT_EFFECTIVENESS_CONFIG,

  // Signal detection
  detectEngagementSignals,
  detectDeflectionSignals,

  // Session outcome tracking
  recordOutcomeEvent,
  getSessionOutcomes,
  clearSessionOutcomes,

  // Effectiveness calculation
  calculateEffectivenessFromEvents,
  calculateEffectivenessFromRecord,
  analyzeUserEffectiveness,

  // Trigger matching integration
  getEffectivenessMultiplier,
  applyEffectivenessToScore,

  // Analytics
  recordEffectivenessAnalytics,
  getEffectivenessAnalytics,
  resetEffectivenessAnalytics,

  // Types
  type TriggerOutcomeEvent,
  type EffectivenessConfig,
} from '../effectiveness-calculator.js';
import type { TriggerEffectiveness, UserTriggerProfile } from '../user-trigger-profile.types.js';

describe('Effectiveness Calculator', () => {
  beforeEach(() => {
    resetEffectivenessAnalytics();
  });

  // ============================================================================
  // SIGNAL DETECTION
  // ============================================================================

  describe('detectEngagementSignals', () => {
    const avgLength = 50;

    it('should detect longer_response when response exceeds threshold', () => {
      const longResponse =
        'This is a much longer response that goes into great detail about my feelings and experiences with this topic that we are discussing together.';
      const signals = detectEngagementSignals(longResponse, avgLength, [], 'emotions');

      expect(signals).toContain('longer_response');
    });

    it('should not detect longer_response for short responses', () => {
      const shortResponse = 'Yes, I agree.';
      const signals = detectEngagementSignals(shortResponse, avgLength, [], 'emotions');

      expect(signals).not.toContain('longer_response');
    });

    it('should detect deeper_topic when going deeper', () => {
      const response =
        'To be honest, I feel like this is really important because I realized something about myself.';
      const signals = detectEngagementSignals(response, avgLength, ['weather'], 'emotions');

      expect(signals).toContain('deeper_topic');
    });

    it('should detect emotional_expression', () => {
      const response = 'I feel really happy about this, it makes me excited for the future.';
      const signals = detectEngagementSignals(response, avgLength, [], 'emotions');

      expect(signals).toContain('emotional_expression');
    });

    it('should detect question_asked', () => {
      const response = 'What do you think I should do next?';
      const signals = detectEngagementSignals(response, avgLength, [], 'advice');

      expect(signals).toContain('question_asked');
    });

    it('should detect gratitude_expressed', () => {
      const response = 'Thank you so much, that really helps me understand.';
      const signals = detectEngagementSignals(response, avgLength, [], 'support');

      expect(signals).toContain('gratitude_expressed');
    });

    it('should detect vulnerability_shared', () => {
      const response =
        "I haven't told anyone this before, but I've been scared to admit how I really feel.";
      const signals = detectEngagementSignals(response, avgLength, [], 'emotions');

      expect(signals).toContain('vulnerability_shared');
    });

    it('should detect continuation_requested', () => {
      const response = 'Tell me more about that, I would like to understand better.';
      const signals = detectEngagementSignals(response, avgLength, [], 'learning');

      expect(signals).toContain('continuation_requested');
    });

    it('should detect multiple signals in one response', () => {
      const response =
        "Thank you for asking. I feel like I haven't told anyone this, but I've been really struggling. Tell me more about how I can improve?";
      const signals = detectEngagementSignals(response, avgLength, [], 'emotions');

      expect(signals).toContain('emotional_expression');
      expect(signals).toContain('gratitude_expressed');
      expect(signals).toContain('vulnerability_shared');
      expect(signals).toContain('question_asked');
      expect(signals).toContain('continuation_requested');
    });
  });

  describe('detectDeflectionSignals', () => {
    const avgLength = 50;

    it('should detect topic_change with transition phrases', () => {
      const response = 'Anyway, lets talk about something else.';
      const signals = detectDeflectionSignals(response, avgLength, 'emotions', 'weather', null);

      expect(signals).toContain('topic_change');
    });

    it('should detect short_response', () => {
      const response = 'Ok.';
      const signals = detectDeflectionSignals(response, avgLength, 'emotions', 'emotions', null);

      expect(signals).toContain('short_response');
    });

    it('should detect minimization', () => {
      const response = "It's fine, doesn't matter really, I'm okay.";
      const signals = detectDeflectionSignals(response, avgLength, 'emotions', 'emotions', null);

      expect(signals).toContain('minimization');
    });

    it('should detect deflection_phrase', () => {
      const response = 'Never mind about that, forget it.';
      const signals = detectDeflectionSignals(response, avgLength, 'emotions', 'emotions', null);

      expect(signals).toContain('deflection_phrase');
    });

    it('should detect dismissive_tone for very short responses', () => {
      const response = 'Yeah';
      const signals = detectDeflectionSignals(response, avgLength, 'emotions', 'emotions', null);

      expect(signals).toContain('dismissive_tone');
    });

    it('should detect session_ended when session ends within 2 minutes', () => {
      const response = 'Sure, sounds good.';
      const signals = detectDeflectionSignals(response, avgLength, 'planning', 'planning', 1.5);

      expect(signals).toContain('session_ended');
    });

    it('should not detect session_ended when session continues', () => {
      const response = 'Sure, sounds good.';
      const signals = detectDeflectionSignals(response, avgLength, 'planning', 'planning', 10);

      expect(signals).not.toContain('session_ended');
    });

    it('should detect multiple deflection signals', () => {
      const response = "It's fine, anyway...";
      const signals = detectDeflectionSignals(response, avgLength, 'emotions', 'weather', 1);

      expect(signals).toContain('minimization');
      expect(signals).toContain('topic_change');
      expect(signals).toContain('session_ended');
    });
  });

  // ============================================================================
  // SESSION OUTCOME TRACKING
  // ============================================================================

  describe('Session Outcome Tracking', () => {
    const sessionId = 'test_session_1';

    beforeEach(() => {
      clearSessionOutcomes(sessionId);
    });

    it('should record and retrieve outcome events', () => {
      const event: TriggerOutcomeEvent = {
        triggerName: 'gentle_check_in',
        triggerCategory: 'emotional',
        timestamp: new Date(),
        response: 'engaged',
        engagementSignals: ['longer_response', 'emotional_expression'],
        deflectionSignals: [],
        sentimentBefore: 0.4,
        sentimentAfter: 0.7,
        contextTags: ['evening', 'weekday'],
      };

      recordOutcomeEvent(sessionId, event);
      const outcomes = getSessionOutcomes(sessionId);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].triggerName).toBe('gentle_check_in');
      expect(outcomes[0].response).toBe('engaged');
    });

    it('should record multiple events in a session', () => {
      const event1: TriggerOutcomeEvent = {
        triggerName: 'trigger_1',
        triggerCategory: 'emotional',
        timestamp: new Date(),
        response: 'engaged',
        engagementSignals: [],
        deflectionSignals: [],
        contextTags: [],
      };
      const event2: TriggerOutcomeEvent = {
        triggerName: 'trigger_2',
        triggerCategory: 'behavioral',
        timestamp: new Date(),
        response: 'deflected',
        engagementSignals: [],
        deflectionSignals: ['minimization'],
        contextTags: [],
      };

      recordOutcomeEvent(sessionId, event1);
      recordOutcomeEvent(sessionId, event2);
      const outcomes = getSessionOutcomes(sessionId);

      expect(outcomes).toHaveLength(2);
    });

    it('should clear session outcomes', () => {
      const event: TriggerOutcomeEvent = {
        triggerName: 'test',
        triggerCategory: 'test',
        timestamp: new Date(),
        response: 'neutral',
        engagementSignals: [],
        deflectionSignals: [],
        contextTags: [],
      };

      recordOutcomeEvent(sessionId, event);
      expect(getSessionOutcomes(sessionId)).toHaveLength(1);

      clearSessionOutcomes(sessionId);
      expect(getSessionOutcomes(sessionId)).toHaveLength(0);
    });

    it('should return empty array for unknown session', () => {
      const outcomes = getSessionOutcomes('unknown_session');
      expect(outcomes).toHaveLength(0);
    });
  });

  // ============================================================================
  // EFFECTIVENESS CALCULATION
  // ============================================================================

  describe('calculateEffectivenessFromEvents', () => {
    it('should return neutral score with insufficient data', () => {
      const events: TriggerOutcomeEvent[] = [
        createOutcomeEvent('test_trigger', 'engaged'),
        createOutcomeEvent('test_trigger', 'engaged'),
      ];

      const result = calculateEffectivenessFromEvents('test_trigger', events);

      expect(result.rawScore).toBe(0.5);
      expect(result.confidence).toBe(0);
      expect(result.multiplier).toBe(1.0);
      expect(result.observationsInWindow).toBe(2);
    });

    it('should calculate high effectiveness for engaged responses', () => {
      const events: TriggerOutcomeEvent[] = Array.from({ length: 10 }, () =>
        createOutcomeEvent('good_trigger', 'engaged', 0.4, 0.7)
      );

      const result = calculateEffectivenessFromEvents('good_trigger', events);

      expect(result.rawScore).toBeGreaterThan(0.6);
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.multiplier).toBeGreaterThan(1.0);
    });

    it('should calculate low effectiveness for deflected responses', () => {
      const events: TriggerOutcomeEvent[] = Array.from({ length: 10 }, () =>
        createOutcomeEvent('bad_trigger', 'deflected', 0.5, 0.3)
      );

      const result = calculateEffectivenessFromEvents('bad_trigger', events);

      expect(result.rawScore).toBeLessThan(0.5);
      expect(result.multiplier).toBeLessThan(1.0);
    });

    it('should weight engagement, sentiment, and session impact', () => {
      const config: EffectivenessConfig = {
        ...DEFAULT_EFFECTIVENESS_CONFIG,
        engagementWeight: 0.5,
        sentimentWeight: 0.3,
        sessionImpactWeight: 0.2,
      };

      // All engaged, positive sentiment shift
      const events = Array.from({ length: 10 }, () =>
        createOutcomeEvent('weighted_trigger', 'engaged', 0.3, 0.8, 5, 15)
      );

      const result = calculateEffectivenessFromEvents('weighted_trigger', events, config);

      // Should have high score due to all positive signals
      expect(result.rawScore).toBeGreaterThan(0.7);
      expect(result.components.engagementRate).toBe(1.0);
      expect(result.components.avgSentimentShift).toBe(0.5);
      expect(result.components.avgSessionImpact).toBeGreaterThan(0);
    });

    it('should filter events outside rolling window', () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      const events: TriggerOutcomeEvent[] = [
        // Old events (outside 30-day window)
        ...Array.from({ length: 5 }, () =>
          createOutcomeEvent('window_trigger', 'engaged', 0.4, 0.8, undefined, undefined, oldDate)
        ),
        // Recent events
        ...Array.from({ length: 5 }, () =>
          createOutcomeEvent('window_trigger', 'deflected', 0.6, 0.3, undefined, undefined, now)
        ),
      ];

      const result = calculateEffectivenessFromEvents('window_trigger', events);

      // Should only consider recent (deflected) events
      expect(result.observationsInWindow).toBe(5);
      expect(result.rawScore).toBeLessThan(0.5);
    });

    it('should track best and worst contexts', () => {
      const events: TriggerOutcomeEvent[] = [
        createOutcomeEvent(
          'context_trigger',
          'engaged',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          ['evening', 'weekend']
        ),
        createOutcomeEvent(
          'context_trigger',
          'engaged',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          ['evening', 'weekend']
        ),
        createOutcomeEvent(
          'context_trigger',
          'engaged',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          ['evening']
        ),
        createOutcomeEvent(
          'context_trigger',
          'deflected',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          ['morning', 'weekday']
        ),
        createOutcomeEvent(
          'context_trigger',
          'deflected',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          ['morning', 'weekday']
        ),
        createOutcomeEvent(
          'context_trigger',
          'deflected',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          ['morning']
        ),
      ];

      const result = calculateEffectivenessFromEvents('context_trigger', events);

      expect(result.bestContexts).toContain('evening');
      expect(result.worstContexts).toContain('morning');
    });
  });

  describe('calculateEffectivenessFromRecord', () => {
    it('should convert TriggerEffectiveness record to result', () => {
      const record: TriggerEffectiveness = {
        triggerName: 'test_trigger',
        timesFired: 10,
        positiveEngagements: 7,
        negativeEngagements: 2,
        explicitAppreciation: 1,
        effectivenessScore: 0.7,
        lastUsed: new Date(),
        effectiveContexts: ['evening'],
        ineffectiveContexts: ['morning'],
      };

      const result = calculateEffectivenessFromRecord(record);

      expect(result.triggerName).toBe('test_trigger');
      expect(result.rawScore).toBe(0.7);
      expect(result.confidence).toBe(0.5); // 10/20
      expect(result.multiplier).toBeGreaterThan(1.0);
      expect(result.bestContexts).toContain('evening');
    });

    it('should return neutral for insufficient observations', () => {
      const record: TriggerEffectiveness = {
        triggerName: 'new_trigger',
        timesFired: 2,
        positiveEngagements: 2,
        negativeEngagements: 0,
        explicitAppreciation: 0,
        effectivenessScore: 1.0,
        lastUsed: new Date(),
        effectiveContexts: [],
        ineffectiveContexts: [],
      };

      const result = calculateEffectivenessFromRecord(record);

      expect(result.rawScore).toBe(0.5);
      expect(result.confidence).toBe(0);
      expect(result.multiplier).toBe(1.0);
    });
  });

  describe('analyzeUserEffectiveness', () => {
    it('should analyze all triggers in profile', () => {
      const profile = createMockProfile([
        { name: 'good_trigger', score: 0.8, fired: 15 },
        { name: 'bad_trigger', score: 0.2, fired: 12 },
        { name: 'neutral_trigger', score: 0.5, fired: 8 },
      ]);

      const analysis = analyzeUserEffectiveness(profile);

      expect(analysis.triggerResults).toHaveLength(3);
      expect(analysis.triggersToBoost).toContain('good_trigger');
      // Due to 8% exploration rate, bad_trigger may be in triggersToExplore instead of triggersToSuppress
      // A trigger with score 0.2 (below suppressionThreshold of 0.35) should be either suppressed or explored
      const isSuppressed = analysis.triggersToSuppress.includes('bad_trigger');
      const isExplored = analysis.triggersToExplore.includes('bad_trigger');
      expect(isSuppressed || isExplored).toBe(true);
    });

    it('should calculate overall confidence', () => {
      const profile = createMockProfile([
        { name: 'trigger_1', score: 0.6, fired: 20 },
        { name: 'trigger_2', score: 0.5, fired: 10 },
      ]);

      const analysis = analyzeUserEffectiveness(profile);

      expect(analysis.overallConfidence).toBeGreaterThan(0);
      expect(analysis.overallConfidence).toBeLessThanOrEqual(1);
    });

    it('should identify triggers for exploration', () => {
      // With 8% exploration rate, some low-effectiveness triggers should be explored
      // Run multiple times to test probability
      let exploredCount = 0;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const profile = createMockProfile([{ name: 'low_trigger', score: 0.1, fired: 10 }]);
        const analysis = analyzeUserEffectiveness(profile);
        if (analysis.triggersToExplore.length > 0) {
          exploredCount++;
        }
      }

      // Should explore roughly 8% of the time
      expect(exploredCount).toBeGreaterThan(0);
      expect(exploredCount).toBeLessThan(25); // Allow some variance
    });
  });

  // ============================================================================
  // TRIGGER MATCHING INTEGRATION
  // ============================================================================

  describe('getEffectivenessMultiplier', () => {
    it('should return neutral for unknown trigger', () => {
      const profile = createMockProfile([]);
      const result = getEffectivenessMultiplier('unknown_trigger', profile);

      expect(result.multiplier).toBe(1.0);
      expect(result.confidence).toBe(0);
      expect(result.shouldExplore).toBe(false);
    });

    it('should return boost multiplier for effective trigger', () => {
      const profile = createMockProfile([{ name: 'effective_trigger', score: 0.8, fired: 15 }]);

      const result = getEffectivenessMultiplier('effective_trigger', profile);

      expect(result.multiplier).toBeGreaterThan(1.0);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return suppression multiplier for ineffective trigger', () => {
      const profile = createMockProfile([{ name: 'ineffective_trigger', score: 0.2, fired: 15 }]);

      const result = getEffectivenessMultiplier('ineffective_trigger', profile);

      expect(result.multiplier).toBeLessThan(1.0);
      expect(result.multiplier).toBeGreaterThanOrEqual(0.5); // Min floor
    });
  });

  describe('applyEffectivenessToScore', () => {
    it('should boost score for effective triggers', () => {
      const profile = createMockProfile([{ name: 'good_trigger', score: 0.85, fired: 20 }]);

      const result = applyEffectivenessToScore(0.7, 'good_trigger', profile);

      expect(result.adjustedScore).toBeGreaterThan(0.7);
      expect(result.multiplierApplied).toBeGreaterThan(1.0);
    });

    it('should suppress score for ineffective triggers', () => {
      const profile = createMockProfile([{ name: 'bad_trigger', score: 0.2, fired: 20 }]);

      const result = applyEffectivenessToScore(0.7, 'bad_trigger', profile);

      expect(result.adjustedScore).toBeLessThan(0.7);
      expect(result.multiplierApplied).toBeLessThan(1.0);
    });

    it('should cap score between 0 and 1', () => {
      const profile = createMockProfile([{ name: 'very_good', score: 0.95, fired: 20 }]);

      const result = applyEffectivenessToScore(0.9, 'very_good', profile);

      expect(result.adjustedScore).toBeLessThanOrEqual(1.0);
      expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
    });

    it('should return neutral for unknown trigger', () => {
      const profile = createMockProfile([]);

      const result = applyEffectivenessToScore(0.7, 'unknown', profile);

      expect(result.adjustedScore).toBe(0.7);
      expect(result.multiplierApplied).toBe(1.0);
      expect(result.wasExplored).toBe(false);
    });
  });

  // ============================================================================
  // FEEDBACK LOOP PROTECTION
  // ============================================================================

  describe('Feedback Loop Protection', () => {
    it('should never suppress below minimum multiplier', () => {
      const profile = createMockProfile([{ name: 'terrible_trigger', score: 0.01, fired: 50 }]);

      const result = getEffectivenessMultiplier('terrible_trigger', profile);

      expect(result.multiplier).toBeGreaterThanOrEqual(DEFAULT_EFFECTIVENESS_CONFIG.minMultiplier);
    });

    it('should never boost above maximum multiplier', () => {
      const profile = createMockProfile([{ name: 'perfect_trigger', score: 0.99, fired: 50 }]);

      const result = getEffectivenessMultiplier('perfect_trigger', profile);

      expect(result.multiplier).toBeLessThanOrEqual(DEFAULT_EFFECTIVENESS_CONFIG.maxMultiplier);
    });

    it('should allow exploration of suppressed triggers', () => {
      // Test that exploration sometimes happens for low-scoring triggers
      let explorationOccurred = false;

      for (let i = 0; i < 200; i++) {
        const profile = createMockProfile([{ name: `low_trigger_${i}`, score: 0.1, fired: 20 }]);
        const result = getEffectivenessMultiplier(`low_trigger_${i}`, profile);
        if (result.shouldExplore) {
          explorationOccurred = true;
          break;
        }
      }

      expect(explorationOccurred).toBe(true);
    });

    it('should apply confidence scaling to multiplier', () => {
      // Low confidence should bring multiplier closer to 1.0
      const lowConfidenceProfile = createMockProfile([
        { name: 'new_trigger', score: 0.9, fired: 4 },
      ]);

      const highConfidenceProfile = createMockProfile([
        { name: 'old_trigger', score: 0.9, fired: 20 },
      ]);

      const lowResult = getEffectivenessMultiplier('new_trigger', lowConfidenceProfile);
      const highResult = getEffectivenessMultiplier('old_trigger', highConfidenceProfile);

      // Low confidence should have multiplier closer to 1.0
      expect(Math.abs(lowResult.multiplier - 1.0)).toBeLessThan(
        Math.abs(highResult.multiplier - 1.0)
      );
    });
  });

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  describe('Effectiveness Analytics', () => {
    it('should track analysis counts', () => {
      const profile = createMockProfile([
        { name: 'trigger_1', score: 0.8, fired: 10 },
        { name: 'trigger_2', score: 0.3, fired: 10 },
      ]);

      const analysis = analyzeUserEffectiveness(profile);
      recordEffectivenessAnalytics(analysis);

      const analytics = getEffectivenessAnalytics();

      expect(analytics.totalUsersAnalyzed).toBe(1);
      expect(analytics.totalTriggersTracked).toBe(2);
    });

    it('should track boost and suppression thresholds', () => {
      const profile = createMockProfile([
        { name: 'good', score: 0.8, fired: 10 },
        { name: 'bad', score: 0.2, fired: 10 },
      ]);

      const analysis = analyzeUserEffectiveness(profile);
      recordEffectivenessAnalytics(analysis);

      const analytics = getEffectivenessAnalytics();

      expect(analytics.triggersAboveBoostThreshold).toBe(1);
      expect(analytics.triggersBelowSuppressionThreshold).toBe(1);
    });

    it('should reset analytics', () => {
      const profile = createMockProfile([{ name: 'test', score: 0.5, fired: 10 }]);
      const analysis = analyzeUserEffectiveness(profile);
      recordEffectivenessAnalytics(analysis);

      resetEffectivenessAnalytics();
      const analytics = getEffectivenessAnalytics();

      expect(analytics.totalUsersAnalyzed).toBe(0);
      expect(analytics.totalTriggersTracked).toBe(0);
    });

    it('should track top and worst performing triggers', () => {
      // Analyze multiple users with same triggers
      for (let i = 0; i < 3; i++) {
        const profile = createMockProfile([
          { name: 'star_trigger', score: 0.9, fired: 10 },
          { name: 'poor_trigger', score: 0.1, fired: 10 },
        ]);
        const analysis = analyzeUserEffectiveness(profile);
        recordEffectivenessAnalytics(analysis);
      }

      const analytics = getEffectivenessAnalytics();

      expect(analytics.topPerformingTriggers.length).toBeGreaterThan(0);
      expect(analytics.worstPerformingTriggers.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createOutcomeEvent(
  triggerName: string,
  response: 'engaged' | 'deflected' | 'neutral' | 'appreciated',
  sentimentBefore?: number,
  sentimentAfter?: number,
  sessionDurationBefore?: number,
  sessionDurationAfter?: number,
  timestamp?: Date,
  contextTags: string[] = []
): TriggerOutcomeEvent {
  return {
    triggerName,
    triggerCategory: 'emotional',
    timestamp: timestamp ?? new Date(),
    response,
    engagementSignals: response === 'engaged' ? ['longer_response'] : [],
    deflectionSignals: response === 'deflected' ? ['minimization'] : [],
    sentimentBefore,
    sentimentAfter,
    sessionDurationBefore,
    sessionDurationAfter,
    contextTags,
  };
}

function createMockProfile(
  triggers: Array<{ name: string; score: number; fired: number }>
): UserTriggerProfile {
  return {
    userId: 'test_user',
    createdAt: new Date(),
    updatedAt: new Date(),
    schemaVersion: 3,
    significantDates: [],
    relationships: [],
    communicationPatterns: {
      phrasePatterns: [],
      sensitiveTopics: [],
      temporalPatterns: [],
    },
    triggerEffectiveness: triggers.map((t) => ({
      triggerName: t.name,
      timesFired: t.fired,
      positiveEngagements: Math.round(t.score * t.fired),
      negativeEngagements: Math.round((1 - t.score) * t.fired * 0.5),
      explicitAppreciation: Math.round(t.score * t.fired * 0.2),
      effectivenessScore: t.score,
      lastUsed: new Date(),
      effectiveContexts: [],
      ineffectiveContexts: [],
    })),
    conversationsAnalyzed: 10,
    profileConfidence: 0.7,
  };
}
