/**
 * Handoff Timing Tests
 *
 * Tests for handoff timing constants and helper functions.
 *
 * @module @ferni/config/__tests__/handoff-timing
 */

import { describe, expect, it } from 'vitest';
import {
  getPostSoundPause,
  getRateLimitCooldown,
  getTransitionDelay,
  HANDOFF_TIMING,
  isHandoffAllowed,
  TRANSITION_MULTIPLIERS,
  type TransitionStyle,
} from '../handoff-timing.js';

describe('Handoff Timing', () => {
  describe('HANDOFF_TIMING constants', () => {
    describe('Transition Delays', () => {
      it('should have user-initiated delay (snappy)', () => {
        expect(HANDOFF_TIMING.USER_INITIATED).toBe(200);
      });

      it('should have first meeting delay (theatrical)', () => {
        expect(HANDOFF_TIMING.FIRST_MEETING).toBe(400);
      });

      it('should have returning to coach delay (warm)', () => {
        expect(HANDOFF_TIMING.RETURNING_TO_COACH).toBe(300);
      });

      it('should have standard delay', () => {
        expect(HANDOFF_TIMING.STANDARD).toBe(350);
      });

      it('should have delays in logical order', () => {
        // User-initiated should be fastest
        expect(HANDOFF_TIMING.USER_INITIATED).toBeLessThan(HANDOFF_TIMING.RETURNING_TO_COACH);
        expect(HANDOFF_TIMING.RETURNING_TO_COACH).toBeLessThan(HANDOFF_TIMING.FIRST_MEETING);
      });
    });

    describe('Post-Sound Timing', () => {
      it('should have base post-sound pause', () => {
        expect(HANDOFF_TIMING.POST_SOUND_PAUSE_BASE).toBe(250);
      });

      it('should have first meeting bonus', () => {
        expect(HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS).toBe(150);
      });

      it('should have dramatic bonus', () => {
        expect(HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS).toBe(100);
      });
    });

    describe('Rate Limiting', () => {
      it('should have debounce time (prevent rapid switching)', () => {
        expect(HANDOFF_TIMING.DEBOUNCE_MS).toBe(800);
      });

      it('should have rate limit window', () => {
        expect(HANDOFF_TIMING.RATE_LIMIT_WINDOW_MS).toBe(60000); // 1 minute
      });

      it('should have max handoffs per window', () => {
        expect(HANDOFF_TIMING.MAX_HANDOFFS_PER_WINDOW).toBe(15);
      });
    });

    describe('Timeouts', () => {
      it('should have handoff timeout', () => {
        expect(HANDOFF_TIMING.HANDOFF_TIMEOUT_MS).toBe(15000); // 15 seconds
      });

      it('should have max feedback delay', () => {
        expect(HANDOFF_TIMING.MAX_FEEDBACK_DELAY).toBe(500);
      });
    });
  });

  describe('TRANSITION_MULTIPLIERS', () => {
    it('should have standard multiplier of 1.0', () => {
      expect(TRANSITION_MULTIPLIERS.standard).toBe(1.0);
    });

    it('should have dramatic multiplier > 1.0', () => {
      expect(TRANSITION_MULTIPLIERS.dramatic).toBe(1.3);
      expect(TRANSITION_MULTIPLIERS.dramatic).toBeGreaterThan(1.0);
    });

    it('should have subtle multiplier < 1.0', () => {
      expect(TRANSITION_MULTIPLIERS.subtle).toBe(0.8);
      expect(TRANSITION_MULTIPLIERS.subtle).toBeLessThan(1.0);
    });

    it('should have warm multiplier of 1.0', () => {
      expect(TRANSITION_MULTIPLIERS.warm).toBe(1.0);
    });
  });

  describe('getTransitionDelay', () => {
    it('should return standard delay by default', () => {
      const delay = getTransitionDelay();
      expect(delay).toBe(HANDOFF_TIMING.STANDARD);
    });

    it('should return user-initiated delay when specified', () => {
      const delay = getTransitionDelay('standard', true);
      expect(delay).toBe(HANDOFF_TIMING.USER_INITIATED);
    });

    it('should return first meeting delay', () => {
      const delay = getTransitionDelay('standard', false, true);
      expect(delay).toBe(HANDOFF_TIMING.FIRST_MEETING);
    });

    it('should return returning to coach delay', () => {
      const delay = getTransitionDelay('standard', false, false, true);
      expect(delay).toBe(HANDOFF_TIMING.RETURNING_TO_COACH);
    });

    it('should apply style multipliers', () => {
      const standardDelay = getTransitionDelay('standard', false, false, false);
      const dramaticDelay = getTransitionDelay('dramatic', false, false, false);

      expect(dramaticDelay).toBe(Math.round(standardDelay * TRANSITION_MULTIPLIERS.dramatic));
    });

    it('should apply dramatic multiplier to first meeting', () => {
      const standardFirstMeeting = getTransitionDelay('standard', false, true);
      const dramaticFirstMeeting = getTransitionDelay('dramatic', false, true);

      expect(dramaticFirstMeeting).toBe(
        Math.round(standardFirstMeeting * TRANSITION_MULTIPLIERS.dramatic)
      );
    });

    it('should apply subtle multiplier (faster)', () => {
      const standardDelay = getTransitionDelay('standard');
      const subtleDelay = getTransitionDelay('subtle');

      expect(subtleDelay).toBeLessThan(standardDelay);
    });

    it('should prioritize user-initiated over other contexts', () => {
      // User-initiated should override first meeting
      const delay = getTransitionDelay('standard', true, true);
      expect(delay).toBe(HANDOFF_TIMING.USER_INITIATED);
    });
  });

  describe('getPostSoundPause', () => {
    it('should return base pause by default', () => {
      const pause = getPostSoundPause();
      expect(pause).toBe(HANDOFF_TIMING.POST_SOUND_PAUSE_BASE);
    });

    it('should add first meeting bonus', () => {
      const basePause = getPostSoundPause('standard', false);
      const firstMeetingPause = getPostSoundPause('standard', true);

      expect(firstMeetingPause).toBe(
        basePause + HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS
      );
    });

    it('should add dramatic style bonus', () => {
      const standardPause = getPostSoundPause('standard');
      const dramaticPause = getPostSoundPause('dramatic');

      expect(dramaticPause).toBe(standardPause + HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS);
    });

    it('should stack first meeting and dramatic bonuses', () => {
      const pause = getPostSoundPause('dramatic', true);

      const expected =
        HANDOFF_TIMING.POST_SOUND_PAUSE_BASE +
        HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS +
        HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS;

      expect(pause).toBe(expected);
    });

    it('should not add bonus for subtle style', () => {
      const standardPause = getPostSoundPause('standard');
      const subtlePause = getPostSoundPause('subtle');

      expect(subtlePause).toBe(standardPause);
    });
  });

  describe('isHandoffAllowed', () => {
    it('should return true if enough time has passed', () => {
      const oldTimestamp = Date.now() - 1000; // 1 second ago
      expect(isHandoffAllowed(oldTimestamp)).toBe(true);
    });

    it('should return false if not enough time has passed', () => {
      const recentTimestamp = Date.now() - 100; // 100ms ago
      expect(isHandoffAllowed(recentTimestamp)).toBe(false);
    });

    it('should return true exactly at debounce boundary', () => {
      const boundaryTimestamp = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS;
      expect(isHandoffAllowed(boundaryTimestamp)).toBe(true);
    });

    it('should return false just before debounce boundary', () => {
      const justBeforeBoundary = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS + 1;
      expect(isHandoffAllowed(justBeforeBoundary)).toBe(false);
    });
  });

  describe('getRateLimitCooldown', () => {
    it('should return 0 when handoff is allowed', () => {
      const oldTimestamp = Date.now() - 1000;
      expect(getRateLimitCooldown(oldTimestamp)).toBe(0);
    });

    it('should return remaining cooldown time', () => {
      const recentTimestamp = Date.now() - 100;
      const cooldown = getRateLimitCooldown(recentTimestamp);

      // Should be approximately DEBOUNCE_MS - 100
      expect(cooldown).toBeGreaterThan(0);
      expect(cooldown).toBeLessThanOrEqual(HANDOFF_TIMING.DEBOUNCE_MS - 100);
    });

    it('should return full debounce time for very recent handoff', () => {
      const justNow = Date.now();
      const cooldown = getRateLimitCooldown(justNow);

      expect(cooldown).toBe(HANDOFF_TIMING.DEBOUNCE_MS);
    });
  });

  describe('Design System Alignment', () => {
    // These tests ensure the timing values align with design system DURATION constants

    it('USER_INITIATED should match DURATION.NORMAL (200ms)', () => {
      expect(HANDOFF_TIMING.USER_INITIATED).toBe(200); // DURATION.NORMAL
    });

    it('FIRST_MEETING should match DURATION.MODERATE (400ms)', () => {
      expect(HANDOFF_TIMING.FIRST_MEETING).toBe(400); // DURATION.MODERATE
    });

    it('RETURNING_TO_COACH should match DURATION.SLOW (300ms)', () => {
      expect(HANDOFF_TIMING.RETURNING_TO_COACH).toBe(300); // DURATION.SLOW
    });

    it('DEBOUNCE_MS should match DURATION.CELEBRATION (800ms)', () => {
      expect(HANDOFF_TIMING.DEBOUNCE_MS).toBe(800); // DURATION.CELEBRATION
    });

    it('MAX_FEEDBACK_DELAY should match DURATION.DELIBERATE (500ms)', () => {
      expect(HANDOFF_TIMING.MAX_FEEDBACK_DELAY).toBe(500); // DURATION.DELIBERATE
    });
  });
});
