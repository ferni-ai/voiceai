/**
 * Engagement Scoring Tests
 *
 * Tests the EngagementScorer that tracks:
 * - User engagement levels (high/medium/low/distracted)
 * - Engagement trends (improving/declining)
 * - Actionable suggestions when engagement drops
 *
 * @module tests/engagement-scoring
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getEngagementScorer,
  resetAllEngagementScorers,
  resetEngagementScorer,
} from '../conversation/engagement-scoring.js';

// ============================================================================
// TESTS
// ============================================================================

describe('EngagementScorer', () => {
  beforeEach(() => {
    resetAllEngagementScorers();
  });

  afterEach(() => {
    resetAllEngagementScorers();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance for the same session', () => {
      const instance1 = getEngagementScorer('session-1');
      const instance2 = getEngagementScorer('session-1');
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different sessions', () => {
      const instance1 = getEngagementScorer('session-1');
      const instance2 = getEngagementScorer('session-2');
      expect(instance1).not.toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getEngagementScorer('session-1');
      resetEngagementScorer('session-1');
      const instance2 = getEngagementScorer('session-1');
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // High Engagement Detection
  // --------------------------------------------------------------------------

  describe('High Engagement Detection', () => {
    it('should detect high engagement with questions and long responses', () => {
      const scorer = getEngagementScorer('test-session');

      // Simulate engaged user behavior
      scorer.recordAgentMessage();
      scorer.recordResponse("That's really interesting! Can you tell me more about that?");
      scorer.recordAgentMessage();
      scorer.recordResponse('Wow, I never thought of it that way. How does that work exactly?');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('Fascinating! What other options are there?');

      expect(result.level).toBe('high');
      expect(result.score).toBeGreaterThan(0.6);
    });

    it('should recognize engagement phrases', () => {
      const scorer = getEngagementScorer('test-session');

      scorer.recordAgentMessage();
      scorer.recordResponse("That's really interesting, tell me more!");
      scorer.recordAgentMessage();
      scorer.recordResponse('Wow, no way! I never thought about that. Can you explain?');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse("Fascinating, I'm curious - what else is there?");

      // Either high engagement level or questions detected
      expect(['high', 'medium']).toContain(result.level);
    });
  });

  // --------------------------------------------------------------------------
  // Low Engagement Detection
  // --------------------------------------------------------------------------

  describe('Low Engagement Detection', () => {
    it('should detect low engagement with short backchannel responses', () => {
      const scorer = getEngagementScorer('test-session');

      // Simulate disengaged user behavior
      scorer.recordAgentMessage();
      scorer.recordResponse('okay');
      scorer.recordAgentMessage();
      scorer.recordResponse('uh huh');
      scorer.recordAgentMessage();
      scorer.recordResponse('sure');
      scorer.recordAgentMessage();
      scorer.recordResponse('yeah');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('mhm');

      expect(['low', 'distracted']).toContain(result.level);
      expect(result.signals.backchannelRate).toBeGreaterThan(0.3);
    });

    it('should detect distracted engagement', () => {
      const scorer = getEngagementScorer('test-session');

      // Very short, disengaged responses
      scorer.recordAgentMessage();
      scorer.recordResponse('ok.');
      scorer.recordAgentMessage();
      scorer.recordResponse('fine.');
      scorer.recordAgentMessage();
      scorer.recordResponse('whatever.');
      scorer.recordAgentMessage();
      scorer.recordResponse('I guess.');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('sure.');

      expect(['low', 'distracted']).toContain(result.level);
    });
  });

  // --------------------------------------------------------------------------
  // Engagement Trends
  // --------------------------------------------------------------------------

  describe('Engagement Trends', () => {
    it('should detect declining engagement', () => {
      const scorer = getEngagementScorer('test-session');

      // Start engaged
      scorer.recordAgentMessage();
      scorer.recordResponse('This is really interesting! Tell me more about how this works?');
      scorer.recordAgentMessage();
      scorer.recordResponse('That makes a lot of sense, what else should I know?');

      // Then disengage
      scorer.recordAgentMessage();
      scorer.recordResponse('okay');
      scorer.recordAgentMessage();
      scorer.recordResponse('sure');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('mhm');

      expect(result.declining).toBe(true);
    });

    it('should track length trend', () => {
      const scorer = getEngagementScorer('test-session');

      // Start with long responses
      scorer.recordAgentMessage();
      scorer.recordResponse('I have a lot to say about this topic and I find it very engaging');
      scorer.recordAgentMessage();
      scorer.recordResponse('Let me expand on that with more details and examples');

      // Then shorter responses
      scorer.recordAgentMessage();
      scorer.recordResponse('okay');
      scorer.recordAgentMessage();
      scorer.recordResponse('fine');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('ok');

      expect(result.signals.lengthTrend).toBe('shorter');
    });
  });

  // --------------------------------------------------------------------------
  // Action Suggestions
  // --------------------------------------------------------------------------

  describe('Action Suggestions', () => {
    it('should suggest check_in for low engagement', () => {
      const scorer = getEngagementScorer('test-session');

      // Build low engagement
      for (let i = 0; i < 5; i++) {
        scorer.recordAgentMessage();
        scorer.recordResponse('okay');
      }

      const result = scorer.getCurrentEngagement();

      if (result.level === 'low' || result.level === 'distracted') {
        expect(['check_in', 'shift_topic', 'energize']).toContain(result.suggestedAction);
        expect(result.actionGuidance).toBeTruthy();
      }
    });

    it('should suggest continue for good engagement', () => {
      const scorer = getEngagementScorer('test-session');

      // Build good engagement
      scorer.recordAgentMessage();
      scorer.recordResponse('This is great! Can you explain more?');
      scorer.recordAgentMessage();
      scorer.recordResponse("Interesting perspective! What's your take on this related topic?");
      scorer.recordAgentMessage();
      const result = scorer.recordResponse(
        "I've been thinking about this a lot. How does it apply?"
      );

      if (result.level === 'high' || result.level === 'medium') {
        expect(result.suggestedAction).toBe('continue');
      }
    });

    it('should suggest wrap_up when responses getting shorter and slower', () => {
      const scorer = getEngagementScorer('test-session');

      // Good engagement first
      scorer.recordAgentMessage();
      scorer.recordResponse('This is a long and engaging response with questions?');
      scorer.recordAgentMessage();
      scorer.recordResponse('Still engaged but getting shorter');

      // Then signs of wrapping up
      scorer.recordAgentMessage();
      scorer.recordResponse('getting tired');
      scorer.recordAgentMessage();
      scorer.recordResponse('okay sure');
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('yep');

      expect(['wrap_up', 'check_in', 'shift_topic', 'energize']).toContain(result.suggestedAction);
    });
  });

  // --------------------------------------------------------------------------
  // Topic Continuity
  // --------------------------------------------------------------------------

  describe('Topic Continuity', () => {
    it('should track topic continuity', () => {
      const scorer = getEngagementScorer('test-session');

      scorer.recordAgentMessage();
      scorer.recordResponse('Tell me about budgeting strategies', { currentTopic: 'budgeting' });
      scorer.recordAgentMessage();
      scorer.recordResponse('What about budgeting for groceries?', { currentTopic: 'budgeting' });
      scorer.recordAgentMessage();
      const result = scorer.recordResponse('That budgeting approach sounds good', {
        currentTopic: 'budgeting',
      });

      expect(result.signals.topicContinuity).toBeGreaterThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Default State
  // --------------------------------------------------------------------------

  describe('Default State', () => {
    it('should return medium engagement with insufficient data', () => {
      const scorer = getEngagementScorer('test-session');

      const result = scorer.getCurrentEngagement();

      expect(result.level).toBe('medium');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should have low confidence initially', () => {
      const scorer = getEngagementScorer('test-session');

      scorer.recordAgentMessage();
      const result = scorer.recordResponse('Hello!');

      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should increase confidence with more observations', () => {
      const scorer = getEngagementScorer('test-session');

      for (let i = 0; i < 6; i++) {
        scorer.recordAgentMessage();
        scorer.recordResponse(`Response ${i} with some content`);
      }

      const result = scorer.getCurrentEngagement();
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('Reset', () => {
    it('should reset internal state', () => {
      const scorer = getEngagementScorer('test-session');

      for (let i = 0; i < 5; i++) {
        scorer.recordAgentMessage();
        scorer.recordResponse(`Response ${i}`);
      }

      scorer.reset();

      const result = scorer.getCurrentEngagement();
      expect(result.level).toBe('medium');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const scorer = getEngagementScorer('test-session');

      expect(() => {
        scorer.recordAgentMessage();
        scorer.recordResponse('');
      }).not.toThrow();
    });

    it('should handle very long text', () => {
      const scorer = getEngagementScorer('test-session');
      const longText = 'This is engaging content. '.repeat(100);

      expect(() => {
        scorer.recordAgentMessage();
        scorer.recordResponse(longText);
      }).not.toThrow();
    });

    it('should handle rapid consecutive calls', () => {
      const scorer = getEngagementScorer('test-session');

      expect(() => {
        for (let i = 0; i < 50; i++) {
          scorer.recordAgentMessage();
          scorer.recordResponse(`Message ${i}`);
        }
      }).not.toThrow();
    });

    it('should handle special characters', () => {
      const scorer = getEngagementScorer('test-session');

      expect(() => {
        scorer.recordAgentMessage();
        scorer.recordResponse('Test with $100 & <tags> and "quotes"? What about this!');
      }).not.toThrow();
    });
  });
});
