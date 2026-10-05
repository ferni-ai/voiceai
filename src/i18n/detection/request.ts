/**
 * Pick a supported locale from an HTTP Accept-Language header.
 *
 * The web app sends its chosen locale here, so API copy follows the app's
 * language setting rather than the browser's. Tags are tried in q order;
 * regional variants map to the closest supported locale (es-MX → es,
 * zh-TW → zh-Hant), and anything unknown falls back to en-US.
 */

import { DEFAULT_LOCALE, LOCALE_METADATA, type SupportedLocale } from '../types.js';

const SUPPORTED = new Map<string, SupportedLocale>(LOCALE_METADATA.map((m) => [m.code.toLowerCase(), m.code]));

/** Tags whose base language alone doesn't name a supported locale. */
const ALIASES: Record<string, SupportedLocale> = {
  en: 'en-US',
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  iw: 'he', // legacy code for Hebrew
};

function matchTag(tag: string): SupportedLocale | undefined {
  const exact = SUPPORTED.get(tag) ?? ALIASES[tag];
  if (exact) return exact;
  // zh-Hant-TW / zh-Hans-CN carry the script as the second subtag
  const [base, second] = tag.split('-');
  if (base === 'zh' && (second === 'hant' || second === 'hans')) return SUPPORTED.get(`zh-${second}`);
  return base ? (SUPPORTED.get(base) ?? ALIASES[base]) : undefined;
}

export function localeFromAcceptLanguage(header: string | undefined | null): SupportedLocale {
  const ranked = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter(({ tag, q }) => tag && tag !== '*' && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of ranked) {
    const locale = matchTag(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
