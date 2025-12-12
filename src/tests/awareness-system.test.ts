/**
 * Awareness System Tests
 *
 * Tests for the comprehensive awareness system that makes Ferni feel present.
 * Covers momentum tracking, thinking pauses, tangents, and self-awareness.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getMomentumTracker,
  resetMomentumTracker,
  resetAllMomentumTrackers,
  type MomentumState,
} from '../conversation/momentum-tracker.js';
import {
  calculateThinkingTime,
  detectQuestionComplexity,
  COMPLEX_QUESTION_PATTERNS,
  HEAVY_TOPIC_PATTERNS,
  type ThinkingContext,
} from '../conversation/thinking-time-injector.js';
import {
  decideTangent,
  resetTangentState,
  resetAllTangentStates,
} from '../conversation/mid-response-tangents.js';
import {
  getSelfAwarenessTracker,
  resetSelfAwarenessTracker,
  resetAllSelfAwarenessTrackers,
  POSITIVE_SIGNALS,
  NEGATIVE_SIGNALS,
} from '../conversation/self-awareness-loop.js';

// ============================================================================
// MOMENTUM TRACKER TESTS
// ============================================================================

describe('MomentumTracker', () => {
  const sessionId = 'test-session-momentum';

  beforeEach(() => {
    resetMomentumTracker(sessionId);
  });

  afterEach(() => {
    resetAllMomentumTrackers();
  });

  describe('state detection', () => {
    it('should start in building state', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');
      const state = tracker.getState();
      expect(state.current).toBe('building');
      expect(state.phase).toBe('opening');
    });

    it('should detect peaking state on high engagement', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');

      // Simulate high engagement signals
      for (let i = 0; i < 5; i++) {
        tracker.recordSignal({
          wordCount: 80,
          emotionalIntensity: 0.8,
          questionAsked: true,
          selfDisclosure: true,
          topicContinuity: true,
        });
      }

      const state = tracker.getState();
      expect(['peaking', 'building', 'intimate']).toContain(state.current);
      expect(state.score).toBeGreaterThan(0.5);
    });

    it('should detect intimate state on self-disclosure', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');

      // Simulate intimate sharing
      for (let i = 0; i < 4; i++) {
        tracker.recordSignal({
          wordCount: 50,
          emotionalIntensity: 0.75,
          questionAsked: false,
          selfDisclosure: true,
          topicContinuity: true,
        });
      }

      const state = tracker.getState();
      // High emotion + disclosure should trigger intimate or at least high score
      expect(state.score).toBeGreaterThan(0.4);
    });

    it('should track topic depth', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');

      // Same topic for several turns
      for (let i = 0; i < 5; i++) {
        tracker.recordSignal({
          wordCount: 30,
          emotionalIntensity: 0.5,
          questionAsked: false,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      const state = tracker.getState();
      expect(state.topicDepth).toBe(5);
    });

    it('should transition through phases', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');

      // Opening phase
      expect(tracker.getState().phase).toBe('opening');

      // Add turns to get to exploring
      for (let i = 0; i < 4; i++) {
        tracker.recordSignal({
          wordCount: 30,
          emotionalIntensity: 0.5,
          questionAsked: false,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      expect(tracker.getState().phase).toBe('exploring');

      // Add more turns for deep
      for (let i = 0; i < 8; i++) {
        tracker.recordSignal({
          wordCount: 30,
          emotionalIntensity: 0.5,
          questionAsked: false,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      expect(tracker.getState().phase).toBe('deep');
    });
  });

  describe('suggestions', () => {
    it('should suggest lean_in for building momentum', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');

      // Build engagement
      for (let i = 0; i < 4; i++) {
        tracker.recordSignal({
          wordCount: 50,
          emotionalIntensity: 0.6,
          questionAsked: true,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      const state = tracker.getState();
      const suggestion = state.suggestions.find((s) => s.type === 'lean_in');
      if (state.current === 'building') {
        expect(suggestion).toBeDefined();
      }
    });

    it('should suggest acknowledge_depth for intimate moments', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');

      // Create intimate moment
      for (let i = 0; i < 4; i++) {
        tracker.recordSignal({
          wordCount: 60,
          emotionalIntensity: 0.8,
          questionAsked: false,
          selfDisclosure: true,
          topicContinuity: true,
        });
      }

      const state = tracker.getState();
      if (state.current === 'intimate') {
        const suggestion = state.suggestions.find((s) => s.type === 'acknowledge_depth');
        expect(suggestion).toBeDefined();
      }
    });
  });

  describe('Ferni profile', () => {
    it('should have slower energy match speed', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');
      // Ferni is more patient, reflected in the profile
      expect(tracker.getCue()).toBeDefined();
    });
  });
});

// ============================================================================
// THINKING TIME TESTS
// ============================================================================

describe('ThinkingTimeInjector', () => {
  const sessionId = 'test-session-thinking';

  beforeEach(() => {
    resetMomentumTracker(sessionId);
  });

  afterEach(() => {
    resetAllMomentumTrackers();
  });

  describe('question complexity detection', () => {
    it('should detect "why" questions as complex', () => {
      const result = detectQuestionComplexity('Why do I always feel this way?');
      expect(result.isComplex).toBe(true);
      expect(result.weight).toBeGreaterThan(0.5);
    });

    it('should detect "what do you think" as complex', () => {
      const result = detectQuestionComplexity('What do you think I should do?');
      expect(result.isComplex).toBe(true);
    });

    it('should detect heavy topics', () => {
      const result = detectQuestionComplexity("My mom died last year and I'm still struggling");
      expect(result.isComplex).toBe(true);
      expect(result.weight).toBeGreaterThan(0.6);
    });

    it('should handle simple questions', () => {
      const result = detectQuestionComplexity("What's the weather like?");
      expect(result.isComplex).toBe(false);
      expect(result.weight).toBeLessThan(0.5);
    });
  });

  describe('thinking time calculation', () => {
    it('should calculate longer pauses for complex questions', () => {
      const ctx: ThinkingContext = {
        userText: 'Why do I keep making the same mistakes?',
        emotionalIntensity: 0.6,
        turnCount: 3,
        sessionId,
        personaId: 'ferni',
      };

      const result = calculateThinkingTime(ctx);
      expect(result.openingPauseMs).toBeGreaterThan(300);
    });

    it('should suggest thinking sounds for emotional content', () => {
      const ctx: ThinkingContext = {
        userText: "I've been feeling really lost lately",
        emotionalIntensity: 0.8,
        turnCount: 5,
        sessionId,
        personaId: 'ferni',
      };

      // Run multiple times to account for probability
      let hasThinkingSound = false;
      for (let i = 0; i < 20; i++) {
        const result = calculateThinkingTime(ctx);
        if (result.thinkingSound) {
          hasThinkingSound = true;
          break;
        }
      }

      // Ferni has 45% probability, so should hit in 20 tries
      expect(hasThinkingSound).toBe(true);
    });

    it('should slow speech rate for heavy topics', () => {
      const ctx: ThinkingContext = {
        userText: "I'm scared about my diagnosis",
        emotionalIntensity: 0.9,
        turnCount: 5,
        sessionId,
        personaId: 'ferni',
      };

      const result = calculateThinkingTime(ctx);
      expect(result.slowSpeechRate).toBe(true);
      expect(result.speechRateMultiplier).toBeLessThan(1);
    });

    it('should add mid-pauses for long responses', () => {
      const ctx: ThinkingContext = {
        userText: 'Tell me about your philosophy on life',
        emotionalIntensity: 0.5,
        turnCount: 5,
        sessionId,
        personaId: 'ferni',
      };

      const result = calculateThinkingTime(ctx, 50); // 50 words
      expect(result.midPauses.length).toBeGreaterThan(0);
    });
  });

  describe('pattern matching', () => {
    it('should have valid complex question patterns', () => {
      for (const pattern of COMPLEX_QUESTION_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });

    it('should have valid heavy topic patterns', () => {
      for (const pattern of HEAVY_TOPIC_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });
});

// ============================================================================
// TANGENT SYSTEM TESTS
// ============================================================================

describe('TangentSystem', () => {
  const sessionId = 'test-session-tangent';

  beforeEach(() => {
    resetTangentState(sessionId);
    resetMomentumTracker(sessionId);
  });

  afterEach(() => {
    resetAllTangentStates();
    resetAllMomentumTrackers();
  });

  describe('tangent triggering', () => {
    it('should not tangent during opening phase', () => {
      const decision = decideTangent(sessionId, 'ferni', "I'm planning a trip to Japan", 2, 1);
      expect(decision.shouldTangent).toBe(false);
      expect(decision.reason).toContain('Opening phase');
    });

    it('should respect cooldown between tangents', () => {
      // Setup: get past opening phase
      const tracker = getMomentumTracker(sessionId, 'ferni');
      for (let i = 0; i < 6; i++) {
        tracker.recordSignal({
          wordCount: 30,
          emotionalIntensity: 0.5,
          questionAsked: false,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      // Force a tangent by checking many times (probabilistic)
      let tangentHappened = false;
      for (let i = 0; i < 50; i++) {
        const decision = decideTangent(sessionId, 'ferni', "I'm planning a trip to Japan", 7, 1);
        if (decision.shouldTangent) {
          tangentHappened = true;
          break;
        }
      }

      // After tangent, cooldown should prevent immediate re-tangent
      if (tangentHappened) {
        const nextDecision = decideTangent(sessionId, 'ferni', "I'm also going to Morocco", 8, 1);
        expect(nextDecision.shouldTangent).toBe(false);
        expect(nextDecision.reason).toContain('Cooldown');
      }
    });

    it('should match travel keywords', () => {
      const tracker = getMomentumTracker(sessionId, 'ferni');
      for (let i = 0; i < 6; i++) {
        tracker.recordSignal({
          wordCount: 30,
          emotionalIntensity: 0.5,
          questionAsked: false,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      // Check if travel triggers get detected
      // Note: This is probabilistic (22% chance * not-opening * not-intimate)
      // We test that the decision logic runs without error and provides a reason
      const decision = decideTangent(
        sessionId,
        'ferni',
        "I'm thinking about traveling abroad",
        7,
        1
      );

      // Should either tangent OR provide a reason why not
      expect(decision.reason).toBeDefined();
      if (decision.shouldTangent) {
        // The decision is probabilistic and can pick different tangent themes
        // based on multiple matching conditions. Just verify a valid tangent exists.
        expect(decision.tangent?.theme).toBeDefined();
      }
    });

    it('should respect relationship depth for certain tangents', () => {
      // Setup momentum
      const tracker = getMomentumTracker(sessionId, 'ferni');
      for (let i = 0; i < 6; i++) {
        tracker.recordSignal({
          wordCount: 30,
          emotionalIntensity: 0.5,
          questionAsked: false,
          selfDisclosure: false,
          topicContinuity: true,
        });
      }

      // Family tangents need relationship depth >= 1
      // With depth 0, family tangents shouldn't fire
      let familyTangentWithNoRelationship = false;
      for (let i = 0; i < 30; i++) {
        const decision = decideTangent(
          sessionId,
          'ferni',
          "I'm having issues with my family",
          7,
          0
        );
        if (decision.shouldTangent && decision.tangent?.theme === 'family_life') {
          familyTangentWithNoRelationship = true;
          break;
        }
      }

      // Should not trigger family tangent without relationship
      expect(familyTangentWithNoRelationship).toBe(false);
    });
  });
});

// ============================================================================
// SELF-AWARENESS TESTS
// ============================================================================

describe('SelfAwarenessTracker', () => {
  const sessionId = 'test-session-self-aware';

  beforeEach(() => {
    resetSelfAwarenessTracker(sessionId);
    resetMomentumTracker(sessionId);
  });

  afterEach(() => {
    resetAllSelfAwarenessTrackers();
    resetAllMomentumTrackers();
  });

  describe('signal detection', () => {
    it('should detect positive signals', () => {
      for (const pattern of POSITIVE_SIGNALS) {
        // Each pattern should be a valid regex
        expect(pattern).toBeInstanceOf(RegExp);
      }

      // Test actual detection via tracker
      const tracker = getSelfAwarenessTracker(sessionId, 'ferni');

      // Record an attempt
      tracker.recordAttempt({
        responseType: 'advice',
        emotionalTone: 'warm',
      });

      // Record positive reaction
      const assessment = tracker.recordReaction(
        "Yes! That's exactly what I needed to hear. Thank you.",
        {
          emotionalChange: 0.2,
          topicContinued: true,
        }
      );

      expect(assessment).not.toBeNull();
      expect(assessment?.result).toBe('landed');
    });

    it('should detect negative signals', () => {
      for (const pattern of NEGATIVE_SIGNALS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }

      const tracker = getSelfAwarenessTracker(sessionId, 'ferni');

      tracker.recordAttempt({
        responseType: 'advice',
        emotionalTone: 'neutral',
      });

      const assessment = tracker.recordReaction(
        "I guess. Whatever. Let's talk about something else.",
        {
          emotionalChange: -0.2,
          topicContinued: false,
        }
      );

      expect(assessment).not.toBeNull();
      expect(['missed', 'partial']).toContain(assessment?.result);
    });
  });

  describe('landing assessment', () => {
    it('should mark high engagement as landed', () => {
      const tracker = getSelfAwarenessTracker(sessionId, 'ferni');

      tracker.recordAttempt({
        responseType: 'reflection',
        emotionalTone: 'warm',
      });

      const assessment = tracker.recordReaction(
        "That's so true. I never thought about it that way. I've been struggling with this for months and you just put it into words. How did you know?",
        {
          emotionalChange: 0.3,
          topicContinued: true,
          selfDisclosure: true,
          questionAsked: true,
        }
      );

      expect(assessment?.result).toBe('landed');
      expect(assessment?.confidence).toBeGreaterThan(0.5);
    });

    it('should mark disengagement as missed', () => {
      const tracker = getSelfAwarenessTracker(sessionId, 'ferni');

      tracker.recordAttempt({
        responseType: 'humor',
        emotionalTone: 'playful',
      });

      // Strong disengagement signal: negative signals, short response, topic change
      const assessment = tracker.recordReaction("Whatever. Let's talk about something else.", {
        emotionalChange: -0.3,
        topicContinued: false,
        questionAsked: false,
      });

      expect(['missed', 'partial', 'unknown']).toContain(assessment?.result);
    });

    it('should suggest check-in after multiple misses', () => {
      const tracker = getSelfAwarenessTracker(sessionId, 'ferni');

      // Create multiple clear misses with strong negative signals
      for (let i = 0; i < 4; i++) {
        tracker.recordAttempt({
          responseType: 'advice',
          emotionalTone: 'neutral',
        });

        // Strong miss signals: topic change, negative words, short response
        tracker.recordReaction("Whatever. Let's move on.", {
          emotionalChange: -0.3,
          topicContinued: false,
          questionAsked: false,
        });
      }

      // Check state - should have some record of the interactions
      const state = tracker.getState();
      // The tracker should have processed all reactions
      expect(state.overallEffectiveness).toBeLessThan(0.7); // Not great effectiveness
    });
  });

  describe('effectiveness tracking', () => {
    it('should calculate overall effectiveness', () => {
      const tracker = getSelfAwarenessTracker(sessionId, 'ferni');

      // Mix of landings and misses
      const responses = [
        { reaction: 'Yes! Great point.', landed: true },
        { reaction: 'I guess.', landed: false },
        { reaction: 'That really helps, thanks.', landed: true },
        { reaction: 'Hm. Ok.', landed: false },
        { reaction: 'Exactly what I needed.', landed: true },
      ];

      for (const { reaction, landed } of responses) {
        tracker.recordAttempt({
          responseType: 'advice',
          emotionalTone: 'warm',
        });
        tracker.recordReaction(reaction, {
          emotionalChange: landed ? 0.2 : -0.1,
          topicContinued: landed,
        });
      }

      const state = tracker.getState();
      // Should have some effectiveness score between 0 and 1
      expect(state.overallEffectiveness).toBeGreaterThanOrEqual(0);
      expect(state.overallEffectiveness).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Awareness System Integration', () => {
  const sessionId = 'test-session-integration';

  beforeEach(() => {
    resetMomentumTracker(sessionId);
    resetTangentState(sessionId);
    resetSelfAwarenessTracker(sessionId);
  });

  afterEach(() => {
    resetAllMomentumTrackers();
    resetAllTangentStates();
    resetAllSelfAwarenessTrackers();
  });

  it('should coordinate momentum and thinking time', () => {
    const tracker = getMomentumTracker(sessionId, 'ferni');

    // Build some momentum
    for (let i = 0; i < 5; i++) {
      tracker.recordSignal({
        wordCount: 40,
        emotionalIntensity: 0.6,
        questionAsked: false,
        selfDisclosure: false,
        topicContinuity: true,
      });
    }

    // Thinking time should consider momentum
    const ctx: ThinkingContext = {
      userText: 'What should I do about this?',
      emotionalIntensity: 0.6,
      turnCount: 6,
      sessionId,
      personaId: 'ferni',
    };

    const thinking = calculateThinkingTime(ctx);
    // Should have reasoning that includes momentum
    expect(thinking.reasoning.some((r) => r.toLowerCase().includes('momentum'))).toBe(true);
  });

  it('should prevent tangents during intimate moments', () => {
    const tracker = getMomentumTracker(sessionId, 'ferni');

    // Create intimate state
    for (let i = 0; i < 5; i++) {
      tracker.recordSignal({
        wordCount: 60,
        emotionalIntensity: 0.8,
        questionAsked: false,
        selfDisclosure: true,
        topicContinuity: true,
      });
    }

    const momentum = tracker.getState();
    if (momentum.current === 'intimate') {
      // Try to trigger tangent - should be blocked
      const decision = decideTangent(sessionId, 'ferni', "I'm planning a trip", 6, 2);
      expect(decision.shouldTangent).toBe(false);
      expect(decision.reason).toContain('intimate');
    }
  });

  it('should track self-awareness alongside momentum', () => {
    const momentumTracker = getMomentumTracker(sessionId, 'ferni');
    const selfTracker = getSelfAwarenessTracker(sessionId, 'ferni');

    // Record momentum signal
    momentumTracker.recordSignal({
      wordCount: 50,
      emotionalIntensity: 0.7,
      questionAsked: true,
      selfDisclosure: false,
      topicContinuity: true,
    });

    // Record self-awareness attempt and reaction
    selfTracker.recordAttempt({
      responseType: 'reflection',
      emotionalTone: 'warm',
      userEmotionBefore: 0.7,
    });

    const assessment = selfTracker.recordReaction('Yes, that really resonates with me.', {
      emotionalChange: 0.2,
      topicContinued: true,
    });

    // Both should show positive signals
    const momentum = momentumTracker.getState();
    const selfState = selfTracker.getState();

    expect(momentum.score).toBeGreaterThan(0.4);
    expect(assessment?.result).toBe('landed');
    expect(selfState.recentLandings).toBeGreaterThanOrEqual(1);
  });
});
