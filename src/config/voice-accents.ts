/**
 * Voice Accents Configuration
 *
 * Supports international English accents using Cartesia's localization feature.
 * Users can choose their preferred accent, and we adapt the persona's voice.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/capability-guides/localize-voices
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'VoiceAccents' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Supported English accent variants.
 * Maps to Cartesia dialect codes.
 */
export type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';

/**
 * Cartesia dialect codes for localization API.
 * @see https://docs.cartesia.ai/api-reference/voices/localize
 */
export type CartesiaDialect = 'us' | 'uk' | 'au' | 'in';

/**
 * User's voice preference configuration.
 */
export interface VoicePreference {
  /** Preferred English accent */
  accent: EnglishAccent;
  /** Preferred language (for future multilingual support) */
  language?: string;
  /** Auto-detected from device locale */
  autoDetected?: boolean;
}

/**
 * Locale to accent mapping result.
 */
export interface LocaleDetectionResult {
  accent: EnglishAccent;
  confidence: 'high' | 'medium' | 'low';
  detectedLocale: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Map accents to Cartesia dialect codes.
 */
export const ACCENT_TO_DIALECT: Record<EnglishAccent, CartesiaDialect> = {
  american: 'us',
  british: 'uk',
  australian: 'au',
  indian: 'in',
};

/**
 * Human-readable accent names for UI.
 */
export const ACCENT_DISPLAY_NAMES: Record<EnglishAccent, string> = {
  american: 'American English',
  british: 'British English',
  australian: 'Australian English',
  indian: 'Indian English',
};

/**
 * Accent descriptions for accessibility/tooltips.
 */
export const ACCENT_DESCRIPTIONS: Record<EnglishAccent, string> = {
  american: 'Standard American English accent',
  british: 'British English accent (Received Pronunciation style)',
  australian: 'Australian English accent',
  indian: 'Indian English accent',
};

/**
 * All supported accents in display order.
 */
export const SUPPORTED_ACCENTS: readonly EnglishAccent[] = [
  'american',
  'british',
  'australian',
  'indian',
] as const;

/**
 * Default accent when none is specified.
 */
export const DEFAULT_ACCENT: EnglishAccent = 'american';

// =============================================================================
// LOCALE DETECTION
// =============================================================================

/**
 * Map of locale/country codes to accents.
 * Used for auto-detection from device locale.
 */
const LOCALE_TO_ACCENT: Record<string, EnglishAccent> = {
  // American English
  'en-US': 'american',
  'en-CA': 'american', // Canada uses American pronunciation mostly
  'en-PR': 'american',
  'en-VI': 'american',

  // British English
  'en-GB': 'british',
  'en-IE': 'british', // Ireland - closer to British
  'en-MT': 'british', // Malta

  // Australian English
  'en-AU': 'australian',
  'en-NZ': 'australian', // New Zealand - similar to Australian

  // Indian English
  'en-IN': 'indian',
  'en-PK': 'indian', // Pakistan - similar patterns
  'en-BD': 'indian', // Bangladesh
  'en-LK': 'indian', // Sri Lanka

  // Other English variants - default to closest match
  'en-ZA': 'british', // South Africa - British influenced
  'en-SG': 'british', // Singapore - British influenced
  'en-HK': 'british', // Hong Kong - British influenced
  'en-PH': 'american', // Philippines - American influenced
  'en-NG': 'british', // Nigeria - British influenced
  'en-KE': 'british', // Kenya - British influenced
  'en-GH': 'british', // Ghana - British influenced
};

/**
 * Country codes to accent mapping (fallback when full locale not available).
 */
const COUNTRY_TO_ACCENT: Record<string, EnglishAccent> = {
  US: 'american',
  CA: 'american',
  GB: 'british',
  UK: 'british',
  IE: 'british',
  AU: 'australian',
  NZ: 'australian',
  IN: 'indian',
  PK: 'indian',
  ZA: 'british',
  SG: 'british',
  HK: 'british',
  PH: 'american',
  NG: 'british',
  KE: 'british',
};

/**
 * Detect accent from a locale string (e.g., 'en-US', 'en-GB').
 *
 * @param locale - BCP 47 locale string
 * @returns Detection result with accent and confidence
 *
 * @example
 * detectAccentFromLocale('en-GB'); // { accent: 'british', confidence: 'high' }
 * detectAccentFromLocale('en');    // { accent: 'american', confidence: 'low' }
 */
export function detectAccentFromLocale(locale: string): LocaleDetectionResult {
  const normalized = locale.trim();

  // Try exact match first (highest confidence)
  if (LOCALE_TO_ACCENT[normalized]) {
    return {
      accent: LOCALE_TO_ACCENT[normalized],
      confidence: 'high',
      detectedLocale: normalized,
    };
  }

  // Try case-insensitive match
  const lowerLocale = normalized.toLowerCase();
  for (const [key, accent] of Object.entries(LOCALE_TO_ACCENT)) {
    if (key.toLowerCase() === lowerLocale) {
      return {
        accent,
        confidence: 'high',
        detectedLocale: key,
      };
    }
  }

  // Try extracting country code (e.g., 'US' from 'en-US')
  const parts = normalized.split(/[-_]/);
  const countryPart = parts[1];
  if (parts.length >= 2 && countryPart) {
    const countryCode = countryPart.toUpperCase();
    if (COUNTRY_TO_ACCENT[countryCode]) {
      return {
        accent: COUNTRY_TO_ACCENT[countryCode],
        confidence: 'medium',
        detectedLocale: normalized,
      };
    }
  }

  // Check if it's an English locale at all
  const isEnglish = lowerLocale.startsWith('en');

  log.debug({ locale: normalized, isEnglish }, 'Locale detection fallback');

  // Default to American for English, or return default with low confidence
  return {
    accent: isEnglish ? 'american' : DEFAULT_ACCENT,
    confidence: 'low',
    detectedLocale: normalized,
  };
}

/**
 * Get accent from an array of preferred locales (browser-style).
 * Returns the first high-confidence match, or best medium match.
 *
 * @param locales - Array of locale strings in preference order
 * @returns Detection result
 *
 * @example
 * // Browser typically provides navigator.languages
 * detectAccentFromLocales(['en-AU', 'en-US', 'en']);
 * // Returns: { accent: 'australian', confidence: 'high' }
 */
export function detectAccentFromLocales(locales: string[]): LocaleDetectionResult {
  let bestMatch: LocaleDetectionResult | null = null;

  for (const locale of locales) {
    const result = detectAccentFromLocale(locale);

    // Return immediately on high confidence match
    if (result.confidence === 'high') {
      return result;
    }

    // Track best medium-confidence match
    if (result.confidence === 'medium' && (!bestMatch || bestMatch.confidence === 'low')) {
      bestMatch = result;
    }

    // Track first low-confidence match as fallback
    if (!bestMatch) {
      bestMatch = result;
    }
  }

  return bestMatch ?? { accent: DEFAULT_ACCENT, confidence: 'low', detectedLocale: '' };
}

// =============================================================================
// CARTESIA INTEGRATION
// =============================================================================

/**
 * Get the Cartesia dialect code for an accent.
 *
 * @param accent - English accent
 * @returns Cartesia dialect code
 */
export function getDialectCode(accent: EnglishAccent): CartesiaDialect {
  return ACCENT_TO_DIALECT[accent];
}

/**
 * Check if an accent requires localization (non-American).
 * American English is the default for Cartesia voices.
 *
 * @param accent - English accent
 * @returns true if localization is needed
 */
export function requiresLocalization(accent: EnglishAccent): boolean {
  return accent !== 'american';
}

/**
 * Validate that an accent is supported.
 *
 * @param accent - Accent to validate
 * @returns true if valid
 */
export function isValidAccent(accent: string): accent is EnglishAccent {
  return SUPPORTED_ACCENTS.includes(accent as EnglishAccent);
}

// =============================================================================
// USER PREFERENCE HELPERS
// =============================================================================

/**
 * Create a default voice preference.
 *
 * @param detectedLocale - Optional locale for auto-detection
 * @returns Voice preference object
 */
export function createDefaultVoicePreference(detectedLocale?: string): VoicePreference {
  if (detectedLocale) {
    const detection = detectAccentFromLocale(detectedLocale);
    return {
      accent: detection.accent,
      autoDetected: true,
    };
  }

  return {
    accent: DEFAULT_ACCENT,
    autoDetected: false,
  };
}

/**
 * Merge user preference with defaults.
 *
 * @param partial - Partial preference from storage
 * @returns Complete voice preference
 */
export function mergeVoicePreference(partial?: Partial<VoicePreference>): VoicePreference {
  return {
    accent: partial?.accent ?? DEFAULT_ACCENT,
    language: partial?.language,
    autoDetected: partial?.autoDetected ?? false,
  };
}

// =============================================================================
// LOGGING & DEBUGGING
// =============================================================================

/**
 * Log accent selection for debugging.
 */
export function logAccentSelection(
  userId: string,
  accent: EnglishAccent,
  source: 'user' | 'auto' | 'default'
): void {
  log.info(
    {
      userId,
      accent,
      dialect: getDialectCode(accent),
      source,
      requiresLocalization: requiresLocalization(accent),
    },
    '🌍 Voice accent selected'
  );
}
