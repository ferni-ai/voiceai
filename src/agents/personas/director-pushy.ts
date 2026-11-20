/**
 * Pushy director notes: ones that tell Ferni to press the caller on a pause, a
 * question they skipped, or an odd word. A friend lets it go, so parseNotes
 * (director-notes.ts) drops them.
 *
 * DIRECTOR_PUSHY_WIDE=on also drops "don't let it slide" and "point it out".
 * Prod 2026-10-22 (#2438): "it's going pretty good for him" was most likely a
 * speech-to-text slip; the note "He referred to himself as 'him' in the third
 * person. Don't let it slide." reached Ferni, who said "rolling along nicely for
 * him", and the caller asked "For who?". "Let it go" on its own is the advice
 * we want and stays; so does "point out what went well".
 *
 * @module agents/personas/director-pushy
 */

import { flagOn } from '../../config/env-flag.js';

type Env = Record<string, string | undefined>;

/** Always dropped: pushing on a pause or a question they skipped. */
const PUSHY =
  /call (that|it) out|ask (it |that )?again|repeat (the|your) question|didn'?t (respond|answer)|still there|check (if|that) (they|he|she)/i;

/** DIRECTOR_PUSHY_WIDE=on: don't let it slide / go / pass, and point it out. Whole words only. */
const PUSHY_WIDE =
  /\b(?:don['’]?t|do not) let (?:it|that|this)(?: one)? (?:slide|go|pass)\b|\bpoint (?:it|that|this) out\b/i;

/** True when a note pushes Ferni to press the caller; parseNotes drops it. */
export function pushyNote(note: string, env: Env = process.env): boolean {
  return PUSHY.test(note) || (flagOn('DIRECTOR_PUSHY_WIDE', env) && PUSHY_WIDE.test(note));
}
