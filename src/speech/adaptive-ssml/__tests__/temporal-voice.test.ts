/**
 * Tests for Temporal Voice Adaptation
 *
 * Verifies that voice adjusts based on time of day.
 */

import { describe, expect, it } from 'vitest';

import { applyTemporalVoice, getTimePeriodName, isLateNight } from '../temporal-voice.js';

describe('temporal-voice', () => {
  describe('applyTemporalVoice', () => {
    it('should apply late night adjustments (slower, softer)', () => {
      const result = applyTemporalVoice('Hello', { hour: 2 }); // 2 AM

      expect(result.adjustments.period).toBe('late night');
      expect(result.adjustments.speedRatio).toBeLessThan(1.0);
      expect(result.adjustments.volumeRatio).toBeLessThan(1.0);
      expect(result.text).toContain('<speed');
      expect(result.text).toContain('<volume');
    });

    it('should apply late night at 11pm', () => {
      const result = applyTemporalVoice('Hello', { hour: 23 });

      expect(result.adjustments.period).toBe('late night');
      // Base is 0.9, but day-of-week modifiers may affect final value
      expect(result.adjustments.speedRatio).toBeLessThan(1.0);
    });

    it('should apply late night at 3am', () => {
      const result = applyTemporalVoice('Hello', { hour: 3 });

      expect(result.adjustments.period).toBe('late night');
    });

    it('should apply very early morning adjustments', () => {
      const result = applyTemporalVoice('Good morning', { hour: 5 });

      expect(result.adjustments.period).toBe('early morning');
      expect(result.adjustments.speedRatio).toBeLessThan(1.0);
    });

    it('should apply no adjustments during afternoon on Tuesday', () => {
      // Use Tuesday (2) which has no day modifier
      const result = applyTemporalVoice('Hello', { hour: 14, dayOfWeek: 2 });

      expect(result.adjustments.period).toBe('afternoon');
      expect(result.adjustments.speedRatio).toBe(1.0);
      expect(result.adjustments.volumeRatio).toBe(1.0);
      // No tags added
      expect(result.text).toBe('Hello');
    });

    it('should apply evening adjustments', () => {
      const result = applyTemporalVoice('Hello', { hour: 19 }); // 7 PM

      expect(result.adjustments.period).toBe('evening');
      expect(result.adjustments.speedRatio).toBeLessThan(1.0);
    });

    it('should apply night adjustments', () => {
      const result = applyTemporalVoice('Hello', { hour: 21 }); // 9 PM

      expect(result.adjustments.period).toBe('night');
      expect(result.adjustments.speedRatio).toBeLessThan(1.0);
    });

    it('should apply Friday modifier (lighter energy)', () => {
      const result = applyTemporalVoice('Hello', {
        hour: 14,
        dayOfWeek: 5, // Friday
      });

      // Friday has slight speed increase
      expect(result.adjustments.speedRatio).toBeGreaterThanOrEqual(1.0);
    });

    it('should apply Monday modifier (supportive)', () => {
      const result = applyTemporalVoice('Hello', {
        hour: 9,
        dayOfWeek: 1, // Monday
      });

      // Monday has slight slowdown for support
      expect(result.adjustments.speedRatio).toBeLessThanOrEqual(1.0);
    });

    it('should apply weekend modifier (relaxed)', () => {
      const saturday = applyTemporalVoice('Hello', {
        hour: 14,
        dayOfWeek: 6, // Saturday
      });

      const sunday = applyTemporalVoice('Hello', {
        hour: 14,
        dayOfWeek: 0, // Sunday
      });

      expect(saturday.adjustments.speedRatio).toBeLessThan(1.0);
      expect(sunday.adjustments.speedRatio).toBeLessThan(1.0);
    });

    it('should skip if already has speed/volume tags', () => {
      const result = applyTemporalVoice('<speed ratio="1.0"/>Hello', { hour: 2 });

      expect(result.adjustments.period).toBe('skipped');
      expect(result.text).toBe('<speed ratio="1.0"/>Hello');
    });

    it('should respect enableLateNight option', () => {
      // Use Tuesday (2) which has no day modifier to isolate late night behavior
      const result = applyTemporalVoice(
        'Hello',
        { hour: 2, dayOfWeek: 2 },
        { enableLateNight: false }
      );

      // Late night disabled, should be standard (no late night slowdown)
      expect(result.adjustments.speedRatio).toBe(1.0);
    });

    it('should respect enableDayAwareness option', () => {
      const withDay = applyTemporalVoice(
        'Hello',
        {
          hour: 14,
          dayOfWeek: 5,
        },
        { enableDayAwareness: true }
      );

      const withoutDay = applyTemporalVoice(
        'Hello',
        {
          hour: 14,
          dayOfWeek: 5,
        },
        { enableDayAwareness: false }
      );

      // Without day awareness, Friday modifier should not apply
      expect(withDay.adjustments.speedRatio).not.toBe(withoutDay.adjustments.speedRatio);
    });

    it('should combine time and day modifiers', () => {
      // Late Saturday night
      const result = applyTemporalVoice('Hello', {
        hour: 23,
        dayOfWeek: 6,
      });

      // Should have both late night AND weekend slowdown
      expect(result.adjustments.speedRatio).toBeLessThan(0.9);
    });
  });

  describe('isLateNight', () => {
    it('should return true for 11pm-4am', () => {
      expect(isLateNight(23)).toBe(true);
      expect(isLateNight(0)).toBe(true);
      expect(isLateNight(1)).toBe(true);
      expect(isLateNight(2)).toBe(true);
      expect(isLateNight(3)).toBe(true);
      expect(isLateNight(4)).toBe(true);
    });

    it('should return false for daytime hours', () => {
      expect(isLateNight(5)).toBe(false);
      expect(isLateNight(12)).toBe(false);
      expect(isLateNight(18)).toBe(false);
      expect(isLateNight(22)).toBe(false);
    });
  });

  describe('getTimePeriodName', () => {
    it('should return correct period names', () => {
      expect(getTimePeriodName(2)).toBe('late night');
      expect(getTimePeriodName(5)).toBe('early morning');
      expect(getTimePeriodName(10)).toBe('mid-morning');
      expect(getTimePeriodName(14)).toBe('afternoon');
      expect(getTimePeriodName(18)).toBe('evening');
      expect(getTimePeriodName(21)).toBe('night');
    });
  });
});
