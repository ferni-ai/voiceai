/**
 * Pluralization Utilities
 *
 * Provides ICU-compatible pluralization for different locales.
 * Handles complex plural rules for languages like Arabic (6 forms)
 * and Slavic languages (3 forms).
 */

import { type SupportedLocale, type PluralCategory, DEFAULT_LOCALE } from '../types.js';

// ============================================================================
// PLURAL RULES
// ============================================================================

/**
 * Get the plural category for a number in a locale
 */
export function getPluralCategory(
  n: number,
  locale: SupportedLocale = DEFAULT_LOCALE
): PluralCategory {
  const rules = new Intl.PluralRules(locale);
  return rules.select(n) as PluralCategory;
}

/**
 * Pluralize a word based on count
 *
 * @param count - The number to base pluralization on
 * @param forms - Object with plural forms { one: '...', other: '...' }
 * @param locale - Locale for plural rules
 *
 * @example
 * pluralize(1, { one: 'conversation', other: 'conversations' }) // "conversation"
 * pluralize(5, { one: 'conversation', other: 'conversations' }) // "conversations"
 */
export function pluralize(
  count: number,
  forms: Partial<Record<PluralCategory, string>>,
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const category = getPluralCategory(count, locale);

  // Try to find the matching form, falling back through the chain
  const fallbackChain: PluralCategory[] = [category, 'other', 'many', 'few', 'two', 'one', 'zero'];

  for (const cat of fallbackChain) {
    if (forms[cat] !== undefined) {
      return forms[cat]!;
    }
  }

  // Last resort: return the first available form
  return Object.values(forms)[0] || '';
}

/**
 * Format a count with its unit (e.g., "5 conversations")
 */
export function formatCount(
  count: number,
  forms: Partial<Record<PluralCategory, string>>,
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const word = pluralize(count, forms, locale);
  const formattedCount = new Intl.NumberFormat(locale).format(count);
  return `${formattedCount} ${word}`;
}

// ============================================================================
// COMMON PLURALIZATIONS
// ============================================================================

/**
 * Common plural forms for English
 */
export const ENGLISH_PLURALS = {
  conversation: { one: 'conversation', other: 'conversations' },
  minute: { one: 'minute', other: 'minutes' },
  hour: { one: 'hour', other: 'hours' },
  day: { one: 'day', other: 'days' },
  week: { one: 'week', other: 'weeks' },
  month: { one: 'month', other: 'months' },
  year: { one: 'year', other: 'years' },
  message: { one: 'message', other: 'messages' },
  member: { one: 'member', other: 'members' },
  item: { one: 'item', other: 'items' },
} as const;

/**
 * Common plural forms for Spanish
 */
export const SPANISH_PLURALS = {
  conversation: { one: 'conversación', other: 'conversaciones' },
  minute: { one: 'minuto', other: 'minutos' },
  hour: { one: 'hora', other: 'horas' },
  day: { one: 'día', other: 'días' },
  week: { one: 'semana', other: 'semanas' },
  month: { one: 'mes', other: 'meses' },
  year: { one: 'año', other: 'años' },
  message: { one: 'mensaje', other: 'mensajes' },
  member: { one: 'miembro', other: 'miembros' },
  item: { one: 'artículo', other: 'artículos' },
} as const;

/**
 * Common plural forms for French
 */
export const FRENCH_PLURALS = {
  conversation: { one: 'conversation', other: 'conversations' },
  minute: { one: 'minute', other: 'minutes' },
  hour: { one: 'heure', other: 'heures' },
  day: { one: 'jour', other: 'jours' },
  week: { one: 'semaine', other: 'semaines' },
  month: { one: 'mois', other: 'mois' },
  year: { one: 'an', other: 'ans' },
  message: { one: 'message', other: 'messages' },
  member: { one: 'membre', other: 'membres' },
  item: { one: 'article', other: 'articles' },
} as const;

/**
 * Common plural forms for German
 */
export const GERMAN_PLURALS = {
  conversation: { one: 'Gespräch', other: 'Gespräche' },
  minute: { one: 'Minute', other: 'Minuten' },
  hour: { one: 'Stunde', other: 'Stunden' },
  day: { one: 'Tag', other: 'Tage' },
  week: { one: 'Woche', other: 'Wochen' },
  month: { one: 'Monat', other: 'Monate' },
  year: { one: 'Jahr', other: 'Jahre' },
  message: { one: 'Nachricht', other: 'Nachrichten' },
  member: { one: 'Mitglied', other: 'Mitglieder' },
  item: { one: 'Artikel', other: 'Artikel' },
} as const;

/**
 * Common plural forms for Japanese (no grammatical plural)
 */
export const JAPANESE_PLURALS = {
  conversation: { other: '会話' },
  minute: { other: '分' },
  hour: { other: '時間' },
  day: { other: '日' },
  week: { other: '週' },
  month: { other: 'ヶ月' },
  year: { other: '年' },
  message: { other: 'メッセージ' },
  member: { other: 'メンバー' },
  item: { other: 'アイテム' },
} as const;

/**
 * Get plural forms for a locale
 */
export function getPluralsForLocale(
  locale: SupportedLocale
): Record<string, Partial<Record<PluralCategory, string>>> {
  const pluralsByLocale: Partial<
    Record<SupportedLocale, Record<string, Partial<Record<PluralCategory, string>>>>
  > = {
    'en-US': ENGLISH_PLURALS,
    'en-GB': ENGLISH_PLURALS,
    es: SPANISH_PLURALS,
    fr: FRENCH_PLURALS,
    de: GERMAN_PLURALS,
    ja: JAPANESE_PLURALS,
  };

  return pluralsByLocale[locale] || ENGLISH_PLURALS;
}

// ============================================================================
// ORDINALS
// ============================================================================

/**
 * Get the ordinal suffix for a number (e.g., 1st, 2nd, 3rd)
 */
export function getOrdinal(n: number, locale: SupportedLocale = DEFAULT_LOCALE): string {
  const pr = new Intl.PluralRules(locale, { type: 'ordinal' });
  const rule = pr.select(n);

  // English ordinal suffixes
  if (locale.startsWith('en')) {
    const suffixes: Record<string, string> = {
      one: 'st',
      two: 'nd',
      few: 'rd',
      other: 'th',
    };
    return `${n}${suffixes[rule] || 'th'}`;
  }

  // French ordinals
  if (locale === 'fr') {
    return n === 1 ? '1er' : `${n}e`;
  }

  // German ordinals
  if (locale === 'de') {
    return `${n}.`;
  }

  // Spanish ordinals
  if (locale === 'es') {
    return n === 1 ? '1º' : `${n}º`;
  }

  // Japanese ordinals
  if (locale === 'ja') {
    return `第${n}`;
  }

  // Default: just the number
  return `${n}`;
}

/**
 * Format an ordinal number with a noun (e.g., "1st conversation")
 */
export function formatOrdinal(
  n: number,
  noun: string,
  locale: SupportedLocale = DEFAULT_LOCALE
): string {
  const ordinal = getOrdinal(n, locale);

  // In some languages, ordinal comes after the noun
  if (['ja', 'ko', 'zh-Hans', 'zh-Hant'].includes(locale)) {
    return `${ordinal}${noun}`;
  }

  return `${ordinal} ${noun}`;
}
