/**
 * One sanitizer for every string a custom agent's owner wrote, wherever it goes
 * on a live call: the prompt's profile block (custom-agent-live-prompt.ts) and
 * the session persona (custom-agent-live-persona.ts).
 *
 * It removes what a reader can't see or a prompt shouldn't carry, so no
 * consumer ever gets the owner's raw text:
 * - C0 and C1 controls (U+0000-U+001F, U+007F-U+009F, NEL U+0085 included);
 * - format characters: zero-width, bidi overrides and isolates, soft hyphen,
 *   word joiner, BOM;
 * - line and paragraph separators (U+2028, U+2029);
 * - Unicode tag characters (U+E0000-U+E007F, "ASCII smuggling").
 * Whitespace is flattened to single spaces, `&`, `<` and `>` are escaped, and the
 * escaped text is capped in code points (never splitting a surrogate pair or an entity).
 *
 * @module services/custom-agent/custom-agent-owner-text
 */

/** Characters no owner-written string keeps. The `u` flag makes the property and astral ranges work. */
export const UNSAFE_OWNER_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{E0000}-\u{E007F}]/gu;

const UNSAFE_OR_MARKUP = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{E0000}-\u{E007F}<>]/u;

/** Owner-written text made inert: unsafe characters gone, one line, at most `max` code points, escaped. */
export function sanitizeOwnerText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  const flat = text.replace(UNSAFE_OWNER_CHARS, ' ').replace(/\s+/g, ' ').trim();
  const escaped = flat.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // The cap counts the escaped text, and never leaves half an entity at the end
  return Array.from(escaped)
    .slice(0, max)
    .join('')
    .replace(/&[a-z]{0,3}$/, '')
    .trim();
}

/** True when `text` could have come out of sanitizeOwnerText: no unsafe character, no markup, one line. */
export function isSanitizedOwnerText(text: string): boolean {
  return !UNSAFE_OR_MARKUP.test(text) && !/[\r\n\t]/.test(text) && text === text.trim();
}

/** Each item sanitized, empties dropped, at most `count` of them. */
export function sanitizeOwnerList(items: unknown, each: number, count: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => sanitizeOwnerText(item, each))
    .filter(Boolean)
    .slice(0, count);
}
