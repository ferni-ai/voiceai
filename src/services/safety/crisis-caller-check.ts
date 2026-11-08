/**
 * The caller check: a worry about someone else, said beside the caller's own ending words set
 * aside (negated, recovered or hyperbole: "my son said he wants to die. not me, i'd never kill
 * myself"), in a distressed voice.
 *
 * The voice never decides who is at risk. The subject stays the other person's, and the reply is
 * replaced as main replaced it on these voices, now with main's fixed help for them (988 on their
 * behalf, 911 in danger), or 911 for them when they are down and not getting up, then the caller's
 * own 988 line in the in-danger reply's words (withCallerCheck). Before this, the voice made the
 * subject the caller's and the turn took the caller's own 988 script instead of the help for the
 * other person. The reply is fixed text: no model call, so it never rests on the model complying.
 *
 * @module CrisisCallerCheck
 */

import { TALK_TO_988 } from './crisis-guard-replies.js';
import {
  HIGH_DISTRESS_VOICE_EMOTIONS,
  MODERATE_DISTRESS_VOICE_EMOTIONS,
} from './crisis-severity.js';

/** Marks a third-party read whose replaced reply adds the caller's own 988 line. */
export const CALLER_CHECK = 'caller_check';

const DISTRESSED: readonly string[] = [
  ...HIGH_DISTRESS_VOICE_EMOTIONS,
  ...MODERATE_DISTRESS_VOICE_EMOTIONS,
];

/**
 * Whether a read gets the caller check: its text subject is someone else, the caller's own ending
 * words in it were set aside, and the voice is confidently distressed.
 */
export function callerCheckApplies(
  read: { subject?: string; softSelf: boolean },
  voice: { primary: string; confidence?: number } | undefined
): boolean {
  if (read.subject !== 'third_party' || !read.softSelf) return false;
  const voiced = voice?.confidence !== undefined && voice.confidence > 0.5;
  return voiced && DISTRESSED.includes(voice.primary);
}

/** A replaced reply with the caller check after it: the reply first, then the caller's 988 line. */
export const withCallerCheck = (reply: string): string => `${reply}\n\n${TALK_TO_988}`;
