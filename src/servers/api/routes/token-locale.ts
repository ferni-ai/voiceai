/**
 * The call's language for /token: the request's Accept-Language, which the web
 * leads with the app's language when it isn't English (apps/web/src/services/app-accept-language.ts).
 *
 * Read whether or not the person has a saved location. Before, a saved location
 * skipped geo detection, the only place the header was read, and the call was 'en-US'.
 * The accent is not decided here.
 *
 * Parsed here rather than with geo-detection's parseAcceptLanguage: /token tests
 * mock that module wholesale, and a missing export there turned /token into a 500.
 *
 * @module servers/api/routes/token-locale
 */
import type { IncomingMessage } from 'http';

/** Language tags by preference: "es, en-US;q=0.9" → ['es', 'en-US']. */
function languagesOf(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.split(';').map((s) => s.trim());
      const q = params.find((p) => p.startsWith('q='));
      return { tag, q: q ? Number(q.slice(2)) : 1 };
    })
    .filter(({ tag, q }) => tag.length > 0 && tag !== '*' && Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ tag }) => tag);
}

export function requestLanguages(req: IncomingMessage): { locale: string; locales: string[] } {
  const header = req.headers['accept-language'];
  const languages = languagesOf(typeof header === 'string' ? header : '');
  return { locale: languages[0] ?? 'en-US', locales: languages.length > 0 ? languages : ['en-US'] };
}
