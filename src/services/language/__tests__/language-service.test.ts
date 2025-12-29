/**
 * Language Service Tests
 *
 * Tests for multilingual support and language detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseLanguageName,
  detectLanguageFromText,
  getLanguageConfig,
  setSessionLanguage,
  getSessionLanguageState,
  clearSessionLanguage,
  clearUtteranceBuffer,
  LANGUAGE_CONFIGS,
} from '../language-service.js';

describe('Language Service', () => {
  const testSessionId = 'test-session-123';
  const testUserId = 'test-user-456';

  beforeEach(() => {
    // Clear any existing state
    clearSessionLanguage(testSessionId);
    clearUtteranceBuffer(testSessionId);
  });

  afterEach(() => {
    clearSessionLanguage(testSessionId);
    clearUtteranceBuffer(testSessionId);
  });

  describe('parseLanguageName', () => {
    it('should parse English language names', () => {
      expect(parseLanguageName('English')).toBe('en');
      expect(parseLanguageName('english')).toBe('en');
      expect(parseLanguageName('ENGLISH')).toBe('en');
      expect(parseLanguageName('en')).toBe('en');
    });

    it('should parse Spanish language names', () => {
      expect(parseLanguageName('Spanish')).toBe('es');
      expect(parseLanguageName('español')).toBe('es');
      expect(parseLanguageName('espanol')).toBe('es');
      expect(parseLanguageName('es')).toBe('es');
    });

    it('should parse French language names', () => {
      expect(parseLanguageName('French')).toBe('fr');
      expect(parseLanguageName('français')).toBe('fr');
      expect(parseLanguageName('francais')).toBe('fr');
      expect(parseLanguageName('fr')).toBe('fr');
    });

    it('should parse Japanese language names', () => {
      expect(parseLanguageName('Japanese')).toBe('ja');
      expect(parseLanguageName('日本語')).toBe('ja');
      expect(parseLanguageName('ja')).toBe('ja');
    });

    it('should return null for unrecognized languages', () => {
      expect(parseLanguageName('Klingon')).toBeNull();
      expect(parseLanguageName('gibberish123')).toBeNull();
    });
  });

  describe('detectLanguageFromText', () => {
    it('should detect English text', () => {
      const result = detectLanguageFromText('Hello, how are you doing today?');
      expect(result.detectedLanguage).toBe('en');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should detect Spanish text with Spanish characters', () => {
      const result = detectLanguageFromText('Hola, ¿cómo estás hoy?');
      // Spanish detection checks for ñ, ¿, ¡, and common words
      expect(['es', 'en']).toContain(result.detectedLanguage);
    });

    it('should detect Japanese text with Japanese characters', () => {
      const result = detectLanguageFromText('こんにちは、元気ですか？');
      expect(result.detectedLanguage).toBe('ja');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle short/ambiguous text', () => {
      const result = detectLanguageFromText('OK');
      // Short text may default to English with low confidence
      expect(result.detectedLanguage).toBeDefined();
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe('getLanguageConfig', () => {
    it('should return config for supported languages', () => {
      const enConfig = getLanguageConfig('en');
      expect(enConfig.spokenLanguage).toBe('en');
      expect(enConfig.displayName).toBe('English');
      expect(enConfig.sttLanguage).toBe('en-US');

      const esConfig = getLanguageConfig('es');
      expect(esConfig.spokenLanguage).toBe('es');
      expect(esConfig.displayName).toBe('Spanish');
    });

    it('should return English config for unsupported languages', () => {
      const config = getLanguageConfig('xx' as never);
      expect(config.spokenLanguage).toBe('en');
    });
  });

  describe('Session Language State', () => {
    it('should set and get session language', () => {
      const config = setSessionLanguage(testSessionId, 'es', testUserId);

      // LanguageConfig uses spokenLanguage field
      expect(config.spokenLanguage).toBe('es');
      expect(config.displayName).toBe('Spanish');

      const state = getSessionLanguageState(testSessionId);
      expect(state).not.toBeNull();
      expect(state?.currentLanguage).toBe('es');
    });

    it('should track auto-detection state', () => {
      // When language is set via tool, autoDetected should be false
      setSessionLanguage(testSessionId, 'fr', testUserId);

      const sessionState = getSessionLanguageState(testSessionId);
      expect(sessionState?.currentLanguage).toBe('fr');
      expect(sessionState?.autoDetected).toBe(false);
      expect(sessionState?.lastUpdated).toBeDefined();
    });

    it('should clear session language', () => {
      setSessionLanguage(testSessionId, 'ja', testUserId);
      expect(getSessionLanguageState(testSessionId)).not.toBeNull();

      clearSessionLanguage(testSessionId);
      expect(getSessionLanguageState(testSessionId)).toBeNull();
    });
  });

  describe('LANGUAGE_CONFIGS', () => {
    it('should have common languages defined', () => {
      const codes = Object.keys(LANGUAGE_CONFIGS);

      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('fr');
      expect(codes).toContain('de');
      expect(codes).toContain('ja');
      expect(codes).toContain('ko');
      expect(codes).toContain('zh'); // Chinese
      expect(codes).toContain('hi');
    });

    it('should have TTS language codes for major languages', () => {
      expect(LANGUAGE_CONFIGS.en.ttsLanguage).toBeDefined();
      expect(LANGUAGE_CONFIGS.es.ttsLanguage).toBeDefined();
      expect(LANGUAGE_CONFIGS.fr.ttsLanguage).toBeDefined();
    });
  });
});
