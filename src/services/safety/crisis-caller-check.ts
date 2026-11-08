/**
 * The caller check: a worry about someone else, said beside the caller's own ending words set
 * aside (negated, recovered or hyperbole: "my son said he wants to die. not me, i'd never kill
 * myself"), in a distressed voice.
 *
 * The voice never decides who is at risk. The subject stays the other person's, so the caller
 * keeps the help for them (how to check on them, 988 on their behalf, 911 in danger), and the
 * guidance adds one gentle check on the caller. Before this, the voice made the subject the
 * caller's and the turn took the caller's own 988 script instead of the help for the other person.
 *
 * One decision, two renderers: detectCrisis (crisis-guard.ts) marks the read with CALLER_CHECK;
 * buildCrisisGuidance adds the check as the guidance's last line, and a turn whose reply is
 * replaced (someone else down and not getting up: EMERGENCY_FOR_THEM, 911 for them first) gets
 * the caller's 988 line after it, in the in-danger reply's own words (withCallerCheck). Voice may
 * still raise the severity through the guard's amplifier, never lower it.
 *
 * @module CrisisCallerCheck
 */

import { TALK_TO_988 } from './crisis-guard-replies.js';
import {
  HIGH_DISTRESS_VOICE_EMOTIONS,
  MODERATE_DISTRESS_VOICE_EMOTIONS,
} from './crisis-severity.js';

/** Marks a third-party read whose guidance adds a gentle check on the caller. */
export const CALLER_CHECK = 'caller_check';

/** The check, as the last line of the third-party guidance. */
export const CALLER_CHECK_GUIDANCE =
  'They also spoke about themselves only to say they are not at risk, and their voice sounds distressed. Once, gently, ask how they are doing themselves, apart from the person they are worried about. If they say they are struggling too, take it seriously and offer the 988 Suicide & Crisis Lifeline for themselves';

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
