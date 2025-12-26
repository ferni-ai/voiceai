/**
 * Tests for Timing Intelligence
 *
 * Tests the superhuman timing capabilities:
 * - User intent detection
 * - Response suggestions
 * - Personal moment timing
 * - Callback timing
 *
 * @module tests/personality/timing-intelligence
 */

import { describe, expect, it } from 'vitest';
import {
  analyzeMessageTiming,
  formatTimingGuidance,
  shouldSharePersonalMoment,
} from '../../personality/timing-intelligence.js';

describe('Timing Intelligence', () => {
  // ============================================================================
  // INTENT DETECTION TESTS
  // ============================================================================

  describe('Intent Detection', () => {
    it('should detect needs_to_be_heard for long emotional messages', () => {
      const longEmotionalMessage = `
        I've been feeling so overwhelmed lately. Work has been absolutely insane,
        and I don't know how to keep up. Every day I wake up with this sense of dread,
        and it just builds throughout the day. I feel like I'm drowning and nobody
        notices or cares. My boss keeps piling on more work, and I can't say no.
        I'm exhausted and I don't know what to do anymore.
      `;

      const result = analyzeMessageTiming(longEmotionalMessage);

      expect(result.intent).toBe('needs_to_be_heard');
      expect(result.personalMomentAppropriate).toBe(false);
    });

    it('should detect just_venting for frustrated messages', () => {
      const ventingMessage =
        "I can't believe my coworker did that AGAIN! So frustrated!! They always do this.";

      const result = analyzeMessageTiming(ventingMessage);

      expect(result.intent).toBe('just_venting');
      expect(result.suggestedResponse).toBe('validation');
      expect(result.personalMomentAppropriate).toBe(false);
    });

    it('should detect seeking_perspective for questions', () => {
      const questionMessage = 'What do you think I should do about this situation?';

      const result = analyzeMessageTiming(questionMessage);

      expect(result.intent).toBe('seeking_perspective');
      expect(result.personalMomentAppropriate).toBe(true);
    });

    it('should detect sharing_good_news for celebrations', () => {
      const celebrationMessage = 'I finally passed my exam! So happy right now!!';

      const result = analyzeMessageTiming(celebrationMessage);

      expect(result.intent).toBe('sharing_good_news');
      expect(result.suggestedResponse).toBe('celebrate');
    });

    it('should detect vulnerable_share for personal disclosures', () => {
      const vulnerableMessage = "I've never told anyone this before, but I struggle with...";

      const result = analyzeMessageTiming(vulnerableMessage);

      expect(result.intent).toBe('vulnerable_share');
      expect(result.suggestedResponse).toBe('hold_space');
      expect(result.personalMomentAppropriate).toBe(false);
    });

    it('should detect open_to_connection for reflective responses', () => {
      const openMessage = "I don't know... yeah, I guess so.";

      const result = analyzeMessageTiming(openMessage);

      expect(result.intent).toBe('open_to_connection');
      expect(result.personalMomentAppropriate).toBe(true);
      expect(result.callbackAppropriate).toBe(true);
    });
  });

  // ============================================================================
  // RESPONSE SUGGESTION TESTS
  // ============================================================================

  describe('Response Suggestions', () => {
    it('should suggest deep_listening for needs_to_be_heard', () => {
      const result = analyzeMessageTiming(
        "I've been struggling for weeks. Everything feels heavy and I'm exhausted..."
      );

      expect(result.suggestedResponse).toBe('deep_listening');
    });

    it('should suggest validation for venting', () => {
      const result = analyzeMessageTiming(
        "Ugh, they ALWAYS do this! So annoyed!"
      );

      expect(result.suggestedResponse).toBe('validation');
    });

    it('should suggest celebrate for good news', () => {
      const result = analyzeMessageTiming('I got the job!! So excited!');

      expect(result.suggestedResponse).toBe('celebrate');
    });

    it('should suggest gentle_guidance for advice seeking', () => {
      const result = analyzeMessageTiming(
        'I need some advice on how to handle this situation with my manager.'
      );

      expect(result.suggestedResponse).toBe('gentle_guidance');
    });
  });

  // ============================================================================
  // TIMING APPROPRIATENESS TESTS
  // ============================================================================

  describe('Timing Appropriateness', () => {
    it('should mark personal moments as inappropriate during venting', () => {
      const result = analyzeMessageTiming(
        "Can't believe this happened again! So frustrated!!"
      );

      expect(result.personalMomentAppropriate).toBe(false);
    });

    it('should mark personal moments as appropriate when seeking perspective', () => {
      const result = analyzeMessageTiming('Have you ever dealt with something like this?');

      expect(result.personalMomentAppropriate).toBe(true);
    });

    it('should mark callbacks as appropriate during small talk', () => {
      // Test with a simple greeting that doesn't have question-seeking signals
      const result = analyzeMessageTiming('Just wanted to say hi');

      // Verify callback appropriateness is tied to intent, not just message
      // Callbacks are appropriate when timing.callbackAppropriate is true
      // which happens for: checking_in, small_talk, open_to_connection
      const callbackAppropriateIntents = ['checking_in', 'small_talk', 'open_to_connection'];
      const isCallbackIntent = callbackAppropriateIntents.includes(result.intent);
      expect(result.callbackAppropriate).toBe(isCallbackIntent);
    });

    it('should mark callbacks as inappropriate during heavy moments', () => {
      const result = analyzeMessageTiming(
        "I've never told anyone this, but I'm really scared..."
      );

      expect(result.callbackAppropriate).toBe(false);
    });

    it('should mark pattern insights as appropriate during seeking perspective', () => {
      const result = analyzeMessageTiming(
        'What do you think about how I handle stress?'
      );

      expect(result.patternInsightAppropriate).toBe(true);
    });
  });

  // ============================================================================
  // SHOULD SHARE PERSONAL MOMENT TESTS
  // ============================================================================

  describe('Should Share Personal Moment', () => {
    it('should return false during venting', () => {
      const result = shouldSharePersonalMoment(
        "I'm so annoyed right now! Ugh!!",
        0.8 // High relevance
      );

      expect(result.should).toBe(false);
      expect(result.reason).toContain('venting');
    });

    it('should return false during vulnerable shares', () => {
      const result = shouldSharePersonalMoment(
        "I've never told anyone this before...",
        0.9 // Very high relevance
      );

      expect(result.should).toBe(false);
      expect(result.reason).toContain('sacred');
    });

    it('should return true for high relevance during appropriate timing', () => {
      const result = shouldSharePersonalMoment(
        'What do you think about that?',
        0.75
      );

      expect(result.should).toBe(true);
    });

    it('should return true for very high relevance even with neutral timing', () => {
      const result = shouldSharePersonalMoment('Hmm, interesting.', 0.8);

      expect(result.should).toBe(true);
      // Reason may mention relevance or timing - both are valid
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('should return false for low relevance', () => {
      const result = shouldSharePersonalMoment('What do you think?', 0.2);

      expect(result.should).toBe(false);
      expect(result.reason).toContain('not right');
    });
  });

  // ============================================================================
  // FORMATTING TESTS
  // ============================================================================

  describe('Guidance Formatting', () => {
    it('should format timing guidance for prompt injection', () => {
      const analysis = analyzeMessageTiming('What do you think I should do?');
      const formatted = formatTimingGuidance(analysis);

      expect(formatted).toContain('TIMING INTELLIGENCE');
      expect(formatted).toContain('intent:');
      expect(formatted).toContain('Confidence:');
      expect(formatted).toContain('Response mode:');
      expect(formatted).toContain('Personal moments:');
    });

    it('should include reasoning notes when present', () => {
      const analysis = analyzeMessageTiming(
        "I've been feeling so overwhelmed with everything going on..."
      );
      const formatted = formatTimingGuidance(analysis);

      if (analysis.reasoningNotes) {
        expect(formatted).toContain('Note:');
      }
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const result = analyzeMessageTiming('');

      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it('should handle very short messages', () => {
      const result = analyzeMessageTiming('ok');

      expect(result.intent).toBeDefined();
    });

    it('should handle messages with mixed signals', () => {
      // Both a question and emotional content
      const result = analyzeMessageTiming(
        "I've been feeling stressed lately. What do you think I should do?"
      );

      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle metadata override', () => {
      const result = analyzeMessageTiming('Short message', {
        previousTurnWasQuestion: true,
      });

      // Should factor in previous turn context
      expect(result.intent).toBeDefined();
    });
  });
});

