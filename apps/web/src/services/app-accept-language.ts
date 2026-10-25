/**
 * The Accept-Language a voice token request sends when the app's language isn't English.
 *
 * /token reads the call's locale from this header (src/servers/api/routes/token.ts).
 * Left to the browser, it carried the browser's language, not the one chosen in
 * the app, so a Spanish app in an English browser started an English-locale call.
 *
 * The same header also picks the accent of Ferni's voice. A UI language choice
 * must never change Ferni's voice (lead decision on #2791), so for an English app
 * language this returns undefined and the browser sends its own header, as before:
 * "English (UK)" in an en-US browser stays American. For any other language the
 * chosen locale leads (it carries no accent), then the browser's own languages in
 * their order, which still pick the accent exactly as before.
 *
 * @module services/app-accept-language
 */

import { getLocale } from '../i18n/index.js';

/** Enough to keep the browser's next choices without a long header. */
const MAX_OTHER_LANGUAGES = 4;

export function appAcceptLanguage(): string | undefined {
  const chosen = getLocale();
  if (chosen.toLowerCase().startsWith('en')) return undefined;
  const browser =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  const tags = browser.filter(
    (tag): tag is string => typeof tag === 'string' && /^[A-Za-z0-9-]{2,35}$/.test(tag)
  );
  const others = [...new Set(tags.filter((tag) => tag !== chosen))].slice(0, MAX_OTHER_LANGUAGES);
  return [chosen, ...others.map((tag, i) => `${tag};q=${(0.9 - i * 0.1).toFixed(1)}`)].join(', ');
}
