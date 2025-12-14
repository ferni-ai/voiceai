/**
 * I18n Type Definitions
 *
 * Type-safe translation keys and locale configuration.
 * These types are auto-generated from the en-US.json source file.
 */

/**
 * Supported locale codes
 * Matches design-system/tokens/i18n.json supportedLocales
 */
export type SupportedLocale =
  | 'en-US'
  | 'en-GB'
  | 'es'
  | 'fr'
  | 'de'
  | 'ja'
  | 'ko'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'ar'
  | 'he';

/**
 * Text direction
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * RTL locales
 */
export const RTL_LOCALES: readonly SupportedLocale[] = ['ar', 'he'] as const;

/**
 * Locale configuration from design tokens
 */
export interface LocaleConfig {
  name: string;
  direction: TextDirection;
  dateFormat: string;
  timeFormat: string;
  numberFormat: {
    decimal: string;
    thousands: string;
    currency: string;
  };
  typography?: {
    fontFamily?: string;
    lineHeightMultiplier?: number;
    letterSpacingAdjust?: number;
  };
}

/**
 * Currency configuration per locale
 */
export interface CurrencyConfig {
  code: string;
  symbol: string;
  position: 'before' | 'after';
  decimals: number;
}

/**
 * i18n context passed to components
 */
export interface I18nContext {
  locale: SupportedLocale;
  direction: TextDirection;
  currency: CurrencyConfig;
}

/**
 * Translation interpolation parameters
 */
export type TranslationParams = Record<string, string | number>;

/**
 * Plural form types (ICU standard)
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Translation value - can be string or nested object
 */
export type TranslationValue = string | { [key: string]: TranslationValue };

/**
 * Translation file structure
 */
export interface Translations {
  [key: string]: TranslationValue;
}

/**
 * Flatten nested keys to dot-notation paths
 * Example: { a: { b: 'c' } } → 'a.b'
 */
export type FlattenKeys<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : T extends object
    ? {
        [K in keyof T]: K extends string
          ? FlattenKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
          : never;
      }[keyof T]
    : never;

/**
 * Date format options
 */
export interface DateFormatOptions {
  style?: 'full' | 'long' | 'medium' | 'short';
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
}

/**
 * Number format options
 */
export interface NumberFormatOptions {
  style?: 'decimal' | 'currency' | 'percent';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  currency?: string;
}

/**
 * Relative time unit
 */
export type RelativeTimeUnit =
  | 'year'
  | 'quarter'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

/**
 * Locale metadata for UI display
 */
export interface LocaleMetadata {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flag: string;
  direction: TextDirection;
}

/**
 * All supported locales with metadata
 */
export const LOCALE_METADATA: readonly LocaleMetadata[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English', flag: '🇺🇸', direction: 'ltr' },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English', flag: '🇬🇧', direction: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', direction: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', direction: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', direction: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', direction: 'ltr' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳', direction: 'ltr' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', nativeName: '繁體中文', flag: '🇹🇼', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', direction: 'rtl' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', direction: 'rtl' },
] as const;

/**
 * Default locale
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

/**
 * Fallback chain for missing translations
 */
export const FALLBACK_CHAIN: Record<SupportedLocale, SupportedLocale[]> = {
  'en-US': [],
  'en-GB': ['en-US'],
  'es': ['en-US'],
  'fr': ['en-US'],
  'de': ['en-US'],
  'ja': ['en-US'],
  'ko': ['en-US'],
  'zh-Hans': ['en-US'],
  'zh-Hant': ['zh-Hans', 'en-US'],
  'ar': ['en-US'],
  'he': ['en-US'],
};
