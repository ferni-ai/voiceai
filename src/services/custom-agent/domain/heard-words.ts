/**
 * How a spoken reading is heard: a speech-to-text transcript as plain words, and
 * how close a heard word or name has to be to the one that was meant. Pure rules
 * for the consent check (voice-consent.ts).
 *
 * @module services/custom-agent/domain/heard-words
 */

import { editDistance } from '../../../utils/call-me-vocative.js';

/** Lowercase whole words and numbers, possessive "'s" dropped (also after "O'Neil"). */
export function consentWords(text: string): string[] {
  // Speech to text often writes curly apostrophes ("don’t"); read them as plain ones
  const plain = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'");
  return (plain.match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}]+)*/gu) ?? []).map((w) =>
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

/** The only words besides date words a statement's date may be written with. */
const RELATIVE_DATE: ReadonlySet<string> = new Set(['today']);

/**
 * A date as a statement may write it: one to ten date words, numbers, ordinals or "today",
 * and nothing else, so it can't carry a condition ("until I say stop").
 */
export function isStatementDate(date: string): boolean {
  const words = consentWords(date);
  return (
    words.length >= 1 &&
    words.length <= MAX_DATE_WORDS &&
    words.every((w) => isDateWord(w, RELATIVE_DATE))
  );
}

/** "Uh-uh", "mm-mm" and "hmm-mm" mean no; speech to text writes them as two fillers. */
const SPOKEN_NO = new Set(['uh', 'mm', 'hmm']);

/**
 * Words a consent name may not hold, so "My name is I do not agree" or "for everyone's
 * private use" can't be built: words that say no, words that give or take back consent,
 * and words that name nobody in particular. Apostrophes dropped: "don't" is "dont".
 */
const NOT_A_NAME: ReadonlySet<string> = new Set(
  [
    ...SPOKEN_NO,
    ...'no not never none nobody nothing nor neither nope nah cannot dont cant'.split(' '),
    ..."don't doesn't didn't won't can't isn't aren't wasn't wouldn't shouldn't".split(' '),
    ...'agree agreed agrees disagree consent consents withdraw withdraws withdrawn'.split(' '),
    ...'revoke refuse decline deny'.split(' '),
    ...'everyone anyone someone somebody anybody everybody whoever all people'.split(' '),
    ...'others you me i we us myself yourself'.split(' '),
  ].map((w) => w.replace(/'/g, ''))
);

/** A lone initial ("I." in "I. M. Wu"): a letter, not the word "I". */
const INITIAL = /^\p{L}\.$/u;

/**
 * True when the name holds a word no name may hold, however it is written: on its own
 * ("No"), split ("Some One", "E. Veryone"), hyphenated ("Any-one") or with apostrophes
 * ("Every'one"). Every run of the name's words is joined and checked, since a run is
 * what gets heard when the name is read aloud.
 */
export function holdsNotANameWord(nameWords: readonly string[]): boolean {
  const tokens = nameWords.flatMap((word) =>
    consentWords(word).map((t) => ({ t: t.replace(/'/g, ''), initial: INITIAL.test(word) }))
  );
  for (let i = 0; i < tokens.length; i++) {
    let run = '';
    for (let j = i; j < tokens.length; j++) {
      run += tokens[j].t;
      if (NOT_A_NAME.has(run) && !(j === i && tokens[i].initial)) return true;
    }
  }
  return false;
}

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
