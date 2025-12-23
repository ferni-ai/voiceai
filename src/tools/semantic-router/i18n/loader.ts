/**
 * Semantic Router i18n Loader
 *
 * Loads locale-specific triggers from JSON files and merges them into tool definitions.
 * This allows the semantic router to work across multiple languages without code changes.
 *
 * @module semantic-router/i18n
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticToolDefinition } from '../types.js';

const log = createLogger({ module: 'SemanticRouter.i18n' });

// ============================================================================
// TYPES
// ============================================================================

export interface LocaleTrigger {
  phrases: string[];
  patterns: string[];
  keywords: Array<{ word: string; weight: number }>;
  antiKeywords?: string[];
}

export interface LocaleFile {
  $schema?: string;
  $locale: string;
  $name: string;
  [toolId: string]: LocaleTrigger | string | undefined;
}

export type LoadedLocales = Record<string, LocaleFile>;

// ============================================================================
// STATE
// ============================================================================

const loadedLocales: LoadedLocales = {};
let currentLocale = 'en';
let localesDir: string;

// Calculate locales directory path
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  localesDir = join(__dirname, 'locales');
} catch {
  // Fallback for non-ESM environments
  localesDir = join(process.cwd(), 'src/tools/semantic-router/i18n/locales');
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Load a locale file from disk
 */
export async function loadLocale(locale: string): Promise<LocaleFile | null> {
  // Return cached if available
  if (loadedLocales[locale]) {
    return loadedLocales[locale];
  }

  const filePath = join(localesDir, `${locale}.json`);

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as LocaleFile;

    // Validate basic structure
    if (!parsed.$locale || !parsed.$name) {
      log.warn({ locale, filePath }, 'Invalid locale file: missing $locale or $name');
      return null;
    }

    loadedLocales[locale] = parsed;
    log.info({ locale, name: parsed.$name }, 'Loaded locale file');
    return parsed;
  } catch (error) {
    log.debug({ locale, error: String(error) }, 'Failed to load locale file');
    return null;
  }
}

/**
 * Get triggers for a specific tool in the current locale
 */
export async function getTriggersForTool(
  toolId: string,
  locale?: string
): Promise<LocaleTrigger | null> {
  const targetLocale = locale || currentLocale;
  const localeData = await loadLocale(targetLocale);

  if (!localeData) {
    // Fall back to English
    if (targetLocale !== 'en') {
      return getTriggersForTool(toolId, 'en');
    }
    return null;
  }

  const trigger = localeData[toolId];
  if (!trigger || typeof trigger === 'string') {
    return null;
  }

  return trigger as LocaleTrigger;
}

/**
 * Set the current locale for the semantic router
 */
export function setLocale(locale: string): void {
  currentLocale = locale;
  log.info({ locale }, 'Semantic router locale set');
}

/**
 * Get the current locale
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Get all available locales
 */
export async function getAvailableLocales(): Promise<string[]> {
  const fs = await import('fs/promises');
  try {
    const files = await fs.readdir(localesDir);
    return files
      .filter((f) => f.endsWith('.json') && !f.includes('schema'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return ['en'];
  }
}

// ============================================================================
// TOOL DEFINITION HELPERS
// ============================================================================

/**
 * Hydrate a tool definition with locale-specific triggers
 *
 * Takes a "skeleton" tool definition and fills in the triggers from locale files
 */
export async function hydrateToolDefinition(
  skeleton: Partial<SemanticToolDefinition> & { id: string }
): Promise<SemanticToolDefinition | null> {
  const triggers = await getTriggersForTool(skeleton.id);

  if (!triggers) {
    log.debug({ toolId: skeleton.id }, 'No triggers found for tool');
    return null;
  }

  // Convert string patterns to RegExp
  const patterns = triggers.patterns
    .map((p) => {
      try {
        return new RegExp(p, 'i');
      } catch {
        log.warn({ pattern: p, toolId: skeleton.id }, 'Invalid regex pattern');
        return null;
      }
    })
    .filter((p): p is RegExp => p !== null);

  return {
    ...skeleton,
    triggers: {
      phrases: triggers.phrases,
      patterns,
      keywords: triggers.keywords,
      antiKeywords: triggers.antiKeywords,
    },
    trainingExamples: triggers.phrases,
    counterExamples: [],
    arguments: skeleton.arguments || [],
    execute:
      skeleton.execute ||
      (async () => ({
        handled: false,
        fallbackToLLM: true,
        metadata: { reason: 'no_executor' },
      })),
  } as SemanticToolDefinition;
}

/**
 * Merge locale triggers into existing tool definitions
 *
 * Use this to add multilingual support to hardcoded English definitions
 */
export async function mergeLocaleIntoTools(
  tools: SemanticToolDefinition[],
  locale?: string
): Promise<SemanticToolDefinition[]> {
  const targetLocale = locale || currentLocale;
  const localeData = await loadLocale(targetLocale);

  if (!localeData) {
    return tools;
  }

  return tools.map((tool) => {
    const localeTrigger = localeData[tool.id];
    if (!localeTrigger || typeof localeTrigger === 'string') {
      return tool;
    }

    const trigger = localeTrigger as LocaleTrigger;

    // Get existing values with defaults for optional properties
    const existingPhrases = tool.triggers.phrases || [];
    const existingKeywords = tool.triggers.keywords || [];
    const existingPatterns = tool.triggers.patterns || [];

    // Merge phrases and keywords (additive)
    const mergedPhrases = [...new Set([...existingPhrases, ...trigger.phrases])];

    const mergedKeywords = [...existingKeywords];
    for (const kw of trigger.keywords) {
      if (!mergedKeywords.some((k) => k.word === kw.word)) {
        mergedKeywords.push(kw);
      }
    }

    // Merge patterns (additive)
    const existingPatternStrings = existingPatterns.map((p) => p.source);
    const newPatterns = trigger.patterns
      .filter((p) => !existingPatternStrings.includes(p))
      .map((p) => {
        try {
          return new RegExp(p, 'i');
        } catch {
          return null;
        }
      })
      .filter((p): p is RegExp => p !== null);

    const mergedPatterns = [...existingPatterns, ...newPatterns];

    // Merge anti-keywords
    const mergedAntiKeywords = trigger.antiKeywords
      ? [...new Set([...(tool.triggers.antiKeywords || []), ...trigger.antiKeywords])]
      : tool.triggers.antiKeywords;

    return {
      ...tool,
      triggers: {
        ...tool.triggers,
        phrases: mergedPhrases,
        patterns: mergedPatterns,
        keywords: mergedKeywords,
        antiKeywords: mergedAntiKeywords,
      },
      examples: [...new Set([...tool.examples, ...trigger.phrases])],
    };
  });
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Simple language detection based on common words and character ranges
 *
 * For production, consider using a proper language detection library
 */
export function detectLanguage(text: string): string {
  const lowerText = text.toLowerCase();

  // Script-based detection (most reliable for CJK and RTL languages)
  // Japanese: Hiragana (3040-309F), Katakana (30A0-30FF), some Kanji
  const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
  if (japanesePattern.test(text)) {
    return 'ja';
  }

  // Korean: Hangul (AC00-D7AF, 1100-11FF)
  const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF]/;
  if (koreanPattern.test(text)) {
    return 'ko';
  }

  // Chinese: CJK Unified Ideographs (4E00-9FFF) - check after Japanese/Korean
  // Distinguish Traditional vs Simplified by common character differences
  const chinesePattern = /[\u4E00-\u9FFF]/;
  if (chinesePattern.test(text)) {
    // Traditional Chinese characters (common ones not in Simplified)
    const traditionalChars = /[繁體實際這與說對為開時]/;
    if (traditionalChars.test(text)) {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }

  // Arabic: Arabic script (0600-06FF)
  const arabicPattern = /[\u0600-\u06FF]/;
  if (arabicPattern.test(text)) {
    return 'ar';
  }

  // Hebrew: Hebrew script (0590-05FF)
  const hebrewPattern = /[\u0590-\u05FF]/;
  if (hebrewPattern.test(text)) {
    return 'he';
  }

  // Word-based detection for Latin script languages
  // Spanish indicators
  const spanishWords = ['qué', 'cómo', 'cuál', 'está', 'tengo', 'quiero', 'puedo', 'hoy', 'mañana'];
  const spanishCount = spanishWords.filter((w) => lowerText.includes(w)).length;

  // French indicators
  const frenchWords = [
    "qu'est",
    'quel',
    'comment',
    'est-ce',
    "j'ai",
    'je',
    "aujourd'hui",
    'demain',
  ];
  const frenchCount = frenchWords.filter((w) => lowerText.includes(w)).length;

  // German indicators
  const germanWords = ['was', 'wie', 'ist', 'ich', 'heute', 'morgen', 'kannst', 'bitte'];
  const germanCount = germanWords.filter((w) => lowerText.includes(w)).length;

  // Portuguese indicators
  const portugueseWords = [
    'você',
    'não',
    'está',
    'tenho',
    'quero',
    'posso',
    'hoje',
    'amanhã',
    'obrigado',
  ];
  const portugueseCount = portugueseWords.filter((w) => lowerText.includes(w)).length;

  // Find the highest scoring language
  const scores: Record<string, number> = {
    es: spanishCount,
    fr: frenchCount,
    de: germanCount,
    pt: portugueseCount,
    en: 0, // Default
  };

  let maxScore = 0;
  let detectedLang = 'en';

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

/**
 * Auto-detect language and load appropriate locale
 */
export async function autoDetectAndLoadLocale(text: string): Promise<string> {
  const detected = detectLanguage(text);
  const localeData = await loadLocale(detected);

  if (localeData) {
    setLocale(detected);
    return detected;
  }

  // Fall back to English
  setLocale('en');
  return 'en';
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Pre-load common locales for faster routing
 *
 * Default includes: English, Spanish, Arabic, Hebrew, Japanese, Korean, Chinese (Simplified/Traditional)
 */
export async function preloadLocales(
  locales: string[] = ['en', 'es', 'ar', 'he', 'ja', 'ko', 'zh-Hans', 'zh-Hant']
): Promise<void> {
  await Promise.all(locales.map(loadLocale));
  log.info({ locales, count: locales.length }, 'Pre-loaded locales');
}

// Auto-load English on module load
loadLocale('en').catch(() => {
  log.warn('Failed to pre-load English locale');
});
