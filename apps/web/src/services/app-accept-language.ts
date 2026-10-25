/**
 * The Accept-Language a voice token request sends: the app's chosen language
 * first (Look & Feel), then the browser's own languages.
 *
 * /token reads the call's locale from this header (src/servers/api/routes/token.ts),
 * and the accent it picks follows the first English tag it recognizes. Left to
 * the browser, the header carried the browser's language, not the one chosen in
 * the app. The browser's own tag for the chosen language leads when there is
 * one, so its region survives: en-AU picks the app's en-GB but keeps an
 * Australian accent.
 *
 * @module services/app-accept-language
 */

import { getLocale, normalizeLocale } from '../i18n/index.js';

/** Enough to keep the browser's next choices without a long header. */
const MAX_OTHER_LANGUAGES = 4;

export function appAcceptLanguage(): string {
  const chosen = getLocale();
  const browser =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  const tags = browser.filter(
    (tag): tag is string => typeof tag === 'string' && /^[A-Za-z0-9-]{2,35}$/.test(tag)
  );
  const lead = tags.find((tag) => normalizeLocale(tag) === chosen) ?? chosen;
  const others = [...new Set(tags.filter((tag) => tag !== lead))].slice(0, MAX_OTHER_LANGUAGES);
  return [lead, ...others.map((tag, i) => `${tag};q=${(0.9 - i * 0.1).toFixed(1)}`)].join(', ');
}
