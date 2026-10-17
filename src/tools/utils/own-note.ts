/**
 * Save tools refuse Ferni's own context notes (MID_CALL_NOTE_FRAME, off by default).
 *
 * A system note added mid-call (memory recall, turn context, tool announcements)
 * reaches Gemini as user-role text: @livekit/agents wraps it as "New instructions
 * received. Apply them carefully: <note>" and merges it into the caller's turn.
 * On dev a caller said "put that in my journal" and the model saved a recall note
 * as their words. With the flag on, our patch to the SDK's google formatter
 * (patches/@livekit__agents@1.6.4.patch) frames those notes as private instead,
 * and the tools that save a caller's words refuse text that carries either
 * opening, in case the model copies one anyway.
 *
 * @module tools/utils/own-note
 */

import { flagOn } from '../../config/env-flag.js';

/**
 * How a mid-call note opens with the flag on. The patched provider_format/google.js
 * holds the same text; mid-call-note-frame.test.ts fails if the two drift.
 */
export const MID_CALL_NOTE_FRAME_OPENING =
  '[Private note to you from your own memory and context, not words the caller said.';

/** Phrases that only our own notes contain: the frame above and the SDK's stock opening. */
const OWN_NOTE_MARKERS = [
  'private note to you from your own memory',
  'not words the caller said',
  'new instructions received',
];

/** What a save tool returns instead of saving one of our notes. */
export const OWN_NOTE_REFUSAL =
  "Not saved: that text was your own private note, not something they said. Tell them: that was my own note, not yours, so I didn't save it. Then ask what they want to keep.";

/** True when the text carries the opening of one of our own mid-call notes. */
export function isOwnContextNote(text: string): boolean {
  const lower = text.toLowerCase();
  return OWN_NOTE_MARKERS.some((marker) => lower.includes(marker));
}

/** True when a save tool should refuse this text: the flag is on and it is one of our notes. */
export function refuseOwnNote(text: string): boolean {
  return flagOn('MID_CALL_NOTE_FRAME') && isOwnContextNote(text);
}
