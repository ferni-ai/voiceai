/**
 * Where to cut a log write that ends without a newline (log-redaction.ts redactWrites).
 * The part before the cut is redacted and written now; the rest waits for the next write.
 *
 * A short unfinished line is held whole. A long one (over HOLD_MAX) is written out except
 * its last HOLD_TAIL chars, and the cut moves back, never forward, until it splits neither
 * of these:
 * - a phone number, or the words that say it is one ("sip_", "phone:", a JSON key), since
 *   the phone pass needs them: HOLD_TAIL chars before any digit run near the cut stay held;
 * - a registered value, such as a consented clone's voice id (redacted-log-values.ts).
 *
 * Each side is redacted on its own and half a value matches nothing, so a cut through one
 * would write it out unredacted. A line dense with digits can be held whole; the timer in
 * redactWrites still writes it out within HOLD_MS.
 *
 * @module utils/log-hold-back
 */

import { cutOutsideLogValues } from './redacted-log-values.js';

/** A line longer than this with no newline yet is written out, keeping only its end. */
const HOLD_MAX = 512;
/** How much is kept back: more than a phone number and the words before it. */
const HOLD_TAIL = 64;
/** What a phone number can be written with. */
const RUN_CHARS = new Set('0123456789+%(). \t-');
const DIGIT = /\d/;

/** Where the run of phone characters that holds position `at` starts. */
function runStart(text: string, at: number, lineStart: number): number {
  let start = at;
  while (start > lineStart && RUN_CHARS.has(text[start - 1] ?? '')) start--;
  return start;
}

/** Where the part of `text` to hold back for the next write starts. */
export function holdFrom(text: string): number {
  if (text.endsWith('\n')) return text.length;
  const lineStart = text.lastIndexOf('\n') + 1;
  if (text.length - lineStart <= HOLD_MAX) return lineStart;
  let cut = text.length - HOLD_TAIL;
  for (let before = -1; cut !== before;) {
    before = cut;
    const digit = text.slice(cut, cut + HOLD_TAIL).search(DIGIT);
    if (digit >= 0) cut = runStart(text, cut + digit, lineStart) - HOLD_TAIL;
    cut = cutOutsideLogValues(text, Math.max(lineStart, cut));
  }
  return cut;
}
