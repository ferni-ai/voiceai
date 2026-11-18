/**
 * Where to cut a log write that ends without a newline (log-redaction.ts redactWrites).
 * The part before the cut is redacted and written now; the rest waits for the next write.
 *
 * A short unfinished line is held whole. A long one (over HOLD_MAX) is written out except
 * its last HOLD_TAIL chars, and the cut moves back, never forward, until it splits neither
 * of these:
 * - a phone number, or the words that say it is one ("sip_", "phone:", a JSON key), since
 *   the phone pass needs them: HOLD_TAIL chars before any digit run near the cut stay held;
 * - a list of numbers: the phone pass carries one number's context to the next across up
 *   to MAX_GAP chars of list punctuation, so a number that ends that close before the cut
 *   counts as near it too;
 * - a registered value, such as a consented clone's voice id (redacted-log-values.ts);
 * - a word, since whether a value matches depends on the letters beside it.
 *
 * Each side is redacted on its own and half a value matches nothing, so a cut through one
 * would write it out unredacted. At most HOLD_LIMIT chars are kept back, so each write costs
 * at most a walk that long: on a line dense with digits the cut may then go through a number
 * (there is no clean place to cut), but never through a registered value. The timer in
 * redactWrites writes what is held out within HOLD_MS.
 *
 * @module utils/log-hold-back
 */

import { cutOutsideLogValues } from './redacted-log-values.js';

/** A line longer than this with no newline yet is written out, keeping only its end. */
const HOLD_MAX = 512;
/** How much is kept back: more than a phone number and the words before it. */
const HOLD_TAIL = 64;
/** The most that is kept back, however dense with digits the line is. */
const HOLD_LIMIT = 4096;
/** What a phone number can be written with. */
const RUN_CHARS = new Set('0123456789+%(). \t-');
/** What may lie between two numbers of one list (log-redaction.ts `continues`), and how much. */
const LIST_GAP = new Set(' \t"\'\\0123456789.-+,;[]');
const MAX_GAP = 64;
const DIGIT = /\d/;
const WORD_CHAR = /[A-Za-z0-9]/;

/** Where the run of phone characters that holds position `at` starts. */
function runStart(text: string, at: number, floor: number): number {
  let start = at;
  while (start > floor && RUN_CHARS.has(text[start - 1] ?? '')) start--;
  return start;
}

/** A digit that ends a number within MAX_GAP chars before `cut`, list punctuation between; else -1. */
function numberJustBefore(text: string, cut: number, floor: number): number {
  for (let i = cut - 1; i >= floor && i >= cut - MAX_GAP; i--) {
    const c = text[i] ?? '';
    if (DIGIT.test(c)) return i;
    if (!LIST_GAP.has(c)) return -1;
  }
  return -1;
}

/** `cut`, or the start of the word it falls inside. */
function wordStart(text: string, cut: number, floor: number): number {
  let start = cut;
  while (
    start > floor &&
    WORD_CHAR.test(text[start - 1] ?? '') &&
    WORD_CHAR.test(text[start] ?? '')
  )
    start--;
  return start;
}

/** Where the part of `text` to hold back for the next write starts. */
export function holdFrom(text: string): number {
  if (text.endsWith('\n')) return text.length;
  const lineStart = text.lastIndexOf('\n') + 1;
  if (text.length - lineStart <= HOLD_MAX) return lineStart;
  const floor = Math.max(lineStart, text.length - HOLD_LIMIT);
  let cut = text.length - HOLD_TAIL;
  for (let before = -1; cut !== before && cut > floor;) {
    before = cut;
    const after = text.slice(cut, cut + HOLD_TAIL).search(DIGIT);
    const digit = after >= 0 ? cut + after : numberJustBefore(text, cut, floor);
    if (digit >= 0) cut = Math.max(floor, runStart(text, digit, floor) - HOLD_TAIL);
    cut = cutOutsideLogValues(text, wordStart(text, cut, floor)); // last: never splits a value
  }
  return cut;
}
