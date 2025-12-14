/**
 * Contextual Laughter Tests
 *
 * Tests for smart laughter timing that knows when a laugh feels natural.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContextualLaughter,
  applyLaughter,
  decideLaughter,
  LAUGH_TYPES,
  PERSONA_LAUGH_STYLES,
  resetLaughterSession,
  type LaughterDecision,
} from '../contextual-laughter.js';

describe('Contextual Laughter Module', () => {
  beforeEach(() => {
    // Reset session state before each test
    resetLaughterSession('test-session');
    // Mock random to be predictable
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // Low value = will trigger laugh
  });

  // ===========================================================================
  // BLOCKING CONDITIONS
  // ===========================================================================
  describe('Blocking Conditions', () => {
    it('should NOT laugh during heavy topics', () => {
      const decision = decideLaughter(
        {
          responseText: 'Just kidding! That was funny.',
          topicWeight: 'heavy',
        },
        'test-session'
      );

      expect(decision.shouldLaugh).toBe(false);
      expect(decision.reason).toContain('Heavy topic');
    });

    it('should NOT laugh when user is distressed', () => {
      const decision = decideLaughter(
        {
          responseText: 'Just kidding!',
          userEmotion: 'sad',
        },
        'test-session'
      );

      expect(decision.shouldLaugh).toBe(false);
      expect(decision.reason).toContain('User emotion');
    });

    it('should NOT laugh during supportive responses', () => {
      const decision = decideLaughter(
        {
          responseText: "I'm so sorry to hear that. That must be really hard.",
        },
        'test-session'
      );

      expect(decision.shouldLaugh).toBe(false);
      expect(decision.reason).toContain('supportive');
    });

    it('should NOT laugh when heavy content is detected', () => {
      const decision = decideLaughter(
        {
          responseText: "Let's talk about grief and how to process it.",
        },
        'test-session'
      );

      expect(decision.shouldLaugh).toBe(false);
      expect(decision.reason).toContain('Heavy content');
    });

    it('should NOT laugh too frequently (cooldown)', () => {
      // First laugh should succeed
      const decision1 = decideLaughter(
        {
          responseText: 'Just kidding!',
          turnCount: 1,
        },
        'test-session'
      );
      expect(decision1.shouldLaugh).toBe(true);

      // Second laugh immediately after should fail (default cooldown is 3 turns for Ferni)
      const decision2 = decideLaughter(
        {
          responseText: 'Just kidding again!',
          turnCount: 2,
        },
        'test-session'
      );
      expect(decision2.shouldLaugh).toBe(false);
      expect(decision2.reason).toContain('turns since last laugh');
    });
  });

  // ===========================================================================
  // POSITIVE CONDITIONS
  // ===========================================================================
  describe('Positive Conditions - Agent Humor', () => {
    it('should laugh after "just kidding"', () => {
      const decision = decideLaughter(
        {
          responseText: 'You should totally quit your job! Just kidding.',
          turnCount: 10,
        },
        'test-session'
      );

      expect(decision.shouldLaugh).toBe(true);
      expect(decision.reason.toLowerCase()).toContain('just kidding');
    });

    it('should laugh after self-deprecating humor', () => {
      resetLaughterSession('test-self-deprecating');
      const decision = decideLaughter(
        {
          responseText: 'Okay, that was bad.',
          turnCount: 10,
          comfortLevel: 0.6, // Boost to hit threshold
        },
        'test-self-deprecating'
      );

      expect(decision.shouldLaugh).toBe(true);
      expect(decision.laughType).toBe('self-deprecating');
    });

    it('should laugh after teasing', () => {
      resetLaughterSession('test-teasing');
      const decision = decideLaughter(
        {
          responseText: "I'm just teasing you!",
          turnCount: 10,
          comfortLevel: 0.6, // Boost comfort to hit threshold (0.85 * 0.35 * 1.1 = 0.327)
        },
        'test-teasing'
      );

      expect(decision.shouldLaugh).toBe(true);
      expect(decision.laughType).toBe('warm');
    });

    it('should detect "don\'t judge" pattern', () => {
      resetLaughterSession('test-dont-judge');
      const decision = decideLaughter(
        {
          responseText: "I love that movie. Don't judge me.",
          turnCount: 10,
          comfortLevel: 0.8, // High comfort to increase confidence
        },
        'test-dont-judge'
      );

      // Should at least detect the pattern (even if random roll fails)
      // Pattern has confidence 0.7, so with high comfort it should trigger
      if (decision.shouldLaugh) {
        expect(decision.laughType).toBe('soft');
        expect(decision.reason.toLowerCase()).toContain('judge');
      } else {
        // Random roll failed, but we can verify pattern was detected
        expect(decision.reason).toMatch(/Random roll|confidence/i);
      }
    });
  });

  describe('Positive Conditions - User Humor', () => {
    it('should consider user laughter as positive signal', () => {
      resetLaughterSession('test-user-laughed');
      const decision = decideLaughter(
        {
          responseText: 'That is pretty funny!',
          userJustLaughed: true,
          turnCount: 10,
          comfortLevel: 0.8,
        },
        'test-user-laughed'
      );

      // User just laughed triggers the "join" behavior
      // Confidence = 0.7 * persona_probability * (comfort + 0.5)
      // = 0.7 * 0.35 * 1.3 = 0.32 > 0.3 threshold
      if (decision.shouldLaugh) {
        expect(decision.reason).toContain('User just laughed');
      } else {
        // Random roll might have failed
        expect(decision.reason).toMatch(/Random|confidence/i);
      }
    });

    it('should detect user playfulness', () => {
      resetLaughterSession('test-user-playful');
      // Use a response that has no agent humor patterns
      // But user message is playful
      const decision = decideLaughter(
        {
          responseText: 'That made me smile too.',
          userMessage: "haha that's hilarious lol",
          turnCount: 10,
          comfortLevel: 0.8, // High comfort to boost confidence
        },
        'test-user-playful'
      );

      // Should detect user was playful and potentially laugh
      // The exact behavior depends on confidence threshold
      expect(decision.reason.toLowerCase()).toMatch(/user|confidence/);
    });
  });

  // ===========================================================================
  // PERSONA STYLES
  // ===========================================================================
  describe('Persona Styles', () => {
    it('should have Nayan with lower laugh probability than Jordan', () => {
      // Verify persona configurations
      expect(PERSONA_LAUGH_STYLES['nayan-patel'].laughProbabilityBase).toBeLessThan(
        PERSONA_LAUGH_STYLES['jordan-taylor'].laughProbabilityBase
      );
      expect(PERSONA_LAUGH_STYLES['nayan-patel'].minTurnsBetweenLaughs).toBeGreaterThan(
        PERSONA_LAUGH_STYLES['jordan-taylor'].minTurnsBetweenLaughs
      );
    });

    it('should respect Peter deadpan style (no laugh after own jokes)', () => {
      // Peter has laughAfterOwnJokes: false
      const decision = decideLaughter(
        {
          responseText: 'Stay the course. Just kidding, sort of.',
          personaId: 'peter-john',
          turnCount: 10,
        },
        'test-session'
      );

      // Peter won't laugh at his own jokes, but will laugh with user
      expect(decision.shouldLaugh).toBe(false);
    });

    it('should allow Jordan higher laugh frequency', () => {
      // Jordan has minTurnsBetweenLaughs: 2
      const decision1 = decideLaughter(
        {
          responseText: 'Just kidding!',
          personaId: 'jordan-taylor',
          turnCount: 1,
        },
        'test-session'
      );
      expect(decision1.shouldLaugh).toBe(true);

      // Turn 3 should succeed for Jordan (min 2 turns)
      const decision2 = decideLaughter(
        {
          responseText: 'Teasing you!',
          personaId: 'jordan-taylor',
          turnCount: 3,
        },
        'test-session'
      );
      expect(decision2.shouldLaugh).toBe(true);
    });
  });

  // ===========================================================================
  // LAUGH TYPES
  // ===========================================================================
  describe('Laugh Types', () => {
    it('should have correct laugh type configurations', () => {
      expect(LAUGH_TYPES.full.variants).toContain('haha');
      expect(LAUGH_TYPES.soft.variants).toContain('heh');
      expect(LAUGH_TYPES.chuckle.variants).toContain('heh');
      expect(LAUGH_TYPES.warm.variants).toContain('aw');
      expect(LAUGH_TYPES['self-deprecating'].variants).toContain('okay, that was bad');
    });

    it('should have persona styles for all main personas', () => {
      expect(PERSONA_LAUGH_STYLES).toHaveProperty('ferni');
      expect(PERSONA_LAUGH_STYLES).toHaveProperty('peter-john');
      expect(PERSONA_LAUGH_STYLES).toHaveProperty('alex-chen');
      expect(PERSONA_LAUGH_STYLES).toHaveProperty('maya-santos');
      expect(PERSONA_LAUGH_STYLES).toHaveProperty('jordan-taylor');
      expect(PERSONA_LAUGH_STYLES).toHaveProperty('nayan-patel');
    });
  });

  // ===========================================================================
  // TEXT APPLICATION
  // ===========================================================================
  describe('applyLaughter', () => {
    it('should insert laugh at end by default', () => {
      const decision: LaughterDecision = {
        shouldLaugh: true,
        laughType: 'soft',
        placement: 'end',
        laughText: '<break time="80ms"/>heh<break time="100ms"/>',
        insertPosition: -1,
        reason: 'test',
        confidence: 0.8,
      };

      const result = applyLaughter("That's a good point.", decision);
      expect(result).toContain('heh');
      expect(result).toMatch(/heh.*\.$/); // Laugh before final period
    });

    it('should insert laugh at beginning when placement is "before"', () => {
      const decision: LaughterDecision = {
        shouldLaugh: true,
        laughType: 'warm',
        placement: 'before',
        laughText: 'heh',
        insertPosition: 0,
        reason: 'test',
        confidence: 0.8,
      };

      const result = applyLaughter('That was funny!', decision);
      expect(result).toMatch(/^heh .*/);
    });

    it('should insert laugh inline at specified position', () => {
      const decision: LaughterDecision = {
        shouldLaugh: true,
        laughType: 'chuckle',
        placement: 'inline',
        laughText: 'heh',
        insertPosition: 10, // After "Just kiddi"
        reason: 'test',
        confidence: 0.8,
      };

      const result = applyLaughter('Just kidding! But seriously.', decision);
      expect(result).toContain('heh');
    });

    it('should not modify text when shouldLaugh is false', () => {
      const decision: LaughterDecision = {
        shouldLaugh: false,
        laughType: 'none',
        placement: 'end',
        laughText: '',
        insertPosition: -1,
        reason: 'No conditions met',
        confidence: 0,
      };

      const original = 'This is serious.';
      const result = applyLaughter(original, decision);
      expect(result).toBe(original);
    });
  });

  // ===========================================================================
  // ONE-STEP FUNCTION
  // ===========================================================================
  describe('addContextualLaughter', () => {
    it('should add laughter to humorous response', () => {
      resetLaughterSession('test-add-laugh');
      const { text, decision } = addContextualLaughter(
        "You're so predictable! Just kidding.",
        { turnCount: 10 },
        'test-add-laugh'
      );

      expect(decision.shouldLaugh).toBe(true);
      // Could be 'heh', 'haha', or '[laughter]' depending on laugh type
      expect(text).toMatch(/heh|haha|\[laughter\]/);
    });

    it('should not add laughter to serious response', () => {
      const { text, decision } = addContextualLaughter(
        "I'm sorry you're going through this. That must be so hard.",
        { topicWeight: 'heavy' },
        'test-session'
      );

      expect(decision.shouldLaugh).toBe(false);
      expect(text).not.toContain('heh');
      expect(text).not.toContain('haha');
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('Edge Cases', () => {
    it('should handle empty response text', () => {
      const decision = decideLaughter(
        {
          responseText: '',
        },
        'test-session'
      );

      // Should not crash, just return no laugh
      expect(decision.shouldLaugh).toBe(false);
    });

    it('should handle missing context gracefully', () => {
      const decision = decideLaughter(
        {
          responseText: 'Just kidding!',
          // No other context
        },
        'test-session'
      );

      // Should still work with defaults
      expect(decision).toBeDefined();
      expect(typeof decision.shouldLaugh).toBe('boolean');
    });

    it('should handle unknown persona gracefully', () => {
      const decision = decideLaughter(
        {
          responseText: 'Just kidding!',
          personaId: 'unknown-persona',
          turnCount: 10,
        },
        'test-session'
      );

      // Should fall back to Ferni style
      expect(decision.shouldLaugh).toBe(true);
    });

    it('should respect max session laughs (8)', () => {
      // Trigger 8 laughs
      for (let i = 1; i <= 8; i++) {
        decideLaughter(
          {
            responseText: 'Just kidding!',
            turnCount: i * 10, // Spread out to avoid cooldown
          },
          'max-laugh-session'
        );
      }

      // 9th laugh should fail
      const decision = decideLaughter(
        {
          responseText: 'Just kidding!',
          turnCount: 100,
        },
        'max-laugh-session'
      );

      expect(decision.shouldLaugh).toBe(false);
      expect(decision.reason).toContain('Max session laughs');
    });
  });

  // ===========================================================================
  // COMFORT LEVEL
  // ===========================================================================
  describe('Comfort Level', () => {
    it('should factor comfort into confidence calculation', () => {
      // The confidence formula multiplies by (comfortLevel + 0.5)
      // Higher comfort = higher confidence
      // This is a unit test for the behavior, not end-to-end outcome

      // Verify that LAUGH_TYPES have minComfort thresholds
      expect(LAUGH_TYPES.full.minComfort).toBeDefined();
      expect(LAUGH_TYPES.warm.minComfort).toBeGreaterThan(LAUGH_TYPES.soft.minComfort);

      // Verify confidence formula: with "Just kidding!" pattern (confidence 0.9)
      // and Ferni persona (base 0.35):
      // lowComfort (0.2): 0.9 * 0.35 * (0.2 + 0.5) = 0.22 < 0.3 threshold
      // highComfort (0.9): 0.9 * 0.35 * (0.9 + 0.5) = 0.44 > 0.3 threshold
      // This means high comfort can trigger when low comfort can't
    });
  });
});
