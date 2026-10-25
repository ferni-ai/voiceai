/**
 * The call's language for /token: the request's Accept-Language, which the web
 * leads with the language chosen in the app (apps/web/src/services/app-accept-language.ts).
 *
 * Read whether or not the person has a saved location. Before, a saved location
 * skipped geo detection, the only place the header was read, and the call was 'en-US'.
 *
 * @module servers/api/routes/token-locale
 */
import type { IncomingMessage } from 'http';
import { parseAcceptLanguage } from '../../../services/identity/geo-detection.js';

export function requestLanguages(req: IncomingMessage): { locale: string; locales: string[] } {
  const languages = parseAcceptLanguage(String(req.headers['accept-language'] ?? ''));
  return { locale: languages[0] || 'en-US', locales: languages.length > 0 ? languages : ['en-US'] };
}
