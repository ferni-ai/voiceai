/**
 * Drop "[NEEDS_TRANSLATION] …" placeholders from locale files at build time.
 *
 * The source JSON keeps them so check-i18n sees every key and translators can
 * find them. At runtime t() treats a placeholder exactly like a missing key and
 * falls back to English, so shipping them only adds bytes (the English text,
 * once per locale) that no user sees.
 */
import type { Plugin } from 'vite';

const PLACEHOLDER = '[NEEDS_TRANSLATION]';
const LOCALE_FILE = /[\\/]src[\\/]i18n[\\/]locales[\\/][^\\/]+\.json$/;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Remove placeholder strings, and any object left empty by that. */
export function stripUntranslated(value: Json): Json | undefined {
  if (typeof value === 'string') return value.startsWith(PLACEHOLDER) ? undefined : value;
  if (Array.isArray(value) || value === null || typeof value !== 'object') return value;
  const out: { [key: string]: Json } = {};
  for (const [key, child] of Object.entries(value)) {
    const kept = stripUntranslated(child);
    if (kept !== undefined) out[key] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function stripUntranslatedI18n(): Plugin {
  return {
    name: 'strip-untranslated-i18n',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      if (!LOCALE_FILE.test(id.split('?')[0] ?? id)) return null;
      const stripped = stripUntranslated(JSON.parse(code) as Json) ?? {};
      return { code: JSON.stringify(stripped), map: null };
    },
  };
}
