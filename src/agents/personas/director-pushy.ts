/**
 * Pushy director notes: ones that tell Ferni to press the caller on a pause, a
 * question they skipped, or an odd word. A friend lets it go, so parseNotes
 * (director-notes.ts) drops them.
 *
 * DIRECTOR_PUSHY_WIDE=on also drops "don't let it slide" and "point it out" when
 * the note is about how the caller worded something. Prod 2026-10-22 (#2438):
 * "it's going pretty good for him" was most likely a speech-to-text slip; the
 * note "He referred to himself as 'him' in the third person. Don't let it
 * slide." reached Ferni, who said "rolling along nicely for him", and the caller
 * asked "For who?". The idiom alone is not enough: "don't let that slide; ask
 * if he's safe" and "don't let it pass without celebrating" are notes we want
 * (PR #4276 verify), so a note on safety, wellbeing or praise always stays.
 *
 * @module agents/personas/director-pushy
 */

import { flagOn } from '../../config/env-flag.js';
import { isSafetyTopic } from './phrase-loops.js';

type Env = Record<string, string | undefined>;

/** Always dropped: pushing on a pause or a question they skipped. */
const PUSHY =
  /call (that|it) out|ask (it |that )?again|repeat (the|your) question|didn'?t (respond|answer)|still there|check (if|that) (they|he|she)/i;

/** DIRECTOR_PUSHY_WIDE=on: don't let it slide / go / pass, and point it out. Whole words only. */
const PUSHY_WIDE =
  /\b(?:don['’]?t|do not) let (?:it|that|this)(?: one)? (?:slide|go|pass)\b|\bpoint (?:it|that|this) out\b/i;

/** The note is about how the caller worded something, not what they meant. */
const WORDING =
  /\b(?:said|says|saying|words?|wording|phrase|phrasing|refer(?:s|red)? to|call(?:s|ed|ing)? (?:him|her|them)sel(?:f|ves)|third person|pronouns?|grammar|misspo(?:ke|ken)|mispronounc\w*|misheard|name wrong|wrong name)\b/i;

/** Wellbeing and praise that isSafetyTopic (phrase-loops.ts) doesn't cover. */
const CARE =
  /\b(?:disappear\w*|not wanting to be here|bruis\w*|drink\w*|sleep\w*|eat(?:s|ing)?|ask how|check in|celebrat\w*|proud|did well|kind(?:ly|ness)?)\b/i;

/** True when a note pushes Ferni to press the caller; parseNotes drops it. */
export function pushyNote(note: string, env: Env = process.env): boolean {
  if (PUSHY.test(note)) return true;
  if (!flagOn('DIRECTOR_PUSHY_WIDE', env)) return false;
  return PUSHY_WIDE.test(note) && WORDING.test(note) && !isSafetyTopic(note) && !CARE.test(note);
}
