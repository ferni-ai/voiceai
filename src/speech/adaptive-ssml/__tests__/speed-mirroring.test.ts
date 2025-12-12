/**
 * Tests for Speed Mirroring
 *
 * Verifies that speech speed adjusts to match user's pace.
 */

import { describe, expect, it } from 'vitest';

import { applySpeedMirroring, estimateUserSpeed, hasSpeedMirroring } from '../speed-mirroring.js';

describe('speed-mirroring', () => {
  describe('applySpeedMirroring', () => {
    it('should speed up for rapid speech', () => {
      const result = applySpeedMirroring('Hello there', {
        isRapidSpeech: true,
      });

      expect(result.text).toContain('<speed ratio=');
      expect(result.speedRatio).toBeGreaterThan(1.0);
      expect(result.reason).toBe('matching rapid speech');
    });

    it('should slow down for slow speech', () => {
      const result = applySpeedMirroring('Hello there', {
        isSlowSpeech: true,
      });

      expect(result.text).toContain('<speed ratio=');
      expect(result.speedRatio).toBeLessThan(1.0);
      expect(result.reason).toBe('matching slow speech');
    });

    it('should use WPM when available', () => {
      const fastWpm = applySpeedMirroring('Hello', { userWpm: 180 });
      const slowWpm = applySpeedMirroring('Hello', { userWpm: 100 });

      expect(fastWpm.speedRatio).toBeGreaterThan(slowWpm.speedRatio);
      expect(fastWpm.reason).toContain('mirroring 180 WPM');
    });

    it('should use arousal as proxy when no WPM', () => {
      const highArousal = applySpeedMirroring('Hello', { userArousal: 0.9 });
      const lowArousal = applySpeedMirroring('Hello', { userArousal: 0.1 });

      expect(highArousal.speedRatio).toBeGreaterThan(lowArousal.speedRatio);
      expect(highArousal.reason).toContain('mirroring arousal');
    });

    it('should return unchanged for neutral context', () => {
      const result = applySpeedMirroring('Hello', {});

      expect(result.text).toBe('Hello');
      expect(result.speedRatio).toBe(1.0);
      // When no context provided, it's either 'no adjustment' or 'minimal adjustment skipped'
      expect(['no adjustment', 'minimal adjustment skipped']).toContain(result.reason);
    });

    it('should skip minimal adjustments', () => {
      const result = applySpeedMirroring('Hello', {
        userArousal: 0.52, // Just slightly above 0.5
      });

      // Adjustment too small, should skip
      expect(result.speedRatio).toBe(1.0);
      expect(result.reason).toBe('minimal adjustment skipped');
    });

    it('should skip if already has speed tag', () => {
      const result = applySpeedMirroring('<speed ratio="1.0"/>Hello', {
        isRapidSpeech: true,
      });

      expect(result.text).toBe('<speed ratio="1.0"/>Hello');
      expect(result.reason).toBe('skipped - existing speed tag');
    });

    it('should clamp to min/max ratios', () => {
      const tooFast = applySpeedMirroring('Hello', {
        userWpm: 300, // Very fast
      });

      const tooSlow = applySpeedMirroring('Hello', {
        userWpm: 50, // Very slow
      });

      expect(tooFast.speedRatio).toBeLessThanOrEqual(1.15);
      expect(tooSlow.speedRatio).toBeGreaterThanOrEqual(0.85);
    });

    it('should respect custom max adjustment', () => {
      const result = applySpeedMirroring(
        'Hello',
        {
          isRapidSpeech: true,
        },
        { maxAdjustment: 0.05 }
      );

      // Max 5% adjustment
      expect(result.speedRatio).toBeLessThanOrEqual(1.05);
    });

    it('should respect custom min/max ratios', () => {
      const result = applySpeedMirroring(
        'Hello',
        {
          isSlowSpeech: true,
        },
        { minRatio: 0.95 }
      );

      // Can't go below 0.95
      expect(result.speedRatio).toBeGreaterThanOrEqual(0.95);
    });

    it('should prioritize explicit flags over WPM', () => {
      const result = applySpeedMirroring('Hello', {
        isRapidSpeech: true,
        userWpm: 100, // Slow WPM
      });

      // Flag takes precedence
      expect(result.speedRatio).toBeGreaterThan(1.0);
      expect(result.reason).toBe('matching rapid speech');
    });
  });

  describe('estimateUserSpeed', () => {
    it('should return fast for rapid speech flag', () => {
      expect(estimateUserSpeed({ isRapidSpeech: true })).toBe('fast');
    });

    it('should return slow for slow speech flag', () => {
      expect(estimateUserSpeed({ isSlowSpeech: true })).toBe('slow');
    });

    it('should return fast for high WPM', () => {
      expect(estimateUserSpeed({ userWpm: 180 })).toBe('fast');
    });

    it('should return slow for low WPM', () => {
      expect(estimateUserSpeed({ userWpm: 100 })).toBe('slow');
    });

    it('should return normal for average WPM', () => {
      expect(estimateUserSpeed({ userWpm: 150 })).toBe('normal');
    });

    it('should return fast for high arousal', () => {
      expect(estimateUserSpeed({ userArousal: 0.8 })).toBe('fast');
    });

    it('should return slow for low arousal', () => {
      expect(estimateUserSpeed({ userArousal: 0.2 })).toBe('slow');
    });

    it('should return normal with no context', () => {
      expect(estimateUserSpeed({})).toBe('normal');
    });
  });

  describe('hasSpeedMirroring', () => {
    it('should detect speed ratio tag', () => {
      expect(hasSpeedMirroring('<speed ratio="1.1"/>Hello')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(hasSpeedMirroring('Hello there')).toBe(false);
    });

    it('should return false for other tags', () => {
      expect(hasSpeedMirroring('<break time="100ms"/>Hello')).toBe(false);
    });
  });
});
