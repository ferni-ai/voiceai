/**
 * One sanitizer for every string a custom agent's owner wrote, wherever it goes
 * on a live call: the prompt's profile block (custom-agent-live-prompt.ts) and
 * the session persona (custom-agent-live-persona.ts).
 *
 * It removes what a reader can't see or a prompt shouldn't carry, so no
 * consumer ever gets the owner's raw text:
 * - C0 and C1 controls (U+0000-U+001F, U+007F-U+009F, NEL U+0085 included);
 * - format characters: zero-width, bidi overrides and isolates, soft hyphen,
 *   word joiner, BOM. The one exception is a zero-width joiner (U+200D) between
 *   two emoji, which is part of the emoji (woman astronaut: woman, skin tone, ZWJ, rocket), not hidden text;
 * - line and paragraph separators (U+2028, U+2029);
 * - Unicode tag characters (U+E0000-U+E007F, "ASCII smuggling").
 * Whitespace is flattened to single spaces and the text is capped in code points
 * (never splitting a surrogate pair or an entity, never ending on a joiner).
 *
 * Two outputs, because they are read in different places:
 * - cleanOwnerText: plain text for the persona's fields, which greetings and
 *   handoff lines speak. `<` and `>` are dropped and `&` stays `&`, so TTS never
 *   reads "Tom &amp; Jerry".
 * - sanitizeOwnerText: the same text with `&`, `<` and `>` escaped, for inside the
 *   prompt's <character_profile> block, where markup would close the block.
 *
 * @module services/custom-agent/custom-agent-owner-text
 */

/** Characters no owner-written string keeps. The `u` flag makes the property and astral ranges work. */
export const UNSAFE_OWNER_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{E0000}-\u{E007F}]/gu;

/**
 * A zero-width joiner inside an emoji sequence: after an emoji (with any skin-tone
 * modifiers or variation selectors) and right before another emoji.
 */
const EMOJI_JOINER_SOURCE =
  '(?<=\\p{Extended_Pictographic}(?:[\\u{1F3FB}-\\u{1F3FF}]|\\u{FE0E}|\\u{FE0F})*)\\u200D(?=\\p{Extended_Pictographic})';
const EMOJI_JOINER_AT = new RegExp(EMOJI_JOINER_SOURCE, 'uy');
const EMOJI_JOINERS = new RegExp(EMOJI_JOINER_SOURCE, 'gu');

const UNSAFE_OR_MARKUP = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{E0000}-\u{E007F}<>]/u;

function isEmojiJoinerAt(whole: string, offset: number): boolean {
  EMOJI_JOINER_AT.lastIndex = offset;
  return EMOJI_JOINER_AT.test(whole);
}

/** Unsafe characters gone (an emoji's own joiners kept), whitespace flattened, one line. */
function stripAndFlatten(text: string): string {
  return text
    .replace(UNSAFE_OWNER_CHARS, (ch: string, offset: number, whole: string) =>
      ch === '\u{200D}' && isEmojiJoinerAt(whole, offset) ? ch : ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** At most `max` code points, with no joiner left dangling at the end. */
function capCodePoints(text: string, max: number): string {
  return Array.from(text)
    .slice(0, max)
    .join('')
    .replace(/\u{200D}+$/u, '');
}

/** Owner-written text as plain words: unsafe characters and `<` `>` gone, one line, at most `max` code points. */
export function cleanOwnerText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  return capCodePoints(stripAndFlatten(text.replace(/[<>]/g, ' ')), max).trim();
}

/** Owner-written text made inert for the profile block: unsafe characters gone, one line, escaped, at most `max` code points. */
export function sanitizeOwnerText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  const escaped = stripAndFlatten(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // The cap counts the escaped text, and never leaves half an entity at the end
  return capCodePoints(escaped, max)
    .replace(/&[a-z]{0,3}$/, '')
    .trim();
}

/** True when `text` could have come out of cleanOwnerText or sanitizeOwnerText: no unsafe character, no markup, one line. */
export function isSanitizedOwnerText(text: string): boolean {
  return (
    !UNSAFE_OR_MARKUP.test(text.replace(EMOJI_JOINERS, '')) &&
    !/[\r\n\t]/.test(text) &&
    text === text.trim()
  );
}

function ownerList(
  items: unknown,
  each: number,
  count: number,
  one: (text: unknown, max: number) => string
): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => one(item, each))
    .filter(Boolean)
    .slice(0, count);
}

/** Each item cleaned to plain text (cleanOwnerText), empties dropped, at most `count` of them. */
export function cleanOwnerList(items: unknown, each: number, count: number): string[] {
  return ownerList(items, each, count, cleanOwnerText);
}

/** Each item sanitized for the profile block, empties dropped, at most `count` of them. */
export function sanitizeOwnerList(items: unknown, each: number, count: number): string[] {
  return ownerList(items, each, count, sanitizeOwnerText);
}
