/**
 * Text Utils Tests
 *
 * Tests for SSML stripping, text normalization, and name detection.
 *
 * @module utils/__tests__/text-utils.test
 */

import { describe, it, expect } from 'vitest';
import { stripSSML, containsSSML, normalizeForComparison, looksLikeName } from '../text-utils.js';

describe('Text Utils', () => {
  describe('stripSSML', () => {
    it('should strip self-closing tags', () => {
      expect(stripSSML('<break time="200ms"/>Hello there!')).toBe('Hello there!');
      expect(stripSSML('<laugh/>Ha ha!')).toBe('Ha ha!');
      expect(stripSSML('<sigh/>Oh well')).toBe('Oh well');
    });

    it('should strip prosody tags', () => {
      expect(stripSSML('<prosody rate="90%">How are you?</prosody>')).toBe('How are you?');
      expect(stripSSML('<prosody pitch="+10%">Really?</prosody>')).toBe('Really?');
    });

    it('should strip emphasis tags', () => {
      expect(stripSSML('<emphasis level="strong">Very</emphasis> important')).toBe(
        'Very important'
      );
    });

    it('should strip multiple nested tags', () => {
      const input =
        '<prosody rate="95%"><break time="100ms"/>Hello <emphasis>friend</emphasis>!</prosody>';
      expect(stripSSML(input)).toBe('Hello friend!');
    });

    it('should handle text without SSML', () => {
      expect(stripSSML('Plain text')).toBe('Plain text');
      expect(stripSSML('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(stripSSML(null as unknown as string)).toBe(null);
      expect(stripSSML(undefined as unknown as string)).toBe(undefined);
    });

    it('should clean up extra whitespace', () => {
      expect(stripSSML('<break/>  Multiple   spaces  <break/>')).toBe('Multiple spaces');
    });
  });

  describe('containsSSML', () => {
    it('should detect self-closing tags', () => {
      expect(containsSSML('<break time="200ms"/>')).toBe(true);
      expect(containsSSML('Hello <laugh/> world')).toBe(true);
    });

    it('should detect opening tags', () => {
      expect(containsSSML('<prosody rate="90%">text')).toBe(true);
      expect(containsSSML('<emphasis>')).toBe(true);
    });

    it('should detect closing tags', () => {
      expect(containsSSML('text</prosody>')).toBe(true);
      expect(containsSSML('</emphasis>')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(containsSSML('Plain text')).toBe(false);
      expect(containsSSML('No tags here')).toBe(false);
    });

    it('should handle empty/null input', () => {
      expect(containsSSML('')).toBe(false);
      expect(containsSSML(null as unknown as string)).toBe(false);
    });
  });

  describe('normalizeForComparison', () => {
    it('should lowercase text', () => {
      expect(normalizeForComparison('HELLO')).toBe('hello');
      expect(normalizeForComparison('MiXeD CaSe')).toBe('mixed case');
    });

    it('should remove punctuation', () => {
      expect(normalizeForComparison('Hello, World!')).toBe('hello world');
      expect(normalizeForComparison("It's fine.")).toBe('its fine');
    });

    it('should trim whitespace', () => {
      expect(normalizeForComparison('  spaces  ')).toBe('spaces');
    });

    it('should handle numbers', () => {
      expect(normalizeForComparison('Test123')).toBe('test123');
    });
  });

  describe('looksLikeName', () => {
    it('should recognize valid names', () => {
      expect(looksLikeName('John')).toBe(true);
      expect(looksLikeName('Sarah')).toBe(true);
      expect(looksLikeName('Mike')).toBe(true);
      expect(looksLikeName('Elizabeth')).toBe(true);
    });

    it('should reject common words', () => {
      expect(looksLikeName('here')).toBe(false);
      expect(looksLikeName('there')).toBe(false);
      expect(looksLikeName('yeah')).toBe(false);
      expect(looksLikeName('just')).toBe(false);
      expect(looksLikeName('like')).toBe(false);
    });

    it('should reject verbs', () => {
      expect(looksLikeName('said')).toBe(false);
      expect(looksLikeName('called')).toBe(false);
      expect(looksLikeName('went')).toBe(false);
    });

    it('should reject fillers', () => {
      expect(looksLikeName('um')).toBe(false);
      expect(looksLikeName('uh')).toBe(false);
      expect(looksLikeName('hmm')).toBe(false);
    });

    it('should reject short words', () => {
      expect(looksLikeName('a')).toBe(false);
      expect(looksLikeName('')).toBe(false);
    });

    it('should reject non-letter starts', () => {
      expect(looksLikeName('123name')).toBe(false);
      expect(looksLikeName('_name')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(looksLikeName(null as unknown as string)).toBe(false);
      expect(looksLikeName(undefined as unknown as string)).toBe(false);
    });

    it('should be case-insensitive for common words', () => {
      expect(looksLikeName('YEAH')).toBe(false);
      expect(looksLikeName('Just')).toBe(false);
    });
  });
});
