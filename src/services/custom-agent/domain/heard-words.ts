/**
 * How a spoken reading is heard: a speech-to-text transcript as plain words, and
 * how close a heard word or name has to be to the one that was meant. Pure rules
 * for the consent check (voice-consent.ts).
 *
 * @module services/custom-agent/domain/heard-words
 */

import { editDistance } from '../../../utils/call-me-vocative.js';

/** Lowercase whole words and numbers, possessive "'s" dropped. */
export function consentWords(text: string): string[] {
  // Speech to text often writes curly apostrophes ("don’t"); read them as plain ones
  const plain = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'");
  return (plain.match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}]+)?/gu) ?? []).map((w) =>
    w.replace(/'s$/, '')
  );
}

/** Hesitations speech to text writes down; they change nothing that was said. */
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'ah', 'hmm', 'mm']);

/** Words a spoken date can be made of ("the first of November, twenty twenty six"). */
const DATE_WORDS = new Set(
  (
    'january february march april may june july august september october november december ' +
    'the of and st nd rd th first second third fourth fifth sixth seventh eighth ninth tenth ' +
    'eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth ' +
    'nineteenth twentieth thirtieth one two three four five six seven eight nine ten eleven ' +
    'twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty ' +
    'hundred thousand monday tuesday wednesday thursday friday saturday sunday'
  ).split(' ')
);
export const MAX_DATE_WORDS = 10;

/** A word that can be part of a spoken or written date: a date word, a number, or "1st". */
export const isDateWord = (word: string, extra: ReadonlySet<string>) =>
  DATE_WORDS.has(word) || extra.has(word) || /^\d+(?:st|nd|rd|th)?$/.test(word);

/** "Uh-uh", "mm-mm" and "hmm-mm" mean no; speech to text writes them as two fillers. */
const SPOKEN_NO = new Set(['uh', 'mm', 'hmm']);

/**
 * The transcript as words, fillers out, "a i" and "anytime" read the way the statement
 * writes them. A doubled "uh" or "mm" stays in as "no", so it can never pass.
 */
export function heardWords(transcript: string): string[] {
  const all = consentWords(transcript);
  const words = all.filter((w, i) => {
    const doubled = SPOKEN_NO.has(w) && (SPOKEN_NO.has(all[i - 1]) || SPOKEN_NO.has(all[i + 1]));
    return doubled || !FILLERS.has(w);
  });
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    // Only "a i copy", so a name ending in "A." before "I agree" stays as said
    if (words[i] === 'a' && words[i + 1] === 'i' && words[i + 2] === 'copy') {
      out.push('ai');
      i++;
    } else if (words[i] === 'anytime') out.push('any', 'time');
    else out.push(words[i]);
  }
  return out;
}

/** A word with its apostrophes dropped, so "OBrien" is "O'Brien". */
const bare = (words: string[]) => words.join('').replace(/'/g, '');

/**
 * How many heard words make up the name at `at`, or 0 when it isn't there. A name must
 * be heard exactly, apart from case and apostrophes, or joined or split ("Minji" for
 * "Min-ji") with the same letters. No near miss is allowed: in some language a name
 * one letter off is a word for no ("Nahid" and "nahi"), and no list of those is ever
 * complete. A misheard name fails closed, and the person reads it again.
 */
export function nameHeardAs(heard: string[], at: number, name: string[]): number {
  for (const k of [name.length, name.length - 1, name.length + 1]) {
    if (k >= 1 && at + k <= heard.length && bare(heard.slice(at, at + k)) === bare(name)) return k;
  }
  return 0;
}

/** A statement word heard as written; long words may be off by one letter ("agreed"). */
export const wordHeard = (said: string, word: string) =>
  said === word || (word.length >= 5 && editDistance(said, word) <= 1);
