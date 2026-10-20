/**
 * Encoders for page-template output. Generated pages are served on the app's
 * own origin, so nothing from a config may become markup or script there;
 * __tests__/template-safety.test.ts checks every template expression uses these.
 *
 * @module services/page-generator/template-encoders
 */
import Handlebars from 'handlebars';

/** JSON for an inline <script>: `<`, `>`, `&` and line separators are \u-escaped. */
export function scriptJson(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/** A URL for href/src/url(): web, mail, same-site path or image data, else '#'. */
export function safeUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  return /^(https?:|mailto:|data:image\/|\/(?![/\\]))[^\s\\]*$/i.test(url) ? url : '#';
}

/** A CSS name or keyword (font family, weight, style): letters, digits, space, '-', '.', ','. */
export function cssToken(value: unknown): string {
  return String(value ?? '').replace(/[^\w .,-]/g, '');
}

/** The only helpers the page templates may use (the safety test enforces it). */
export function registerHelpers(): void {
  Handlebars.registerHelper(
    'json',
    (value: unknown) => new Handlebars.SafeString(scriptJson(value))
  );
  Handlebars.registerHelper('safeUrl', (value: unknown) => safeUrl(value));
  Handlebars.registerHelper('cssToken', (value: unknown) => cssToken(value));
  Handlebars.registerHelper('currentYear', () => new Date().getFullYear());
  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
}
