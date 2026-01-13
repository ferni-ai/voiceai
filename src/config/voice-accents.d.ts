/**
 * Voice Accents Configuration
 *
 * Supports international English accents using Cartesia's localization feature.
 * Users can choose their preferred accent, and we adapt the persona's voice.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/capability-guides/localize-voices
 */
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
/**
 * Map accents to Cartesia dialect codes.
 */
export declare const ACCENT_TO_DIALECT: Record<EnglishAccent, CartesiaDialect>;
/**
 * Human-readable accent names for UI.
 */
export declare const ACCENT_DISPLAY_NAMES: Record<EnglishAccent, string>;
/**
 * Accent descriptions for accessibility/tooltips.
 */
export declare const ACCENT_DESCRIPTIONS: Record<EnglishAccent, string>;
/**
 * All supported accents in display order.
 */
export declare const SUPPORTED_ACCENTS: readonly EnglishAccent[];
/**
 * Default accent when none is specified.
 */
export declare const DEFAULT_ACCENT: EnglishAccent;
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
export declare function detectAccentFromLocale(locale: string): LocaleDetectionResult;
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
export declare function detectAccentFromLocales(locales: string[]): LocaleDetectionResult;
/**
 * Get the Cartesia dialect code for an accent.
 *
 * @param accent - English accent
 * @returns Cartesia dialect code
 */
export declare function getDialectCode(accent: EnglishAccent): CartesiaDialect;
/**
 * Check if an accent requires localization (non-American).
 * American English is the default for Cartesia voices.
 *
 * @param accent - English accent
 * @returns true if localization is needed
 */
export declare function requiresLocalization(accent: EnglishAccent): boolean;
/**
 * Validate that an accent is supported.
 *
 * @param accent - Accent to validate
 * @returns true if valid
 */
export declare function isValidAccent(accent: string): accent is EnglishAccent;
/**
 * Create a default voice preference.
 *
 * @param detectedLocale - Optional locale for auto-detection
 * @returns Voice preference object
 */
export declare function createDefaultVoicePreference(detectedLocale?: string): VoicePreference;
/**
 * Merge user preference with defaults.
 *
 * @param partial - Partial preference from storage
 * @returns Complete voice preference
 */
export declare function mergeVoicePreference(partial?: Partial<VoicePreference>): VoicePreference;
/**
 * Log accent selection for debugging.
 */
export declare function logAccentSelection(userId: string, accent: EnglishAccent, source: 'user' | 'auto' | 'default'): void;
//# sourceMappingURL=voice-accents.d.ts.map