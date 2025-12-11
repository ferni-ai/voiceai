/**
 * Voice Accents Configuration Tests
 *
 * Tests for international English accent support.
 */

import { describe, expect, it } from 'vitest';
import {
  ACCENT_DISPLAY_NAMES,
  ACCENT_TO_DIALECT,
  createDefaultVoicePreference,
  DEFAULT_ACCENT,
  detectAccentFromLocale,
  detectAccentFromLocales,
  getDialectCode,
  isValidAccent,
  mergeVoicePreference,
  requiresLocalization,
  SUPPORTED_ACCENTS,
  type EnglishAccent,
} from '../voice-accents.js';

describe('Voice Accents Configuration', () => {
  describe('Constants', () => {
    it('should have all four supported accents', () => {
      expect(SUPPORTED_ACCENTS).toContain('american');
      expect(SUPPORTED_ACCENTS).toContain('british');
      expect(SUPPORTED_ACCENTS).toContain('australian');
      expect(SUPPORTED_ACCENTS).toContain('indian');
      expect(SUPPORTED_ACCENTS.length).toBe(4);
    });

    it('should have default accent as american', () => {
      expect(DEFAULT_ACCENT).toBe('american');
    });

    it('should map accents to Cartesia dialect codes', () => {
      expect(ACCENT_TO_DIALECT.american).toBe('us');
      expect(ACCENT_TO_DIALECT.british).toBe('uk');
      expect(ACCENT_TO_DIALECT.australian).toBe('au');
      expect(ACCENT_TO_DIALECT.indian).toBe('in');
    });

    it('should have display names for all accents', () => {
      expect(ACCENT_DISPLAY_NAMES.american).toBe('American English');
      expect(ACCENT_DISPLAY_NAMES.british).toBe('British English');
      expect(ACCENT_DISPLAY_NAMES.australian).toBe('Australian English');
      expect(ACCENT_DISPLAY_NAMES.indian).toBe('Indian English');
    });
  });

  describe('detectAccentFromLocale', () => {
    it('should detect American accent from en-US', () => {
      const result = detectAccentFromLocale('en-US');
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('high');
    });

    it('should detect British accent from en-GB', () => {
      const result = detectAccentFromLocale('en-GB');
      expect(result.accent).toBe('british');
      expect(result.confidence).toBe('high');
    });

    it('should detect Australian accent from en-AU', () => {
      const result = detectAccentFromLocale('en-AU');
      expect(result.accent).toBe('australian');
      expect(result.confidence).toBe('high');
    });

    it('should detect Indian accent from en-IN', () => {
      const result = detectAccentFromLocale('en-IN');
      expect(result.accent).toBe('indian');
      expect(result.confidence).toBe('high');
    });

    it('should detect New Zealand as Australian (similar)', () => {
      const result = detectAccentFromLocale('en-NZ');
      expect(result.accent).toBe('australian');
      expect(result.confidence).toBe('high');
    });

    it('should detect Ireland as British (similar)', () => {
      const result = detectAccentFromLocale('en-IE');
      expect(result.accent).toBe('british');
      expect(result.confidence).toBe('high');
    });

    it('should detect Canada as American', () => {
      const result = detectAccentFromLocale('en-CA');
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('high');
    });

    it('should detect South Africa as British (historically influenced)', () => {
      const result = detectAccentFromLocale('en-ZA');
      expect(result.accent).toBe('british');
      expect(result.confidence).toBe('high');
    });

    it('should detect Philippines as American (historically influenced)', () => {
      const result = detectAccentFromLocale('en-PH');
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('high');
    });

    it('should handle case-insensitive locale matching', () => {
      const result1 = detectAccentFromLocale('EN-GB');
      const result2 = detectAccentFromLocale('en-gb');
      expect(result1.accent).toBe('british');
      expect(result2.accent).toBe('british');
    });

    it('should fall back to country code extraction', () => {
      const result = detectAccentFromLocale('en_AU');
      expect(result.accent).toBe('australian');
      expect(result.confidence).toBe('medium');
    });

    it('should default to American for unknown English locales', () => {
      const result = detectAccentFromLocale('en-XX');
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('low');
    });

    it('should default to American for non-English locales', () => {
      const result = detectAccentFromLocale('fr-FR');
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('low');
    });
  });

  describe('detectAccentFromLocales', () => {
    it('should return first high-confidence match', () => {
      const result = detectAccentFromLocales(['en-GB', 'en-US', 'en']);
      expect(result.accent).toBe('british');
      expect(result.confidence).toBe('high');
    });

    it('should prefer high-confidence over low-confidence', () => {
      const result = detectAccentFromLocales(['en-XX', 'en-AU']);
      expect(result.accent).toBe('australian');
      expect(result.confidence).toBe('high');
    });

    it('should handle browser-style locale arrays', () => {
      // Typical browser: ['en-AU', 'en-US', 'en']
      const result = detectAccentFromLocales(['en-AU', 'en-US', 'en']);
      expect(result.accent).toBe('australian');
    });

    it('should return default for empty array', () => {
      const result = detectAccentFromLocales([]);
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('low');
    });
  });

  describe('Cartesia Integration', () => {
    it('should return correct dialect codes', () => {
      expect(getDialectCode('american')).toBe('us');
      expect(getDialectCode('british')).toBe('uk');
      expect(getDialectCode('australian')).toBe('au');
      expect(getDialectCode('indian')).toBe('in');
    });

    it('should identify when localization is required', () => {
      expect(requiresLocalization('american')).toBe(false);
      expect(requiresLocalization('british')).toBe(true);
      expect(requiresLocalization('australian')).toBe(true);
      expect(requiresLocalization('indian')).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate supported accents', () => {
      expect(isValidAccent('american')).toBe(true);
      expect(isValidAccent('british')).toBe(true);
      expect(isValidAccent('australian')).toBe(true);
      expect(isValidAccent('indian')).toBe(true);
    });

    it('should reject invalid accents', () => {
      expect(isValidAccent('scottish')).toBe(false);
      expect(isValidAccent('irish')).toBe(false);
      expect(isValidAccent('')).toBe(false);
      expect(isValidAccent('American')).toBe(false); // Case sensitive
    });
  });

  describe('User Preferences', () => {
    it('should create default preference without locale', () => {
      const pref = createDefaultVoicePreference();
      expect(pref.accent).toBe('american');
      expect(pref.autoDetected).toBe(false);
    });

    it('should create preference with auto-detected locale', () => {
      const pref = createDefaultVoicePreference('en-GB');
      expect(pref.accent).toBe('british');
      expect(pref.autoDetected).toBe(true);
    });

    it('should merge partial preferences with defaults', () => {
      const partial = { accent: 'british' as EnglishAccent };
      const merged = mergeVoicePreference(partial);
      expect(merged.accent).toBe('british');
      expect(merged.autoDetected).toBe(false);
    });

    it('should use defaults when merging undefined', () => {
      const merged = mergeVoicePreference(undefined);
      expect(merged.accent).toBe('american');
    });
  });
});
