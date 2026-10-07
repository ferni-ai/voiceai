/**
 * Plural-aware translation.
 *
 * Languages pluralize differently (English has one/other, Arabic has six
 * forms, Japanese has one), so "count === 1 ? a : b" is wrong outside English.
 * Store plural strings as sibling keys named by Intl.PluralRules category:
 *
 *   "seedsEarned": { "one": "{count} seed", "other": "{count} seeds" }
 *
 * and call tp('rewards.seedsEarned', n). Missing categories fall back to
 * `other`, so a locale only needs the forms its language uses.
 */

import { getLocale, t, type TranslationParams } from './index.js';

/** Returned by t() only when no locale has the key. */
const MISSING = '\u0000';

export function tp(key: string, count: number, params: TranslationParams = {}): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  const merged = { count, ...params };
  const exact = t(`${key}.${category}`, merged, MISSING);
  return exact !== MISSING ? exact : t(`${key}.other`, merged);
}
