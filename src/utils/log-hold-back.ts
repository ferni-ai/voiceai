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
 * would write it out unredacted. Only the last HOLD_LIMIT chars are searched, so each write
 * stays cheap. When they hold no clean place to cut (a line dense with digits), nothing of
 * the line is written: it is held whole, up to HOLD_HARD chars, until its newline or the
 * timer in redactWrites (HOLD_MS). Past HOLD_HARD the cut is forced, and it fails closed:
 * every digit from the number run before the cut to the end of that line is masked, since
 * a number after the cut may need context from before it. A forced cut still never splits
 * a registered value, and digits inside one are left for it to be replaced whole.
 *
 * @module utils/log-hold-back
 */

import { cutOutsideLogValues, maskDigitsOutsideLogValues } from './redacted-log-values.js';

/** A line longer than this with no newline yet is written out, keeping only its end. */
const HOLD_MAX = 512;
/** How much is kept back: more than a phone number and the words before it. */
const HOLD_TAIL = 64;
/** How far back from the end a clean place to cut is looked for. */
const HOLD_LIMIT = 4096;
/** The longest line held whole when no clean place to cut is found; past it the cut is forced. */
const HOLD_HARD = 65536;
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

/** `cut` moved back once past whatever it would split; unchanged when it splits nothing. */
function moveBack(text: string, cut: number, floor: number): number {
  const after = text.slice(cut, cut + HOLD_TAIL).search(DIGIT);
  const digit = after >= 0 ? cut + after : numberJustBefore(text, cut, floor);
  const moved = digit >= 0 ? Math.max(floor, runStart(text, digit, floor) - HOLD_TAIL) : cut;
  return cutOutsideLogValues(text, wordStart(text, moved, floor)); // last: never splits a value
}

interface Cut {
  cut: number;
  /** No clean place within reach, and the line is too long to hold: it is cut anyway. */
  forced: boolean;
  /** No clean place within reach, so the line is held whole. */
  stuck?: boolean;
}

/** Where to cut `text`. */
function findCut(text: string): Cut {
  if (text.endsWith('\n')) return { cut: text.length, forced: false };
  const lineStart = text.lastIndexOf('\n') + 1;
  const lineLength = text.length - lineStart;
  if (lineLength <= HOLD_MAX) return { cut: lineStart, forced: false };
  const floor = Math.max(lineStart, text.length - HOLD_LIMIT);
  for (let cut = text.length - HOLD_TAIL; cut > floor;) {
    const next = moveBack(text, cut, floor);
    if (next === cut) return { cut, forced: false };
    cut = next;
  }
  if (lineLength <= HOLD_HARD) return { cut: lineStart, forced: false, stuck: true }; // fail closed
  const cut = cutOutsideLogValues(text, floor);
  return cut > lineStart ? { cut, forced: true } : { cut: lineStart, forced: false };
}

/** Splits one writer's text into what to redact and write now and what to hold back. */
export interface HoldBack {
  /** True while a force-cut line is unfinished: its digits are masked until its newline. */
  readonly masking: boolean;
  /** Everything not yet written (the held text, then the new write), split at the cut. */
  split(held: string, added: string): { now: string; held: string };
  /** Held text the timer writes out early, masked if its line was force-cut. */
  release(held: string): string;
}

export function createHoldBack(): HoldBack {
  let masking = false;
  /**
   * After a search found no clean place to cut, the held line is not searched again until it
   * is this long (another HOLD_LIMIT chars) or a newline comes. Holding is always safe, and
   * the skip keeps small writes from paying for a search, or a copy of the held text, each.
   */
  let searchAt = 0;
  /** `part` with the digits up to its first newline masked if a forced cut is on that line. */
  const maskRestOfLine = (part: string): string => {
    if (!masking) return part;
    const newline = part.indexOf('\n');
    if (newline >= 0) masking = false;
    return maskDigitsOutsideLogValues(part, 0, newline >= 0 ? newline : part.length);
  };
  return {
    get masking() {
      return masking;
    },
    split(held, added) {
      if (held.length + added.length < searchAt && !added.includes('\n')) {
        return { now: '', held: held + added };
      }
      const text = held + added;
      const { cut, forced, stuck } = findCut(text);
      searchAt = stuck ? text.length - cut + HOLD_LIMIT : 0;
      let now = maskRestOfLine(text.slice(0, cut));
      if (forced) {
        const lineStart = now.lastIndexOf('\n') + 1;
        const from = runStart(now, Math.max(lineStart, cut - HOLD_TAIL), lineStart);
        now = maskDigitsOutsideLogValues(now, from, now.length);
        masking = true;
      }
      return { now, held: text.slice(cut) };
    },
    release(held) {
      searchAt = 0;
      return maskRestOfLine(held);
    },
  };
}
