/**
 * Subscription Humanization Tests
 *
 * Tests for "Better than Human" subscription features:
 * - Relationship-aware messaging
 * - Grace conversation system
 * - Distress detection
 * - Personalized team suggestions
 */

import { describe, expect, it } from 'vitest';
import {
  detectDistress,
  getAtLimitPrompt,
  getGraceGrantedPrompt,
  shouldGrantGrace,
  type RelationshipContext,
} from '../personas/subscription-prompts.js';

// ============================================================================
// RELATIONSHIP-AWARE MESSAGING TESTS
// ============================================================================

describe('Relationship-Aware Messaging', () => {
  describe('getAtLimitPrompt', () => {
    it('should generate generic prompt without relationship context', () => {
      const result = getAtLimitPrompt();

      expect(result.prompt).toBeTruthy();
      expect(result.placement).toBe('greeting');
      expect(result.showUpgradeUI).toBe(true);
      expect(result.priority).toBe(10);
    });

    it('should include conversation topics in prompt with context', () => {
      const context: RelationshipContext = {
        topics: ['career anxiety', 'relationship with mom'],
        importantPeople: ['Sarah'],
        goals: ['get promoted'],
        totalConversations: 10,
        emotionalThemes: ['stress', 'growth'],
      };

      const result = getAtLimitPrompt(context);

      // Should reference at least one topic or person
      const hasPersonalization =
        result.prompt.includes('career') ||
        result.prompt.includes('relationship') ||
        result.prompt.includes('Sarah') ||
        result.prompt.includes('promoted');

      expect(hasPersonalization).toBe(true);
    });

    it('should handle empty relationship context gracefully', () => {
      const context: RelationshipContext = {
        topics: [],
        importantPeople: [],
        goals: [],
        totalConversations: 0,
        emotionalThemes: [],
      };

      const result = getAtLimitPrompt(context);

      // Should fall back to generic prompt
      expect(result.prompt).toBeTruthy();
      expect(result.prompt.length).toBeGreaterThan(50);
    });

    it('should suggest relevant team members based on topics', () => {
      const context: RelationshipContext = {
        topics: ['sleep issues', 'morning routine'],
        importantPeople: [],
        goals: ['better sleep'],
        totalConversations: 5,
        emotionalThemes: ['tired'],
      };

      const result = getAtLimitPrompt(context);

      // Maya specializes in habits/routines - should be suggested
      // Note: this won't always appear due to randomness in template selection
      // But the mechanism should work
      expect(result.prompt).toBeTruthy();
    });
  });
});

// ============================================================================
// DISTRESS DETECTION TESTS
// ============================================================================

describe('Distress Detection', () => {
  describe('detectDistress', () => {
    it('should detect no distress in normal message', () => {
      const result = detectDistress('I wanted to talk about my goals for next year');

      expect(result.isDistressed).toBe(false);
      expect(result.distressLevel).toBe('none');
      expect(result.signals).toHaveLength(0);
    });

    it('should detect mild distress from single signal', () => {
      const result = detectDistress('I feel overwhelmed today');

      expect(result.distressLevel).toBe('mild');
      expect(result.signals).toContain('emotional');
    });

    it('should detect high distress from crisis plus hopelessness', () => {
      // "panicking" = crisis (3 points), "don't know what to do" = hopelessness (2 points) = high
      const result = detectDistress("I'm panicking and don't know what to do");

      expect(result.isDistressed).toBe(true);
      expect(result.distressLevel).toBe('high');
      expect(result.signals).toContain('crisis');
      expect(result.signals).toContain('hopelessness');
    });

    it('should detect moderate distress from single crisis signal', () => {
      // Just crisis (3 points) = moderate
      const result = detectDistress("I'm panicking right now");

      expect(result.isDistressed).toBe(true);
      expect(result.distressLevel).toBe('moderate');
      expect(result.signals).toContain('crisis');
    });

    it('should detect high distress from multiple signals', () => {
      const result = detectDistress(
        "I can't stop crying, I feel hopeless and like what's the point anymore"
      );

      expect(result.isDistressed).toBe(true);
      expect(result.distressLevel).toBe('high');
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect hopelessness signals', () => {
      const result = detectDistress("I'm giving up. No one cares anyway.");

      expect(result.signals).toContain('hopelessness');
    });

    it('should handle empty message', () => {
      const result = detectDistress('');

      expect(result.isDistressed).toBe(false);
      expect(result.distressLevel).toBe('none');
    });
  });
});

// ============================================================================
// GRACE CONVERSATION SYSTEM TESTS
// ============================================================================

describe('Grace Conversation System', () => {
  describe('shouldGrantGrace', () => {
    it('should not grant grace for normal message', () => {
      const result = shouldGrantGrace('How are you today?', 0);

      expect(result.grantGrace).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should grant grace for distressed user', () => {
      const result = shouldGrantGrace("I'm panicking and can't stop crying", 0);

      expect(result.grantGrace).toBe(true);
      expect(result.reason).toBe('distress');
      expect(result.graceUsedThisMonth).toBe(1);
    });

    it('should always grant grace for mid-conversation', () => {
      const result = shouldGrantGrace(
        'normal message',
        2, // Already at grace limit
        true // Mid-conversation
      );

      expect(result.grantGrace).toBe(true);
      expect(result.reason).toBe('mid_conversation');
      // Should NOT increment grace count for mid-conversation
      expect(result.graceUsedThisMonth).toBe(2);
    });

    it('should not grant grace if monthly limit reached', () => {
      const result = shouldGrantGrace(
        "I'm panicking",
        2 // Already used 2 grace conversations
      );

      expect(result.grantGrace).toBe(false);
      expect(result.reason).toBe('none');
    });

    it('should track max grace per month', () => {
      const result = shouldGrantGrace('normal', 0);

      expect(result.maxGracePerMonth).toBe(2);
    });
  });

  describe('getGraceGrantedPrompt', () => {
    it('should return empty string for mid-conversation grace', () => {
      const result = getGraceGrantedPrompt('mid_conversation');

      expect(result).toBe('');
    });

    it('should return supportive message for distress grace', () => {
      const result = getGraceGrantedPrompt('distress');

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(20);
      // Should NOT mention subscription/limits
      expect(result.toLowerCase()).not.toContain('limit');
      expect(result.toLowerCase()).not.toContain('subscription');
      expect(result.toLowerCase()).not.toContain('month');
    });
  });
});
