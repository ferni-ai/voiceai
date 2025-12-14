/**
 * Frontend I18n Module
 *
 * Browser-optimized internationalization for the Ferni frontend app.
 * Uses the shared translation files and provides reactive locale management.
 *
 * Features:
 * - Lazy-loaded translations (only loads current locale)
 * - Automatic locale detection from browser
 * - Persistence via localStorage
 * - RTL support for Arabic/Hebrew
 * - Format utilities for dates, numbers, currencies
 */

// ============================================================================
// TYPES
// ============================================================================

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

export type TextDirection = 'ltr' | 'rtl';

export type TranslationParams = Record<string, string | number>;

interface Translations {
  [key: string]: string | string[] | Translations;
}

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flag: string;
  direction: TextDirection;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RTL_LOCALES: readonly SupportedLocale[] = ['ar', 'he'] as const;
const DEFAULT_LOCALE: SupportedLocale = 'en-US';
const STORAGE_KEY = 'ferni_locale';

export const SUPPORTED_LOCALES: readonly LocaleInfo[] = [
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

// Fallback chain for missing translations
const FALLBACK_CHAIN: Record<SupportedLocale, SupportedLocale[]> = {
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

// ============================================================================
// STATE
// ============================================================================

let currentLocale: SupportedLocale = DEFAULT_LOCALE;
const loadedTranslations: Map<SupportedLocale, Translations> = new Map();
const localeChangeListeners: Set<(locale: SupportedLocale) => void> = new Set();

// ============================================================================
// LOCALE DETECTION
// ============================================================================

/**
 * Language code mapping for browser variations
 */
const LANGUAGE_MAP: Record<string, SupportedLocale> = {
  'en': 'en-US',
  'en-us': 'en-US',
  'en-gb': 'en-GB',
  'en-au': 'en-GB',
  'es': 'es',
  'es-es': 'es',
  'es-mx': 'es',
  'fr': 'fr',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  'de': 'de',
  'de-de': 'de',
  'de-at': 'de',
  'ja': 'ja',
  'ja-jp': 'ja',
  'ko': 'ko',
  'ko-kr': 'ko',
  'zh': 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-hant': 'zh-Hant',
  'ar': 'ar',
  'ar-sa': 'ar',
  'he': 'he',
  'he-il': 'he',
  'iw': 'he',
};

/**
 * Normalize a language code to a supported locale
 */
function normalizeLocale(langCode: string): SupportedLocale | null {
  const normalized = langCode.toLowerCase().trim();

  // Direct match
  if (SUPPORTED_LOCALES.some((l) => l.code === normalized)) {
    return normalized as SupportedLocale;
  }

  // Check language map
  if (LANGUAGE_MAP[normalized]) {
    return LANGUAGE_MAP[normalized];
  }

  // Try base language
  const baseLang = normalized.split('-')[0];
  if (baseLang && LANGUAGE_MAP[baseLang]) {
    return LANGUAGE_MAP[baseLang];
  }

  return null;
}

/**
 * Get locale from URL parameter (?lang=es)
 */
function getLocaleFromURL(): SupportedLocale | null {
  const params = new URLSearchParams(window.location.search);
  const langParam = params.get('lang');
  if (langParam) {
    return normalizeLocale(langParam);
  }
  return null;
}

/**
 * Get locale from localStorage
 */
function getPersistedLocale(): SupportedLocale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage might be disabled
  }
  return null;
}

/**
 * Get locale from browser's navigator.languages
 */
function getLocaleFromBrowser(): SupportedLocale | null {
  if (navigator.languages) {
    for (const lang of navigator.languages) {
      const locale = normalizeLocale(lang);
      if (locale) return locale;
    }
  }
  if (navigator.language) {
    return normalizeLocale(navigator.language);
  }
  return null;
}

/**
 * Detect the best locale for the user
 */
export function detectLocale(): SupportedLocale {
  return (
    getLocaleFromURL() ||
    getPersistedLocale() ||
    getLocaleFromBrowser() ||
    DEFAULT_LOCALE
  );
}

// ============================================================================
// TRANSLATION LOADING
// ============================================================================

/**
 * Load translations for a locale
 */
async function loadTranslations(locale: SupportedLocale): Promise<void> {
  if (loadedTranslations.has(locale)) {
    return;
  }

  try {
    // Dynamic import for code splitting
    const module = await import(`../../../src/i18n/locales/${locale}.json`);
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
    // Last resort: load en-US
    if (locale !== 'en-US' && !loadedTranslations.has('en-US')) {
      try {
        const enModule = await import('../../../src/i18n/locales/en-US.json');
        loadedTranslations.set('en-US', enModule.default as Translations);
        loadedTranslations.set(locale, enModule.default as Translations);
      } catch {
        // Cannot load any translations
        loadedTranslations.set(locale, {});
      }
    }
  }
}

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
 * Get locale info for the current or specified locale
 */
export function getLocaleInfo(locale: SupportedLocale = currentLocale): LocaleInfo {
  const found = SUPPORTED_LOCALES.find((l) => l.code === locale);
  // Fallback to en-US which is always first
  return found ?? SUPPORTED_LOCALES[0] as LocaleInfo;
}

/**
 * Check if current locale is RTL
 */
export function isRTL(): boolean {
  return RTL_LOCALES.includes(currentLocale);
}

/**
 * Get text direction for current locale
 */
export function getDirection(): TextDirection {
  return isRTL() ? 'rtl' : 'ltr';
}

/**
 * Set the current locale
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  if (!loadedTranslations.has(locale)) {
    await loadTranslations(locale);
  }

  const previousLocale = currentLocale;
  currentLocale = locale;

  // Persist preference
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage might be disabled
  }

  // Update document direction
  document.documentElement.lang = locale;
  document.documentElement.dir = getDirection();

  // Add/remove RTL class
  if (isRTL()) {
    document.documentElement.classList.add('rtl');
    document.documentElement.classList.remove('ltr');
  } else {
    document.documentElement.classList.add('ltr');
    document.documentElement.classList.remove('rtl');
  }

  // Notify listeners
  if (previousLocale !== locale) {
    localeChangeListeners.forEach((listener) => listener(locale));
  }
}

/**
 * Subscribe to locale changes
 */
export function onLocaleChange(listener: (locale: SupportedLocale) => void): () => void {
  localeChangeListeners.add(listener);
  return () => localeChangeListeners.delete(listener);
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

// ============================================================================
// FORMAT UTILITIES
// ============================================================================

/**
 * Format a number according to the current locale
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(currentLocale, options).format(value);
}

/**
 * Currency codes by locale
 */
const LOCALE_CURRENCY: Record<SupportedLocale, string> = {
  'en-US': 'USD',
  'en-GB': 'GBP',
  'es': 'EUR',
  'fr': 'EUR',
  'de': 'EUR',
  'ja': 'JPY',
  'ko': 'KRW',
  'zh-Hans': 'CNY',
  'zh-Hant': 'TWD',
  'ar': 'SAR',
  'he': 'ILS',
};

/**
 * Format a currency value according to the current locale
 */
export function formatCurrency(
  value: number,
  currency?: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const currencyCode = currency || LOCALE_CURRENCY[currentLocale] || 'USD';
  return new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency: currencyCode,
    ...options,
  }).format(value);
}

/**
 * Format a date according to the current locale
 */
export function formatDate(
  date: Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(currentLocale, options).format(date);
}

/**
 * Format a relative time (e.g., "5 minutes ago")
 */
export function formatRelativeTime(
  date: Date,
  baseDate: Date = new Date()
): string {
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
 * Initialize i18n with detected locale
 */
export async function initI18n(): Promise<void> {
  const detected = detectLocale();
  await setLocale(detected);
}

/**
 * Check if i18n is initialized
 */
export function isInitialized(): boolean {
  return loadedTranslations.has(currentLocale);
}
