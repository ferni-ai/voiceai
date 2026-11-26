/**
 * One sanitizer for every string a custom agent's owner wrote, wherever it goes
 * on a live call: the prompt's profile block (custom-agent-live-prompt.ts), the
 * session persona (custom-agent-live-persona.ts) and the text chat's prompt
 * (api/custom-agent/chat-routes.ts).
 *
 * It removes what a reader can't see or a prompt shouldn't carry, so no
 * consumer ever gets the owner's raw text:
 * - C0 and C1 controls (U+0000-U+001F, U+007F-U+009F, NEL U+0085 included) and
 *   line and paragraph separators (U+2028, U+2029) become a space;
 * - format characters (zero-width, bidi overrides and isolates, soft hyphen, word
 *   joiner, BOM) and Unicode tag characters (U+E0000-U+E007F, "ASCII smuggling")
 *   are removed without a trace, so "Jo" + ZWSP + "hn" stays "John".
 * Three joiners are part of how a name is spelled, not hidden text, and are kept:
 * - a zero-width joiner (U+200D) between two emoji (woman, skin tone, ZWJ, rocket);
 * - a zero-width joiner or non-joiner right after an Indic virama (Malayalam chillu
 *   letters, Hindi half forms);
 * - a zero-width non-joiner (U+200C) between two Arabic-script letters (Persian).
 * Whitespace is flattened to single spaces and the text is capped in code points
 * (never splitting a surrogate pair or an entity, never leaving a loose joiner).
 *
 * `&` is never escaped: only a `<` or `>` can close the profile block, and an
 * escaped `&` reaches the voice as "amp". So there are two outputs:
 * - cleanOwnerText: plain text for anything spoken or read outside the profile
 *   block. Angle brackets and their look-alikes become a space.
 * - sanitizeOwnerText: for inside the <character_profile> block. Angle brackets
 *   and their look-alikes become `&lt;` and `&gt;`.
 *
 * @module services/custom-agent/custom-agent-owner-text
 */

/** Characters no owner-written string keeps, except the joiners above. The `u` flag makes the property and astral ranges work. */
export const UNSAFE_OWNER_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{E0000}-\u{E007F}]/gu;

/** Format and tag characters, which are removed without leaving a space. */
const INVISIBLE = /[\p{Cf}\u{E0000}-\u{E007F}]/u;

/** `<` and `>` and the characters a model may read as them (fullwidth, small, angle brackets). */
const OPENERS = '<\u{FF1C}\u{FE64}\u{2329}\u{3008}';
const CLOSERS = '>\u{FF1E}\u{FE65}\u{232A}\u{3009}';
const ANGLE = new RegExp(`[${OPENERS}${CLOSERS}]`, 'gu');

/** Viramas of Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala. */
const VIRAMA = '[\u{094D}\u{09CD}\u{0A4D}\u{0ACD}\u{0B4D}\u{0BCD}\u{0C4D}\u{0CCD}\u{0D4D}\u{0DCA}]';
const KEPT_JOINER_SOURCE = [
  // An emoji (with skin tones or variation selectors) + ZWJ + another emoji
  '(?<=\\p{Extended_Pictographic}(?:[\\u{1F3FB}-\\u{1F3FF}]|\\u{FE0E}|\\u{FE0F})*)\\u{200D}(?=\\p{Extended_Pictographic})',
  // A virama + ZWJ or ZWNJ
  `(?<=${VIRAMA})[\\u{200C}\\u{200D}]`,
  // An Arabic-script letter + ZWNJ + another
  '(?<=\\p{Script=Arabic})(?<=\\p{L})\\u{200C}(?=\\p{Script=Arabic})(?=\\p{L})',
].join('|');
const KEPT_JOINER_AT = new RegExp(`(?:${KEPT_JOINER_SOURCE})`, 'uy');
const KEPT_JOINERS = new RegExp(`(?:${KEPT_JOINER_SOURCE})`, 'gu');
const JOINERS = /[\u{200C}\u{200D}]/gu;

const UNSAFE_OR_MARKUP = new RegExp(
  `[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}\\u{E0000}-\\u{E007F}${OPENERS}${CLOSERS}]`,
  'u'
);

function isKeptJoinerAt(whole: string, offset: number): boolean {
  KEPT_JOINER_AT.lastIndex = offset;
  return KEPT_JOINER_AT.test(whole);
}

/** Unsafe characters gone (the joiners a name is spelled with kept), whitespace flattened, one line. */
function stripAndFlatten(text: string): string {
  return text
    .replace(UNSAFE_OWNER_CHARS, (ch: string, offset: number, whole: string) => {
      if (isKeptJoinerAt(whole, offset)) return ch;
      return INVISIBLE.test(ch) ? '' : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Joiners whose neighbours a cap cut away are dropped. */
function dropLooseJoiners(text: string): string {
  return text.replace(JOINERS, (ch: string, offset: number, whole: string) =>
    isKeptJoinerAt(whole, offset) ? ch : ''
  );
}

/** Owner-written text as plain words: unsafe characters and angle brackets gone, one line, at most `max` code points. */
export function cleanOwnerText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  const plain = stripAndFlatten(text.replace(ANGLE, ' '));
  return dropLooseJoiners(Array.from(plain).slice(0, max).join('')).trim();
}

/**
 * Owner-written text made inert for the profile block: unsafe characters gone, one
 * line, angle brackets as `&lt;` `&gt;`, at most `max` code points of what is stored.
 */
export function sanitizeOwnerText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  let out = '';
  let used = 0;
  for (const ch of stripAndFlatten(text)) {
    const piece = OPENERS.includes(ch) ? '&lt;' : CLOSERS.includes(ch) ? '&gt;' : ch;
    const cost = piece === ch ? 1 : piece.length;
    // The cap counts what is stored, and never leaves half an entity at the end
    if (used + cost > max) break;
    out += piece;
    used += cost;
  }
  return dropLooseJoiners(out).trim();
}

/** True when `text` could have come out of cleanOwnerText or sanitizeOwnerText: no unsafe character, no markup, one line. */
export function isSanitizedOwnerText(text: string): boolean {
  return (
    !UNSAFE_OR_MARKUP.test(text.replace(KEPT_JOINERS, '')) &&
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
