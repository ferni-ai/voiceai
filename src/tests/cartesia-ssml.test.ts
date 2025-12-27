/**
 * Cartesia SSML Tag Helpers Tests
 *
 * Tests for SSML tag generation for Cartesia TTS:
 * - clampSpeed: Speed clamping to valid range
 * - clampVolume: Volume clamping to valid range
 * - breakTag, speedTag, volumeTag, emotionTag, spellTag
 * - CARTESIA_EMOTIONS constant
 */

import { describe, it, expect } from 'vitest';
import {
  clampSpeed,
  clampVolume,
  breakTag,
  speedTag,
  volumeTag,
  emotionTag,
  spellTag,
  CARTESIA_EMOTIONS,
  ALL_CARTESIA_EMOTIONS,
  CARTESIA_SUPPORTED_EMOTIONS,
} from '../ssml/cartesia.js';

describe('Cartesia SSML Tag Helpers', () => {
  describe('clampSpeed', () => {
    it('should return value within range unchanged', () => {
      expect(clampSpeed(1.0)).toBe(1.0);
      expect(clampSpeed(0.8)).toBe(0.8);
      expect(clampSpeed(1.2)).toBe(1.2);
    });

    it('should clamp values below minimum to 0.6', () => {
      expect(clampSpeed(0.5)).toBe(0.6);
      expect(clampSpeed(0.3)).toBe(0.6);
      expect(clampSpeed(0)).toBe(0.6);
    });

    it('should clamp values above maximum to 1.5', () => {
      expect(clampSpeed(1.6)).toBe(1.5);
      expect(clampSpeed(2.0)).toBe(1.5);
      expect(clampSpeed(10)).toBe(1.5);
    });

    it('should handle edge values exactly at bounds', () => {
      expect(clampSpeed(0.6)).toBe(0.6);
      expect(clampSpeed(1.5)).toBe(1.5);
    });
  });

  describe('clampVolume', () => {
    it('should return value within range unchanged', () => {
      expect(clampVolume(1.0)).toBe(1.0);
      expect(clampVolume(0.8)).toBe(0.8);
      expect(clampVolume(1.5)).toBe(1.5);
    });

    it('should clamp values below minimum to 0.5', () => {
      expect(clampVolume(0.4)).toBe(0.5);
      expect(clampVolume(0.2)).toBe(0.5);
      expect(clampVolume(0)).toBe(0.5);
    });

    it('should clamp values above maximum to 2.0', () => {
      expect(clampVolume(2.1)).toBe(2.0);
      expect(clampVolume(3.0)).toBe(2.0);
      expect(clampVolume(10)).toBe(2.0);
    });

    it('should handle edge values exactly at bounds', () => {
      expect(clampVolume(0.5)).toBe(0.5);
      expect(clampVolume(2.0)).toBe(2.0);
    });
  });

  describe('breakTag', () => {
    it('should generate break tag with milliseconds', () => {
      expect(breakTag('500ms')).toBe('<break time="500ms"/>');
      expect(breakTag('100ms')).toBe('<break time="100ms"/>');
    });

    it('should generate break tag with seconds', () => {
      expect(breakTag('1s')).toBe('<break time="1s"/>');
      expect(breakTag('2.5s')).toBe('<break time="2.5s"/>');
    });

    it('should return default break tag for invalid time strings', () => {
      // Implementation validates format and returns default for invalid inputs
      expect(breakTag('0')).toBe('<break time="500ms"/>');
      expect(breakTag('short')).toBe('<break time="500ms"/>');
      expect(breakTag('invalid')).toBe('<break time="500ms"/>');
    });
  });

  describe('speedTag', () => {
    it('should generate speed tag with clamped value', () => {
      expect(speedTag(1.0)).toBe('<speed ratio="1.00"/>');
      expect(speedTag(0.8)).toBe('<speed ratio="0.80"/>');
      expect(speedTag(1.2)).toBe('<speed ratio="1.20"/>');
    });

    it('should clamp and format values below minimum', () => {
      expect(speedTag(0.3)).toBe('<speed ratio="0.60"/>');
      expect(speedTag(0.0)).toBe('<speed ratio="0.60"/>');
    });

    it('should clamp and format values above maximum', () => {
      expect(speedTag(2.0)).toBe('<speed ratio="1.50"/>');
      expect(speedTag(5.0)).toBe('<speed ratio="1.50"/>');
    });

    it('should format to two decimal places', () => {
      expect(speedTag(1.0)).toBe('<speed ratio="1.00"/>');
      expect(speedTag(0.666666)).toBe('<speed ratio="0.67"/>');
    });
  });

  describe('volumeTag', () => {
    it('should generate volume tag with clamped value', () => {
      // Note: Implementation uses .toFixed(1) for volume
      expect(volumeTag(1.0)).toBe('<volume ratio="1.0"/>');
      expect(volumeTag(1.5)).toBe('<volume ratio="1.5"/>');
    });

    it('should clamp and format values below minimum', () => {
      expect(volumeTag(0.2)).toBe('<volume ratio="0.5"/>');
      expect(volumeTag(0.0)).toBe('<volume ratio="0.5"/>');
    });

    it('should clamp and format values above maximum', () => {
      expect(volumeTag(2.5)).toBe('<volume ratio="2.0"/>');
      expect(volumeTag(10)).toBe('<volume ratio="2.0"/>');
    });

    it('should format to one decimal place', () => {
      expect(volumeTag(1.0)).toBe('<volume ratio="1.0"/>');
      expect(volumeTag(0.77)).toBe('<volume ratio="0.8"/>');
    });
  });

  describe('emotionTag', () => {
    it('should generate emotion tag only for supported emotions', () => {
      // Only CARTESIA_SUPPORTED_EMOTIONS generate tags
      expect(emotionTag('angry')).toBe('<emotion value="angry"/>');
      expect(emotionTag('sad')).toBe('<emotion value="sad"/>');
      expect(emotionTag('surprised')).toBe('<emotion value="surprised"/>');
      expect(emotionTag('curious')).toBe('<emotion value="curious"/>');
      expect(emotionTag('affectionate')).toBe('<emotion value="affectionate"/>');
    });

    it('should return empty string for unsupported emotions', () => {
      // These emotions are in CARTESIA_EMOTIONS but not in CARTESIA_SUPPORTED_EMOTIONS
      expect(emotionTag('happy')).toBe('');
      expect(emotionTag('excited')).toBe('');
      expect(emotionTag('neutral')).toBe('');
      expect(emotionTag('custom-emotion')).toBe('');
    });
  });

  describe('spellTag', () => {
    it('should wrap acronyms in spell tag', () => {
      expect(spellTag('NASA')).toBe('<spell>NASA</spell>');
      expect(spellTag('FBI')).toBe('<spell>FBI</spell>');
      expect(spellTag('ABC123')).toBe('<spell>ABC123</spell>');
    });

    it('should return original text for non-acronyms', () => {
      // Only 2-10 uppercase alphanumeric chars get wrapped
      expect(spellTag('')).toBe('');
      expect(spellTag('hello')).toBe('hello');
      expect(spellTag('McDonalds')).toBe('McDonalds');
      expect(spellTag('A')).toBe('A'); // Too short
    });
  });

  describe('CARTESIA_EMOTIONS', () => {
    it('should be an object with emotion constants', () => {
      expect(typeof CARTESIA_EMOTIONS).toBe('object');
      expect(CARTESIA_EMOTIONS).not.toBeNull();
    });

    it('should contain standard emotions as constants', () => {
      expect(CARTESIA_EMOTIONS.NEUTRAL).toBe('neutral');
      expect(CARTESIA_EMOTIONS.HAPPY).toBe('happy');
      expect(CARTESIA_EMOTIONS.SAD).toBe('sad');
      expect(CARTESIA_EMOTIONS.ANGRY).toBe('angry');
      expect(CARTESIA_EMOTIONS.EXCITED).toBe('excited');
    });

    it('should contain nuanced emotions as constants', () => {
      expect(CARTESIA_EMOTIONS.CURIOUS).toBe('curious');
      expect(CARTESIA_EMOTIONS.AFFECTIONATE).toBe('affectionate');
      expect(CARTESIA_EMOTIONS.NOSTALGIC).toBe('nostalgic');
      expect(CARTESIA_EMOTIONS.CONTEMPLATIVE).toBe('contemplative');
      expect(CARTESIA_EMOTIONS.GRATEFUL).toBe('grateful');
    });

    it('should have more than 16 emotions (expanded set)', () => {
      const emotionCount = Object.keys(CARTESIA_EMOTIONS).length;
      expect(emotionCount).toBeGreaterThan(16);
    });
  });

  describe('ALL_CARTESIA_EMOTIONS', () => {
    it('should be an array', () => {
      expect(Array.isArray(ALL_CARTESIA_EMOTIONS)).toBe(true);
    });

    it('should contain all emotion values', () => {
      expect(ALL_CARTESIA_EMOTIONS).toContain('neutral');
      expect(ALL_CARTESIA_EMOTIONS).toContain('happy');
      expect(ALL_CARTESIA_EMOTIONS).toContain('sad');
      expect(ALL_CARTESIA_EMOTIONS).toContain('angry');
      expect(ALL_CARTESIA_EMOTIONS).toContain('curious');
    });

    it('should have length matching CARTESIA_EMOTIONS keys', () => {
      expect(ALL_CARTESIA_EMOTIONS.length).toBe(Object.keys(CARTESIA_EMOTIONS).length);
    });
  });

  describe('CARTESIA_SUPPORTED_EMOTIONS', () => {
    it('should be a subset of emotions for direct tag support', () => {
      expect(Array.isArray(CARTESIA_SUPPORTED_EMOTIONS)).toBe(true);
      expect(CARTESIA_SUPPORTED_EMOTIONS.length).toBeLessThan(ALL_CARTESIA_EMOTIONS.length);
    });

    it('should contain the 5 directly supported emotions', () => {
      expect(CARTESIA_SUPPORTED_EMOTIONS).toContain('angry');
      expect(CARTESIA_SUPPORTED_EMOTIONS).toContain('sad');
      expect(CARTESIA_SUPPORTED_EMOTIONS).toContain('surprised');
      expect(CARTESIA_SUPPORTED_EMOTIONS).toContain('curious');
      expect(CARTESIA_SUPPORTED_EMOTIONS).toContain('affectionate');
    });
  });
});
