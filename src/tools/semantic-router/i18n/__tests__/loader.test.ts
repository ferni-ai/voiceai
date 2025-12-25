/**
 * Tests for Semantic Router i18n Loader
 *
 * @module semantic-router/i18n/__tests__/loader.test
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  detectLanguage,
  loadLocale,
  getAvailableLocales,
  setLocale,
  getLocale,
} from '../loader.js';

// Mock the logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('detectLanguage', () => {
  describe('Script-based detection (CJK)', () => {
    it('should detect Japanese from Hiragana', () => {
      expect(detectLanguage('天気はどう')).toBe('ja');
      expect(detectLanguage('おはようございます')).toBe('ja');
    });

    it('should detect Japanese from Katakana', () => {
      expect(detectLanguage('スポティファイ')).toBe('ja');
      expect(detectLanguage('カレンダー')).toBe('ja');
    });

    it('should detect Japanese with mixed scripts', () => {
      expect(detectLanguage('今日の天気を教えて')).toBe('ja');
    });

    it('should detect Korean from Hangul', () => {
      expect(detectLanguage('날씨 어때')).toBe('ko');
      expect(detectLanguage('안녕하세요')).toBe('ko');
      expect(detectLanguage('음악 재생')).toBe('ko');
    });

    it('should detect Simplified Chinese', () => {
      expect(detectLanguage('天气怎么样')).toBe('zh-Hans');
      expect(detectLanguage('播放音乐')).toBe('zh-Hans');
    });

    it('should detect Traditional Chinese from specific characters', () => {
      // These phrases contain Traditional-specific characters (體, 實, 這, etc.)
      expect(detectLanguage('繁體中文')).toBe('zh-Hant'); // 繁體 = Traditional
      expect(detectLanguage('這是實際的問題')).toBe('zh-Hant'); // 這, 實, 際
      expect(detectLanguage('請說明時間')).toBe('zh-Hant'); // 說, 時
    });
  });

  describe('Script-based detection (RTL)', () => {
    it('should detect Arabic', () => {
      expect(detectLanguage('كيف الطقس')).toBe('ar');
      expect(detectLanguage('شغّل موسيقى')).toBe('ar');
      expect(detectLanguage('ما هو الوقت')).toBe('ar');
    });

    it('should detect Hebrew', () => {
      expect(detectLanguage('מה מזג האוויר')).toBe('he');
      expect(detectLanguage('נגן מוזיקה')).toBe('he');
      expect(detectLanguage('מה השעה')).toBe('he');
    });
  });

  describe('Word-based detection (Latin scripts)', () => {
    it('should detect Spanish', () => {
      expect(detectLanguage('qué tiempo hace hoy')).toBe('es');
      expect(detectLanguage('quiero escuchar música')).toBe('es');
    });

    it('should detect French', () => {
      expect(detectLanguage("qu'est-ce que c'est")).toBe('fr');
      expect(detectLanguage("j'ai besoin d'aide")).toBe('fr');
    });

    it('should detect German', () => {
      expect(detectLanguage('wie ist das Wetter heute')).toBe('de');
      expect(detectLanguage('ich möchte Musik hören')).toBe('de');
    });

    it('should detect Portuguese', () => {
      expect(detectLanguage('você pode me ajudar')).toBe('pt');
      expect(detectLanguage('não tenho tempo hoje')).toBe('pt');
    });

    it('should default to English for unrecognized text', () => {
      expect(detectLanguage('hello world')).toBe('en');
      expect(detectLanguage('play some music')).toBe('en');
      expect(detectLanguage("what's the weather")).toBe('en');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(detectLanguage('')).toBe('en');
    });

    it('should handle mixed language input', () => {
      // Pure Kanji (天気) without Hiragana/Katakana is detected as Chinese
      expect(detectLanguage('天気 weather')).toBe('zh-Hans');
      // With Hiragana, it's detected as Japanese
      expect(detectLanguage('天気は weather')).toBe('ja');
      // Korean mixed with English
      expect(detectLanguage('날씨 weather')).toBe('ko');
    });

    it('should handle numbers and punctuation only', () => {
      expect(detectLanguage('123!@#')).toBe('en');
    });

    it('should not detect German from "ist" inside "Christmas"', () => {
      // Regression test: "ist" is German for "is", but shouldn't match inside "Christmas"
      expect(detectLanguage('play Christmas music')).toBe('en');
      expect(detectLanguage('Hey, could you play some Christmas music?')).toBe('en');
      expect(detectLanguage('Christmas is my favorite holiday')).toBe('en');
    });
  });
});

describe('Locale Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadLocale', () => {
    it('should load English locale', async () => {
      const locale = await loadLocale('en');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('en');
      expect(locale?.$name).toBe('English');
    });

    it('should load Arabic locale', async () => {
      const locale = await loadLocale('ar');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('ar');
      expect(locale?.$name).toBe('العربية');
    });

    it('should load Hebrew locale', async () => {
      const locale = await loadLocale('he');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('he');
      expect(locale?.$name).toBe('עברית');
    });

    it('should load Japanese locale', async () => {
      const locale = await loadLocale('ja');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('ja');
      expect(locale?.$name).toBe('日本語');
    });

    it('should load Korean locale', async () => {
      const locale = await loadLocale('ko');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('ko');
      expect(locale?.$name).toBe('한국어');
    });

    it('should load Simplified Chinese locale', async () => {
      const locale = await loadLocale('zh-Hans');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('zh-Hans');
      expect(locale?.$name).toBe('简体中文');
    });

    it('should load Traditional Chinese locale', async () => {
      const locale = await loadLocale('zh-Hant');
      expect(locale).not.toBeNull();
      expect(locale?.$locale).toBe('zh-Hant');
      expect(locale?.$name).toBe('繁體中文');
    });

    it('should return null for non-existent locale', async () => {
      const locale = await loadLocale('xx-invalid');
      expect(locale).toBeNull();
    });

    it('should cache loaded locales', async () => {
      const first = await loadLocale('en');
      const second = await loadLocale('en');
      expect(first).toBe(second); // Same reference = cached
    });
  });

  describe('getAvailableLocales', () => {
    it('should return all available locales', async () => {
      const locales = await getAvailableLocales();
      expect(locales).toContain('en');
      expect(locales).toContain('es');
      expect(locales).toContain('ar');
      expect(locales).toContain('he');
      expect(locales).toContain('ja');
      expect(locales).toContain('ko');
      expect(locales).toContain('zh-Hans');
      expect(locales).toContain('zh-Hant');
      expect(locales.length).toBeGreaterThanOrEqual(11);
    });

    it('should not include schema file', async () => {
      const locales = await getAvailableLocales();
      expect(locales).not.toContain('locale.schema');
    });
  });

  describe('setLocale / getLocale', () => {
    it('should set and get current locale', () => {
      setLocale('ja');
      expect(getLocale()).toBe('ja');

      setLocale('ko');
      expect(getLocale()).toBe('ko');
    });
  });
});

describe('Locale Content Validation', () => {
  // Core tool IDs that should be present in all new locales
  const coreToolIds = [
    'weather_current',
    'weather_forecast',
    'calendar_list_events',
    'calendar_create_event',
    'habit_track',
    'memory_save',
    'memory_recall',
    'grounding_exercise',
    'spotify_play',
    'info_time',
    'handoff',
  ];

  // Full locales (created with complete tool set)
  const fullLocales = ['en', 'ar', 'he', 'ja', 'ko', 'zh-Hans', 'zh-Hant'];

  // Legacy locales (may have partial tool coverage)
  const legacyLocales = ['es', 'de', 'fr', 'pt'];

  const allLocales = [...fullLocales, ...legacyLocales];

  for (const localeCode of fullLocales) {
    describe(`${localeCode} locale (full)`, () => {
      it('should have all core tool triggers', async () => {
        const locale = await loadLocale(localeCode);
        expect(locale).not.toBeNull();

        for (const toolId of coreToolIds) {
          const trigger = locale?.[toolId];
          expect(trigger, `Missing ${toolId} in ${localeCode}`).toBeDefined();
          expect(typeof trigger).toBe('object');
        }
      });
    });
  }

  for (const localeCode of allLocales) {
    describe(`${localeCode} locale`, () => {
      it('should have valid trigger structure for existing tools', async () => {
        const locale = await loadLocale(localeCode);
        expect(locale).not.toBeNull();

        // Get all tool IDs in this locale (excluding $ prefixed metadata)
        const toolIds = Object.keys(locale || {}).filter((k) => !k.startsWith('$'));

        expect(toolIds.length, `${localeCode} should have at least one tool`).toBeGreaterThan(0);

        for (const toolId of toolIds) {
          const trigger = locale?.[toolId] as {
            phrases?: string[];
            patterns?: string[];
            keywords?: Array<{ word: string; weight: number }>;
          };

          if (trigger && typeof trigger === 'object') {
            // Check phrases
            expect(Array.isArray(trigger.phrases), `${toolId} phrases should be array`).toBe(true);
            expect(trigger.phrases?.length, `${toolId} should have phrases`).toBeGreaterThan(0);

            // Check patterns
            expect(Array.isArray(trigger.patterns), `${toolId} patterns should be array`).toBe(
              true
            );

            // Check keywords
            expect(Array.isArray(trigger.keywords), `${toolId} keywords should be array`).toBe(
              true
            );
            expect(trigger.keywords?.length, `${toolId} should have keywords`).toBeGreaterThan(0);

            // Validate keyword structure
            for (const kw of trigger.keywords || []) {
              expect(typeof kw.word).toBe('string');
              expect(typeof kw.weight).toBe('number');
              expect(kw.weight).toBeGreaterThanOrEqual(0);
              expect(kw.weight).toBeLessThanOrEqual(1);
            }
          }
        }
      });

      it('should have valid regex patterns', async () => {
        const locale = await loadLocale(localeCode);
        const toolIds = Object.keys(locale || {}).filter((k) => !k.startsWith('$'));

        for (const toolId of toolIds) {
          const trigger = locale?.[toolId] as { patterns?: string[] };

          if (trigger?.patterns) {
            for (const pattern of trigger.patterns) {
              expect(
                () => new RegExp(pattern, 'i'),
                `Invalid regex in ${toolId}: ${pattern}`
              ).not.toThrow();
            }
          }
        }
      });
    });
  }
});
