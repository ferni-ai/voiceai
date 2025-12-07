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
      expect(clampSpeed(0.0)).toBe(0.6);
      expect(clampSpeed(-1)).toBe(0.6);
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
      expect(clampVolume(0.0)).toBe(0.5);
      expect(clampVolume(-1)).toBe(0.5);
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

    it('should handle arbitrary time strings', () => {
      expect(breakTag('0')).toBe('<break time="0"/>');
      expect(breakTag('short')).toBe('<break time="short"/>');
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
      expect(volumeTag(1.0)).toBe('<volume ratio="1.00"/>');
      expect(volumeTag(1.5)).toBe('<volume ratio="1.50"/>');
    });

    it('should clamp and format values below minimum', () => {
      expect(volumeTag(0.2)).toBe('<volume ratio="0.50"/>');
      expect(volumeTag(0.0)).toBe('<volume ratio="0.50"/>');
    });

    it('should clamp and format values above maximum', () => {
      expect(volumeTag(2.5)).toBe('<volume ratio="2.00"/>');
      expect(volumeTag(10)).toBe('<volume ratio="2.00"/>');
    });

    it('should format to two decimal places', () => {
      expect(volumeTag(1.0)).toBe('<volume ratio="1.00"/>');
      expect(volumeTag(0.777777)).toBe('<volume ratio="0.78"/>');
    });
  });

  describe('emotionTag', () => {
    it('should generate emotion tag for valid emotions', () => {
      expect(emotionTag('happy')).toBe('<emotion value="happy"/>');
      expect(emotionTag('sad')).toBe('<emotion value="sad"/>');
      expect(emotionTag('excited')).toBe('<emotion value="excited"/>');
    });

    it('should generate emotion tag for any string', () => {
      expect(emotionTag('neutral')).toBe('<emotion value="neutral"/>');
      expect(emotionTag('custom-emotion')).toBe('<emotion value="custom-emotion"/>');
    });
  });

  describe('spellTag', () => {
    it('should wrap text in spell tag', () => {
      expect(spellTag('NASA')).toBe('<spell>NASA</spell>');
      expect(spellTag('FBI')).toBe('<spell>FBI</spell>');
    });

    it('should handle empty string', () => {
      expect(spellTag('')).toBe('<spell></spell>');
    });

    it('should handle regular words', () => {
      expect(spellTag('hello')).toBe('<spell>hello</spell>');
    });

    it('should handle mixed case', () => {
      expect(spellTag('McDonalds')).toBe('<spell>McDonalds</spell>');
    });
  });

  describe('CARTESIA_EMOTIONS', () => {
    it('should contain standard emotions', () => {
      expect(CARTESIA_EMOTIONS).toContain('neutral');
      expect(CARTESIA_EMOTIONS).toContain('happy');
      expect(CARTESIA_EMOTIONS).toContain('sad');
      expect(CARTESIA_EMOTIONS).toContain('angry');
      expect(CARTESIA_EMOTIONS).toContain('excited');
    });

    it('should contain nuanced emotions', () => {
      expect(CARTESIA_EMOTIONS).toContain('curious');
      expect(CARTESIA_EMOTIONS).toContain('affectionate');
      expect(CARTESIA_EMOTIONS).toContain('nostalgic');
      expect(CARTESIA_EMOTIONS).toContain('contemplative');
      expect(CARTESIA_EMOTIONS).toContain('grateful');
    });

    it('should contain all 16 emotions', () => {
      expect(CARTESIA_EMOTIONS).toHaveLength(16);
    });

    it('should be a readonly array', () => {
      // TypeScript ensures this at compile time, but we verify the array exists
      expect(Array.isArray(CARTESIA_EMOTIONS)).toBe(true);
    });
  });
});
