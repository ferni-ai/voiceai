/**
 * Whether a spoken phrase names a webhook's voice trigger. Whole words only,
 * never a fragment of a word ("gar" is not "garage"): an empty phrase used to
 * match the first enabled webhook, since every string includes "" (issue #3992).
 *
 * - The whole trigger said, alone or inside a sentence, matches at any length
 *   ("tv", "turn on the tv"): the validator allows two-letter triggers.
 * - A phrase that names only part of a trigger ("garage" for "open garage")
 *   must be at least three letters, so "on" doesn't pick "lights on".
 * - Scripts written without spaces (Chinese, Japanese, Thai, Lao, Khmer, Burmese) have no word
 *   edges to find, so there the whole trigger anywhere in the phrase matches.
 *
 * @module services/webhooks/webhook-trigger-match
 */

/** Fewer letters than this names part of a trigger only by accident. */
const MIN_PART_CHARS = 3;

/** Scripts written without spaces between words. */
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** Lower case, words separated by single spaces, punctuation dropped (marks kept: Devanagari). */
const words = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();

/** `needle` appears in `hay` as whole words. */
const holds = (hay: string, needle: string): boolean => ` ${hay} `.includes(` ${needle} `);

const unspaced = (s: string): string => s.replace(/ /g, '');

export function phraseMatchesTrigger(phrase: string, trigger: string): boolean {
  const p = words(phrase);
  const t = words(trigger);
  if (!p || !t) return false;
  if (holds(p, t)) return true; // the whole trigger was said
  if (UNSPACED.test(t) && unspaced(p).includes(unspaced(t))) return true;
  return p.length >= MIN_PART_CHARS && holds(t, p);
}
