/**
 * Rapport Scorer Tests
 *
 * Tests conversational health scoring, trend detection, and repair strategies.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getActiveRapportScorerCount,
  getRapportScorer,
  RAPPORT_CONFIG,
  RapportScorer,
  resetRapportScorer,
} from '../rapport-scorer.js';
import { selectRepairStrategy, getAvailableStrategies } from '../repair-strategies.js';
import type { TurnObservation, RepairState, RapportScore } from '../types.js';

describe('RapportScorer', () => {
  const testSessionId = 'test-session-123';

  // Helper to create turn observations
  function createObservation(overrides: Partial<TurnObservation> = {}): TurnObservation {
    return {
      turnNumber: 1,
      timestamp: Date.now(),
      ...overrides,
    };
  }

  beforeEach(() => {
    resetRapportScorer(testSessionId);
  });

  afterEach(() => {
    resetRapportScorer(testSessionId);
  });

  describe('Scorer Lifecycle', () => {
    it('creates a new scorer for a session', () => {
      const scorer = getRapportScorer(testSessionId);
      expect(scorer).toBeDefined();
      expect(scorer).toBeInstanceOf(RapportScorer);
    });

    it('returns the same scorer for the same session', () => {
      const scorer1 = getRapportScorer(testSessionId);
      const scorer2 = getRapportScorer(testSessionId);
      expect(scorer1).toBe(scorer2);
    });

    it('creates different scorers for different sessions', () => {
      const scorer1 = getRapportScorer('session-1');
      const scorer2 = getRapportScorer('session-2');
      expect(scorer1).not.toBe(scorer2);

      // Cleanup
      resetRapportScorer('session-1');
      resetRapportScorer('session-2');
    });

    it('resets scorer state', () => {
      const scorer = getRapportScorer(testSessionId);

      // Build up some state
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'medium',
              userAskedQuestion: true,
              userElaborated: false,
              userIntroducedTopic: false,
              userShowedEmotion: false,
            },
          })
        );
      }

      expect(scorer.getState().observationCount).toBeGreaterThan(0);

      // Reset
      scorer.reset();

      expect(scorer.getState().observationCount).toBe(0);
      expect(scorer.getState().scoreHistory).toHaveLength(0);
    });

    it('tracks active scorer count', () => {
      resetRapportScorer('session-a');
      resetRapportScorer('session-b');

      const initialCount = getActiveRapportScorerCount();

      getRapportScorer('session-a');
      expect(getActiveRapportScorerCount()).toBe(initialCount + 1);

      getRapportScorer('session-b');
      expect(getActiveRapportScorerCount()).toBe(initialCount + 2);

      resetRapportScorer('session-a');
      expect(getActiveRapportScorerCount()).toBe(initialCount + 1);

      resetRapportScorer('session-b');
      expect(getActiveRapportScorerCount()).toBe(initialCount);
    });
  });

  describe('Score Calculation', () => {
    it('returns initial score in good range', () => {
      const scorer = getRapportScorer(testSessionId);
      const score = scorer.getCurrentScore();

      // Initial score should be decent (signals start neutral-good)
      expect(score.score).toBeGreaterThan(50);
      expect(score.score).toBeLessThan(90);
      expect(['good', 'needs_attention']).toContain(score.level);
    });

    it('has all signal contributions', () => {
      const scorer = getRapportScorer(testSessionId);
      const score = scorer.getCurrentScore();

      expect(score.signals).toHaveLength(6);

      const signalNames = score.signals.map((s) => s.name);
      expect(signalNames).toContain('turnBalance');
      expect(signalNames).toContain('interruptionQuality');
      expect(signalNames).toContain('engagement');
      expect(signalNames).toContain('emotionalAlignment');
      expect(signalNames).toContain('flowContinuity');
      expect(signalNames).toContain('trustSignals');
    });

    it('weights sum to 100', () => {
      const weights = RAPPORT_CONFIG.WEIGHTS;
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('Turn Balance Signal', () => {
    it('scores well for balanced conversation', () => {
      const scorer = getRapportScorer(testSessionId);

      // Balanced: agent 40%, user 60%
      scorer.recordObservation(
        createObservation({
          turnBalance: {
            agentWordCount: 40,
            userWordCount: 60,
            agentTalkTimeMs: 4000,
            userTalkTimeMs: 6000,
          },
        })
      );

      const state = scorer.getState();
      const turnBalanceSignal = state.currentScore.signals.find((s) => s.name === 'turnBalance');
      expect(turnBalanceSignal?.value).toBeGreaterThan(0.7);
    });

    it('scores poorly when agent dominates', () => {
      const scorer = getRapportScorer(testSessionId);

      // Agent dominates: 80%
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            turnBalance: {
              agentWordCount: 80,
              userWordCount: 20,
              agentTalkTimeMs: 8000,
              userTalkTimeMs: 2000,
            },
          })
        );
      }

      const state = scorer.getState();
      const turnBalanceSignal = state.currentScore.signals.find((s) => s.name === 'turnBalance');
      expect(turnBalanceSignal?.value).toBeLessThan(0.5);
    });
  });

  describe('Engagement Signal', () => {
    it('increases with high engagement behaviors', () => {
      const scorer = getRapportScorer(testSessionId);

      const initialScore = scorer.getCurrentScore();
      const initialEngagement =
        initialScore.signals.find((s) => s.name === 'engagement')?.value ?? 0;

      // High engagement turn
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'long',
              userAskedQuestion: true,
              userElaborated: true,
              userIntroducedTopic: true,
              userShowedEmotion: true,
            },
          })
        );
      }

      const newScore = scorer.getCurrentScore();
      const newEngagement = newScore.signals.find((s) => s.name === 'engagement')?.value ?? 0;

      expect(newEngagement).toBeGreaterThan(initialEngagement);
    });

    it('decreases with low engagement', () => {
      const scorer = getRapportScorer(testSessionId);

      // Low engagement turns
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'short',
              userAskedQuestion: false,
              userElaborated: false,
              userIntroducedTopic: false,
              userShowedEmotion: false,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      const engagement = score.signals.find((s) => s.name === 'engagement')?.value ?? 0;

      // With short responses and no engagement signals, should be low
      expect(engagement).toBeLessThan(0.5);
    });
  });

  describe('Emotional Alignment Signal', () => {
    it('increases when emotions are aligned', () => {
      const scorer = getRapportScorer(testSessionId);

      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            emotionalAlignment: {
              userEmotion: 'happy',
              agentEmotion: 'happy',
              isAligned: true,
              userEnergy: 0.7,
              agentEnergy: 0.7,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      const alignment = score.signals.find((s) => s.name === 'emotionalAlignment')?.value ?? 0;

      expect(alignment).toBeGreaterThan(0.7);
    });

    it('decreases when emotions are misaligned', () => {
      const scorer = getRapportScorer(testSessionId);

      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            emotionalAlignment: {
              userEmotion: 'sad',
              agentEmotion: 'happy',
              isAligned: false,
              userEnergy: 0.3,
              agentEnergy: 0.9,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      const alignment = score.signals.find((s) => s.name === 'emotionalAlignment')?.value ?? 0;

      expect(alignment).toBeLessThan(0.5);
    });
  });

  describe('Trust Signals', () => {
    it('increases with positive trust behaviors', () => {
      const scorer = getRapportScorer(testSessionId);

      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            trustSignals: {
              userDisclosed: true,
              userShowedVulnerability: true,
              userAskedForHelp: true,
              userExpressedSkepticism: false,
              comfortLevel: 0.9,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      const trust = score.signals.find((s) => s.name === 'trustSignals')?.value ?? 0;

      expect(trust).toBeGreaterThan(0.7);
    });

    it('decreases with skepticism', () => {
      const scorer = getRapportScorer(testSessionId);

      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            trustSignals: {
              userDisclosed: false,
              userShowedVulnerability: false,
              userAskedForHelp: false,
              userExpressedSkepticism: true,
              comfortLevel: 0.2,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      const trust = score.signals.find((s) => s.name === 'trustSignals')?.value ?? 0;

      expect(trust).toBeLessThan(0.4);
    });
  });

  describe('Trend Detection', () => {
    it('detects improving trend', () => {
      const scorer = getRapportScorer(testSessionId);

      // Start with low engagement
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'short',
              userAskedQuestion: false,
              userElaborated: false,
              userIntroducedTopic: false,
              userShowedEmotion: false,
            },
          })
        );
      }

      // Then improve significantly
      for (let i = 5; i < 10; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'long',
              userAskedQuestion: true,
              userElaborated: true,
              userIntroducedTopic: true,
              userShowedEmotion: true,
            },
            trustSignals: {
              userDisclosed: true,
              userShowedVulnerability: true,
              userAskedForHelp: false,
              userExpressedSkepticism: false,
              comfortLevel: 0.9,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      expect(score.trend).toBe('improving');
    });

    it('detects declining trend', () => {
      const scorer = getRapportScorer(testSessionId);

      // Start good
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'long',
              userAskedQuestion: true,
              userElaborated: true,
              userIntroducedTopic: false,
              userShowedEmotion: true,
            },
          })
        );
      }

      // Then decline
      for (let i = 5; i < 10; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'short',
              userAskedQuestion: false,
              userElaborated: false,
              userIntroducedTopic: false,
              userShowedEmotion: false,
            },
            emotionalAlignment: {
              userEmotion: 'frustrated',
              agentEmotion: 'happy',
              isAligned: false,
              userEnergy: 0.2,
              agentEnergy: 0.8,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      expect(score.trend).toBe('declining');
    });
  });

  describe('Level Classification', () => {
    it('classifies excellent score correctly', () => {
      const scorer = getRapportScorer(testSessionId);

      // Excellent signals across the board
      for (let i = 0; i < 10; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            turnBalance: {
              agentWordCount: 40,
              userWordCount: 60,
              agentTalkTimeMs: 4000,
              userTalkTimeMs: 6000,
            },
            engagement: {
              responseLength: 'long',
              userAskedQuestion: true,
              userElaborated: true,
              userIntroducedTopic: true,
              userShowedEmotion: true,
            },
            emotionalAlignment: {
              userEmotion: 'happy',
              agentEmotion: 'happy',
              isAligned: true,
              userEnergy: 0.7,
              agentEnergy: 0.7,
            },
            flowContinuity: {
              silenceDurationMs: 500,
              topicShift: false,
              smoothTransition: true,
              naturalPacing: true,
            },
            trustSignals: {
              userDisclosed: true,
              userShowedVulnerability: true,
              userAskedForHelp: true,
              userExpressedSkepticism: false,
              comfortLevel: 0.95,
            },
          })
        );
      }

      const score = scorer.getCurrentScore();
      expect(score.score).toBeGreaterThan(RAPPORT_CONFIG.THRESHOLDS.EXCELLENT);
      expect(score.level).toBe('excellent');
    });
  });

  describe('Repair Strategies', () => {
    it('recommends no repair when rapport is good', () => {
      const scorer = getRapportScorer(testSessionId);

      // Build good rapport
      for (let i = 0; i < 5; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'long',
              userAskedQuestion: true,
              userElaborated: true,
              userIntroducedTopic: false,
              userShowedEmotion: true,
            },
          })
        );
      }

      const strategy = scorer.getRepairStrategy();
      expect(strategy.type).toBe('none');
    });

    it('recommends repair when rapport drops', () => {
      const scorer = getRapportScorer(testSessionId);

      // Poor signals
      for (let i = 0; i < 10; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'short',
              userAskedQuestion: false,
              userElaborated: false,
              userIntroducedTopic: false,
              userShowedEmotion: false,
            },
            emotionalAlignment: {
              userEmotion: 'frustrated',
              agentEmotion: 'happy',
              isAligned: false,
              userEnergy: 0.2,
              agentEnergy: 0.8,
            },
            trustSignals: {
              userDisclosed: false,
              userShowedVulnerability: false,
              userAskedForHelp: false,
              userExpressedSkepticism: true,
              comfortLevel: 0.2,
            },
          })
        );
      }

      const strategy = scorer.getRepairStrategy();
      expect(strategy.type).not.toBe('none');
      expect(strategy.contextInjection).toBeTruthy();
    });

    it('tracks active repair strategy', () => {
      const scorer = getRapportScorer(testSessionId);
      const strategy = scorer.getRepairStrategy();

      scorer.activateRepairStrategy(strategy);

      const state = scorer.getState();
      expect(state.repairState.activeStrategy).toBe(strategy.type === 'none' ? null : strategy);

      scorer.deactivateRepairStrategy();
      expect(scorer.getState().repairState.activeStrategy).toBeNull();
    });
  });

  describe('Repair Strategy Selection', () => {
    it('returns all available strategies', () => {
      const strategies = getAvailableStrategies();

      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.some((s) => s.type === 'validate_feeling')).toBe(true);
      expect(strategies.some((s) => s.type === 'slow_down')).toBe(true);
      expect(strategies.some((s) => s.type === 'check_in')).toBe(true);
      expect(strategies.some((s) => s.type === 'give_space')).toBe(true);
      expect(strategies.some((s) => s.type === 'show_interest')).toBe(true);
      expect(strategies.some((s) => s.type === 'none')).toBe(true);
    });

    it('selects validate_feeling for very low scores', () => {
      const mockScore: RapportScore = {
        score: 35,
        level: 'critical',
        signals: [],
        confidence: 0.8,
        trend: 'declining',
        trendRate: -2,
        calculatedAt: Date.now(),
      };

      const mockRepairState: RepairState = {
        activeStrategy: null,
        turnsSinceRepairStarted: 0,
        isImproving: false,
        recentStrategies: [],
      };

      const strategy = selectRepairStrategy(mockScore, mockRepairState);

      expect(strategy.type).toBe('validate_feeling');
    });

    it('selects slow_down when declining rapidly', () => {
      const mockScore: RapportScore = {
        score: 60,
        level: 'needs_attention',
        signals: [],
        confidence: 0.8,
        trend: 'declining',
        trendRate: -3,
        calculatedAt: Date.now(),
      };

      const mockRepairState: RepairState = {
        activeStrategy: null,
        turnsSinceRepairStarted: 0,
        isImproving: false,
        recentStrategies: [],
      };

      const strategy = selectRepairStrategy(mockScore, mockRepairState);

      expect(strategy.type).toBe('slow_down');
    });
  });

  describe('Confidence Calculation', () => {
    it('increases confidence with more observations', () => {
      const scorer = getRapportScorer(testSessionId);

      const initialConfidence = scorer.getCurrentScore().confidence;

      // Record many observations
      for (let i = 0; i < 15; i++) {
        scorer.recordObservation(
          createObservation({
            turnNumber: i,
            engagement: {
              responseLength: 'medium',
              userAskedQuestion: false,
              userElaborated: false,
              userIntroducedTopic: false,
              userShowedEmotion: false,
            },
          })
        );
      }

      const finalConfidence = scorer.getCurrentScore().confidence;
      expect(finalConfidence).toBeGreaterThan(initialConfidence);
    });
  });

  describe('State Reporting', () => {
    it('returns complete state', () => {
      const scorer = getRapportScorer(testSessionId);

      scorer.recordObservation(
        createObservation({
          engagement: {
            responseLength: 'medium',
            userAskedQuestion: true,
            userElaborated: false,
            userIntroducedTopic: false,
            userShowedEmotion: false,
          },
        })
      );

      const state = scorer.getState();

      expect(state.sessionId).toBe(testSessionId);
      expect(state.currentScore).toBeDefined();
      expect(state.currentScore.score).toBeGreaterThan(0);
      expect(state.scoreHistory).toBeInstanceOf(Array);
      expect(state.repairState).toBeDefined();
      expect(state.observationCount).toBe(1);
      expect(state.sessionStartedAt).toBeDefined();
    });
  });
});
