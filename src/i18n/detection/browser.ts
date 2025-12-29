/**
 * Browser Locale Detection and Persistence
 *
 * Detects user's preferred locale from various sources and persists
 * their preference across sessions.
 *
 * Detection priority:
 * 1. URL parameter (?lang=es)
 * 2. Persisted preference (localStorage/cookie)
 * 3. Browser's Accept-Language header
 * 4. Default locale (en-US)
 *
 * NOTE: This module can run in both browser and Node.js environments.
 * Browser-specific code is guarded with typeof checks.
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */

// Declare browser globals for TypeScript (not available in Node.js)
declare const window:
  | {
      location: { search: string; pathname: string };
    }
  | undefined;
declare const navigator:
  | {
      languages?: readonly string[];
      language?: string;
    }
  | undefined;
declare const localStorage:
  | {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
      removeItem(key: string): void;
    }
  | undefined;
declare const document:
  | {
      cookie: string;
    }
  | undefined;

import { type SupportedLocale, DEFAULT_LOCALE, LOCALE_METADATA } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOCALE_STORAGE_KEY = 'ferni_locale';
const LOCALE_COOKIE_NAME = 'ferni_locale';
const LOCALE_URL_PARAM = 'lang';

/**
 * Map of language codes to supported locales
 * Handles browser language variations
 */
const LANGUAGE_MAP: Record<string, SupportedLocale> = {
  // English
  en: 'en-US',
  'en-us': 'en-US',
  'en-gb': 'en-GB',
  'en-au': 'en-GB',
  'en-nz': 'en-GB',
  'en-ie': 'en-GB',
  'en-za': 'en-GB',

  // Spanish
  es: 'es',
  'es-es': 'es',
  'es-mx': 'es',
  'es-ar': 'es',
  'es-co': 'es',
  'es-cl': 'es',

  // French
  fr: 'fr',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  'fr-be': 'fr',
  'fr-ch': 'fr',

  // German
  de: 'de',
  'de-de': 'de',
  'de-at': 'de',
  'de-ch': 'de',

  // Japanese
  ja: 'ja',
  'ja-jp': 'ja',

  // Korean
  ko: 'ko',
  'ko-kr': 'ko',

  // Chinese
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-hant': 'zh-Hant',

  // Arabic
  ar: 'ar',
  'ar-sa': 'ar',
  'ar-ae': 'ar',
  'ar-eg': 'ar',

  // Hebrew
  he: 'he',
  'he-il': 'he',
  iw: 'he', // Legacy code
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Check if a locale is supported
 */
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return LOCALE_METADATA.some((meta) => meta.code === locale);
}

/**
 * Normalize a language code to a supported locale
 */
export function normalizeLocale(langCode: string): SupportedLocale | null {
  const normalized = langCode.toLowerCase().trim();

  // Direct match
  if (isSupportedLocale(normalized as SupportedLocale)) {
    return normalized as SupportedLocale;
  }

  // Check language map
  if (LANGUAGE_MAP[normalized]) {
    return LANGUAGE_MAP[normalized];
  }

  // Try base language (e.g., 'es-MX' → 'es')
  const baseLang = normalized.split('-')[0];
  if (baseLang && LANGUAGE_MAP[baseLang]) {
    return LANGUAGE_MAP[baseLang];
  }

  return null;
}

/**
 * Get locale from URL parameter
 */
export function getLocaleFromURL(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const langParam = params.get(LOCALE_URL_PARAM);

  if (langParam) {
    return normalizeLocale(langParam);
  }

  return null;
}

/**
 * Get locale from URL path (e.g., /es/pricing)
 */
export function getLocaleFromPath(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const firstSegment = pathSegments[0];
  if (firstSegment) {
    return normalizeLocale(firstSegment);
  }

  return null;
}

/**
 * Get locale from browser's navigator.languages
 */
export function getLocaleFromBrowser(): SupportedLocale | null {
  if (typeof navigator === 'undefined') return null;

  // Try navigator.languages (array of preferred languages)
  if (navigator.languages) {
    for (const lang of navigator.languages) {
      const locale = normalizeLocale(lang);
      if (locale) return locale;
    }
  }

  // Fallback to navigator.language
  if (navigator.language) {
    return normalizeLocale(navigator.language);
  }

  return null;
}

/**
 * Get persisted locale from localStorage
 */
export function getPersistedLocale(): SupportedLocale | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored as SupportedLocale)) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage might be disabled
  }

  return null;
}

/**
 * Get locale from cookie (for SSR scenarios)
 */
export function getLocaleFromCookie(): SupportedLocale | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === LOCALE_COOKIE_NAME && value) {
      const decoded = decodeURIComponent(value);
      if (isSupportedLocale(decoded as SupportedLocale)) {
        return decoded as SupportedLocale;
      }
    }
  }

  return null;
}

/**
 * Detect the best locale for the user
 *
 * Priority:
 * 1. URL parameter (?lang=es)
 * 2. URL path (/es/...)
 * 3. Persisted preference (localStorage)
 * 4. Cookie
 * 5. Browser preference
 * 6. Default (en-US)
 */
export function detectLocale(): SupportedLocale {
  return (
    getLocaleFromURL() ||
    getLocaleFromPath() ||
    getPersistedLocale() ||
    getLocaleFromCookie() ||
    getLocaleFromBrowser() ||
    DEFAULT_LOCALE
  );
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Persist locale preference to localStorage and cookie
 */
export function persistLocale(locale: SupportedLocale): void {
  // Save to localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // localStorage might be full or disabled
    }
  }

  // Save to cookie (for SSR and cross-subdomain)
  if (typeof document !== 'undefined') {
    const maxAge = 365 * 24 * 60 * 60; // 1 year
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }
}

/**
 * Clear persisted locale preference
 */
export function clearPersistedLocale(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  }

  if (typeof document !== 'undefined') {
    document.cookie = `${LOCALE_COOKIE_NAME}=; max-age=0; path=/`;
  }
}

// ============================================================================
// SERVER-SIDE DETECTION
// ============================================================================

/**
 * Parse Accept-Language header (for server-side detection)
 *
 * @param header - Accept-Language header value
 * @returns Sorted list of locales with quality values
 *
 * @example
 * parseAcceptLanguage('en-US,en;q=0.9,es;q=0.8')
 * // [{ locale: 'en-US', quality: 1 }, { locale: 'en', quality: 0.9 }, ...]
 */
export function parseAcceptLanguage(header: string): Array<{ locale: string; quality: number }> {
  if (!header) return [];

  return header
    .split(',')
    .map((part) => {
      const [locale, qValue] = part.trim().split(';q=');
      return {
        locale: (locale ?? '').trim(),
        quality: qValue ? parseFloat(qValue) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Get locale from Accept-Language header (server-side)
 */
export function getLocaleFromAcceptLanguage(header: string): SupportedLocale {
  const parsed = parseAcceptLanguage(header);

  for (const { locale } of parsed) {
    const normalized = normalizeLocale(locale);
    if (normalized) return normalized;
  }

  return DEFAULT_LOCALE;
}

// ============================================================================
// URL HELPERS
// ============================================================================

/**
 * Get URL with locale prefix
 */
export function getLocalizedURL(
  url: string,
  locale: SupportedLocale,
  defaultLocale: SupportedLocale = DEFAULT_LOCALE
): string {
  // Don't add prefix for default locale
  if (locale === defaultLocale) {
    return url;
  }

  // Add locale prefix
  const baseUrl = url.startsWith('/') ? url : `/${url}`;
  return `/${locale}${baseUrl}`;
}

/**
 * Remove locale prefix from URL
 */
export function stripLocaleFromURL(url: string): { path: string; locale: SupportedLocale | null } {
  const segments = url.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment) {
    const locale = normalizeLocale(firstSegment);

    if (locale) {
      return {
        path: '/' + segments.slice(1).join('/'),
        locale,
      };
    }
  }

  return { path: url, locale: null };
}

/**
 * Generate hreflang links for SEO
 */
export function generateHreflangLinks(
  currentPath: string,
  baseUrl = ''
): Array<{ locale: SupportedLocale; href: string }> {
  const { path } = stripLocaleFromURL(currentPath);

  return LOCALE_METADATA.map((meta) => ({
    locale: meta.code,
    href: `${baseUrl}${getLocalizedURL(path, meta.code)}`,
  }));
}
