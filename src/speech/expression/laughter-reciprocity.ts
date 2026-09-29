/**
 * Laughing with the caller.
 *
 * Shared laughter is one of the strongest bonding signals in conversation,
 * and a laugh that goes unanswered reads as cold. When the caller has just
 * laughed, the next reply gets a one-line cue: laugh along when the voice
 * can render it and the laugh invited it, otherwise let the words smile.
 * A cooldown keeps it from becoming a tic.
 *
 * @module speech/expression/laughter-reciprocity
 */

import type { UserLaugh, VoiceCapabilities } from './types.js';

/** A laugh older than this belongs to an earlier moment. */
const FRESH_MS = 12_000;
/** Minimum gap between laugh-along cues. */
const COOLDOWN_MS = 45_000;
const MIN_CONFIDENCE = 0.6;

export const LAUGH_ALONG_CUE =
  'They just laughed. If it is funny to you too, laugh with them once by starting your reply with [laughter], then carry on naturally.';
export const SMILE_ALONG_CUE =
  'They just laughed. Let your reply smile with them: light and warm, no need to explain the joke.';

/** The last cue given: which laugh it answered and when. */
export interface LaughCueRecord {
  readonly laughAt: number;
  readonly at: number;
}

export interface LaughCueInput {
  laugh: UserLaugh | undefined;
  lastCue: LaughCueRecord | undefined;
  voice: VoiceCapabilities;
  now: number;
}

/**
 * The cue for this reply, or null when the moment has passed or it would
 * repeat. The same laugh always gets the same answer, so a preemptive
 * generation and the final one agree.
 */
export function laughCue({ laugh, lastCue, voice, now }: LaughCueInput): string | null {
  if (!laugh || laugh.suggestedResponse === 'none') return null;
  if (laugh.confidence < MIN_CONFIDENCE) return null;
  if (now - laugh.at > FRESH_MS) return null;
  const answered = lastCue?.laughAt === laugh.at;
  if (!answered && lastCue && now - lastCue.at < COOLDOWN_MS) return null;
  const join = laugh.suggestedResponse === 'join_in' && voice.laughter;
  return join ? LAUGH_ALONG_CUE : SMILE_ALONG_CUE;
}
