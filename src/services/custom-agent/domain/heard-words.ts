/**
 * How a spoken reading is heard: a speech-to-text transcript as plain words, and
 * how close a heard word or name has to be to the one that was meant. Pure rules
 * for the consent check (voice-consent.ts).
 *
 * @module services/custom-agent/domain/heard-words
 */

import { editDistance } from '../../../utils/call-me-vocative.js';

/** Lowercase whole words, numbers dropped (dates come back from speech to text in many forms). */
export function consentWords(text: string): string[] {
  // Speech to text often writes curly apostrophes ("don’t"); read them as plain ones
  const plain = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'");
  return (plain.match(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)?/gu) ?? []).map((w) => w.replace(/'s$/, ''));
}

/** Hesitations speech to text writes down; they change nothing that was said. */
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'ah', 'hmm', 'mm']);

/** Words a spoken date can be made of ("the first of November, twenty twenty six"). */
export const DATE_WORDS = new Set(
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

/** The transcript as words, fillers out, "a i" and "anytime" read the way the statement writes them. */
export function heardWords(transcript: string): string[] {
  const words = consentWords(transcript).filter((w) => !FILLERS.has(w));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'a' && words[i + 1] === 'i') {
      out.push('ai');
      i++;
    } else if (words[i] === 'anytime') out.push('any', 'time');
    else out.push(words[i]);
  }
  return out;
}

/**
 * How many heard words make up the name at `at`, or 0 when it isn't there. Speech to
 * text gets names wrong most: a few letters off ("Rosa Quil"), or joined or split
 * ("Minji" for "Min-ji"), so the name may be heard as one word more or fewer.
 */
export function nameHeardAs(heard: string[], at: number, name: string[]): number {
  const target = name.join('');
  // Two letters at most, so a relative's name ("Maya Quill" for "Rosa Quill") is not close
  const close = Math.min(2, Math.max(1, Math.floor(Array.from(target).length / 4)));
  let best = 0;
  let bestDistance = Infinity;
  for (const k of [name.length, name.length - 1, name.length + 1]) {
    if (k < 1 || at + k > heard.length) continue;
    const distance = editDistance(heard.slice(at, at + k).join(''), target);
    // The closest reading wins, so "Rosaquill" doesn't swallow the "I" after it
    if (distance <= close && distance < bestDistance) [best, bestDistance] = [k, distance];
  }
  return best;
}

/** A statement word heard as written; long words may be off by one letter ("agreed"). */
export const wordHeard = (said: string, word: string) =>
  said === word || (word.length >= 5 && editDistance(said, word) <= 1);
