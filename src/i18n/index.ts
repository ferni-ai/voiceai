/**
 * I18n Core Module
 *
 * Provides internationalization utilities for the Ferni application.
 * Uses design-system/tokens/i18n.json for locale configuration.
 *
 * Features:
 * - Type-safe translation keys
 * - Interpolation with {variable} syntax
 * - Fallback chain for missing translations
 * - RTL support for Arabic/Hebrew
 * - Date/time/number formatting via Intl APIs
 *
 * NOTE: This module can run in both browser and Node.js environments.
 * Browser-specific code is guarded with typeof checks.
 */

// Declare browser globals for TypeScript (not available in Node.js)
declare const document:
  | {
      documentElement: {
        lang: string;
        dir: string;
      };
    }
  | undefined;

import {
  type SupportedLocale,
  type TextDirection,
  type TranslationParams,
  type Translations,
  DEFAULT_LOCALE,
  FALLBACK_CHAIN,
  RTL_LOCALES,
} from './types.js';

// Import source translations (en-US is always bundled)
import enUS from './locales/en-US.json' with { type: 'json' };

// ============================================================================
// STATE
// ============================================================================

let currentLocale: SupportedLocale = DEFAULT_LOCALE;
const loadedTranslations = new Map<SupportedLocale, Translations>([
  ['en-US', enUS as Translations],
]);

// ============================================================================
// LOCALE MANAGEMENT
// ============================================================================

/**
 * Get the current locale
 */
export function getLocale(): SupportedLocale {
  return currentLocale;
}

/**
 * Set the current locale
 * Loads translations if not already loaded
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  if (!loadedTranslations.has(locale)) {
    await loadTranslations(locale);
  }
  currentLocale = locale;

  // Update document direction for RTL languages
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }
}

/**
 * Get text direction for a locale
 */
export function getDirection(locale: SupportedLocale = currentLocale): TextDirection {
  const baseLocale = locale.split('-')[0] as SupportedLocale;
  return RTL_LOCALES.includes(baseLocale) || RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/**
 * Check if current locale is RTL
 */
export function isRTL(): boolean {
  return getDirection() === 'rtl';
}

// ============================================================================
// TRANSLATION LOADING
// ============================================================================

/**
 * Lazy-load translations for a locale
 */
async function loadTranslations(locale: SupportedLocale): Promise<void> {
  if (loadedTranslations.has(locale)) {
    return;
  }

  try {
    // Dynamic import for code splitting
    const module = await import(`./locales/${locale}.json`);
    loadedTranslations.set(locale, module.default as Translations);
  } catch (error) {
    console.warn(`Failed to load translations for ${locale}, using fallback`);
    // Try fallback chain
    for (const fallback of FALLBACK_CHAIN[locale] || []) {
      if (loadedTranslations.has(fallback)) {
        loadedTranslations.set(locale, loadedTranslations.get(fallback)!);
        return;
      }
    }
    // Last resort: use en-US
    loadedTranslations.set(locale, loadedTranslations.get('en-US')!);
  }
}

/**
 * Preload translations for multiple locales
 */
export async function preloadLocales(locales: SupportedLocale[]): Promise<void> {
  await Promise.all(locales.map(loadTranslations));
}

// ============================================================================
// TRANSLATION FUNCTION
// ============================================================================

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Translations, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate variables into a translation string
 * Supports {variable} syntax
 */
function interpolate(str: string, params?: TranslationParams): string {
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Translate a key to the current locale
 *
 * @param key - Dot-notation path to translation (e.g., 'hero.headline')
 * @param params - Optional interpolation parameters
 * @returns Translated string, or key if not found
 *
 * @example
 * t('hero.headline') // "Better than"
 * t('time.minutesAgo', { n: 5 }) // "5 minutes ago"
 */
export function t(key: string, params?: TranslationParams): string {
  // Try current locale
  const translations = loadedTranslations.get(currentLocale);
  if (translations) {
    const value = getNestedValue(translations, key);
    if (value) {
      return interpolate(value, params);
    }
  }

  // Try fallback chain
  for (const fallback of FALLBACK_CHAIN[currentLocale] || []) {
    const fallbackTranslations = loadedTranslations.get(fallback);
    if (fallbackTranslations) {
      const value = getNestedValue(fallbackTranslations, key);
      if (value) {
        return interpolate(value, params);
      }
    }
  }

  // Try en-US as last resort
  const enTranslations = loadedTranslations.get('en-US');
  if (enTranslations) {
    const value = getNestedValue(enTranslations, key);
    if (value) {
      return interpolate(value, params);
    }
  }

  // Return key if nothing found
  console.warn(`Missing translation: ${key}`);
  return key;
}

/**
 * Check if a translation key exists
 */
export function hasTranslation(key: string): boolean {
  const translations = loadedTranslations.get(currentLocale);
  if (!translations) return false;
  return getNestedValue(translations, key) !== undefined;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format a number according to the current locale
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}

/**
 * Format a currency value according to the current locale
 */
export function formatCurrency(
  value: number,
  currency = 'USD',
  options?: Partial<Intl.NumberFormatOptions>
): string {
  return new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency,
    ...options,
  }).format(value);
}

/**
 * Format a date according to the current locale
 */
export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentLocale, options).format(date);
}

/**
 * Format a relative time (e.g., "5 minutes ago")
 */
export function formatRelativeTime(date: Date, baseDate: Date = new Date()): string {
  const diff = baseDate.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: 'auto' });

  if (seconds < 60) {
    return t('time.justNow');
  } else if (minutes < 60) {
    return rtf.format(-minutes, 'minute');
  } else if (hours < 24) {
    return rtf.format(-hours, 'hour');
  } else if (days === 1) {
    return t('time.yesterday');
  } else {
    return rtf.format(-days, 'day');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize i18n with detected or stored locale
 */
export async function initI18n(options?: {
  initialLocale?: SupportedLocale;
  preloadLocales?: SupportedLocale[];
}): Promise<void> {
  const { initialLocale = DEFAULT_LOCALE, preloadLocales: localesToPreload = [] } = options || {};

  // Set initial locale
  await setLocale(initialLocale);

  // Preload additional locales
  if (localesToPreload.length > 0) {
    await preloadLocales(localesToPreload);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export * from './types.js';

// Re-export formatters
export { formatDate as formatLocalizedDate } from './formatters/date.js';
export {
  formatNumber as formatLocalizedNumber,
  formatCurrency as formatLocalizedCurrency,
} from './formatters/number.js';

// Re-export detection utilities
export { detectLocale, persistLocale, getPersistedLocale } from './detection/browser.js';
