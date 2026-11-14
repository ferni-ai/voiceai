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
 * Someone close who went down ("my dad collapsed", withCloseDown) takes the same path: 911 for
 * them first, and the caller check after it when the caller spoke of their own safety in the turn.
 *
 * @module CrisisCallerCheck
 */

import { CALL_911_FOR_THEM, TALK_TO_988 } from './crisis-guard-replies.js';
import {
  HIGH_DISTRESS_VOICE_EMOTIONS,
  MODERATE_DISTRESS_VOICE_EMOTIONS,
  SEVERITY,
} from './crisis-severity.js';
import { someoneCloseWentDown, spokeOfSelf, thirdPartyEmergency } from './crisis-third-person.js';

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

/** A caller's own reply with the 911 for them before it: someone close is down, and so is the caller. */
export const forThemFirst = (reply: string): string => `${CALL_911_FOR_THEM}\n\n${reply}`;

/**
 * Beside someone close going down, what the caller said of their own safety (owner, 2026-11-07):
 * 'check' is the help for them and then the caller's 988 line (withCallerCheck); 'own' is the 911
 * for them and then the caller's own replaced reply (forThemFirst). Unset: the help for them alone.
 */
export type Beside = 'check' | 'own';

interface Read {
  severity: number;
  indicators: string[];
  subject?: 'self' | 'third_party' | 'bereaved';
  softSelf: boolean;
  hardSelf: boolean;
}

/**
 * Someone close went down ("my dad collapsed", #3587), read on top of the words' own read: 911 for
 * them first, always, and the caller's own read kept beside it. A caller read as at risk keeps that
 * subject, even when their words were softened, so nothing that reads the caller (K0) reads them
 * lower; their own replaced reply follows the 911 only when their words stand. Any other read's
 * subject becomes the other person's, as for "fell and can't get up". Runs after the session
 * severity is taken, so a later turn weighs this one as before.
 */
export function withCloseDown<T extends Read>(text: string, read: T): T & { beside?: Beside } {
  if (read.indicators.includes('third_party_emergency')) return read;
  const keepSelf = read.subject === 'self';
  if (!someoneCloseWentDown(text) && !(keepSelf && thirdPartyEmergency(text))) return read;
  const own = read.subject === 'self' || read.softSelf || spokeOfSelf(text);
  const tags = keepSelf
    ? ['third_party_emergency']
    : ['third_party_risk', 'third_party_emergency', 'imminent_danger'];
  const beside: Beside | undefined = !own
    ? undefined
    : keepSelf && read.hardSelf && read.severity >= SEVERITY.block
      ? 'own'
      : 'check';
  return {
    ...read,
    severity: Math.max(read.severity, SEVERITY.explicit),
    indicators: [...read.indicators, ...tags.filter((tag) => !read.indicators.includes(tag))],
    subject: keepSelf ? 'self' : 'third_party',
    beside,
  };
}
