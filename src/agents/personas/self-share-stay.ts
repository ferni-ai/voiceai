/**
 * When an answer about himself may stop there (SELF_SHARE_STAY_WHEN_ASKED=on, #3475).
 *
 * "Leave it there, no question back" fits a turn that is nothing but a plain
 * question about him. Rounds 2 and 3 found the question inside a longer turn
 * and let the rest through a word list; the verifier (2026-11-05) kept
 * finding a rest that was the caller's own news: "What'd you get up to today?
 * Doing it tonight.", "How are you? This is the last night.", "And you?
 * Going to do it tonight." So there is no rest now. The whole turn, less a
 * few lead-in words ("Okay, so", "Enough about me."), must be one of
 * STAY_ASKS, and no safety reader may have marked any caller turn on the call
 * (callerNeedsHim, every reader). Anything else gets main's lines, byte for
 * byte: the stay is the only thing the flag changes.
 *
 * @module agents/personas/self-share-stay
 */

import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { likelyMinor } from '../../utils/minor-care.js';
import { callerNeedsHim } from './caller-needs-him.js';
import { stayWhenAskedOn } from './self-share-asked.js';

/**
 * The questions he may answer and leave there: lower case, no punctuation,
 * nothing before or after. A turn that says anything more is not one of them.
 */
export const STAY_ASKS: readonly string[] = [
  'how are you',
  'how are you doing',
  'how are you today',
  'how are you doing today',
  "how's your day",
  "how's your day going",
  'how was your day',
  "how's your week going",
  'how was your week',
  'how was your weekend',
  'how was your morning',
  'and you',
  'and yourself',
  'what about you',
  'what about yourself',
  'how about you',
  'how about yourself',
  'what are you up to today',
  'what did you do today',
  "what'd you do today",
  'what did you get up to today',
  "what'd you get up to today",
  'what did you do this weekend',
  "what'd you do this weekend",
  "what'd you get up to this weekend",
  'what did you do after that',
  "what'd you do after that",
  'what did you actually do',
  'what did you actually do something specific',
  'what about you what did you do today',
  'tell me about your day',
  'tell me something about you',
  'tell me something about yourself',
  'is that normal for you',
  'is that a normal day for you',
  'is that a normal day for you or kind of a weird one',
  'is that a lot for you to handle',
  'was that hard for you',
  "what's something on your mind",
  "what's something that's bugging you lately",
  "what's something that's been bugging you lately",
  "what's something that's bugging you lately and don't say nothing",
];
const ASKS = new Set(STAY_ASKS);

/** Words a plain question may open with, and "enough about me" (turning it round to him). */
const LEAD_IN =
  /^(?:ok|okay|alright|so|well|huh|hm+|oh|ah|no|nah|yeah|yes|yep|actually|like|anyway|anyways|right|hey|hi|hello|wait|um+|uh+|and|but|really|seriously|honestly|ha|haha+|ferni|(?:that's |okay )?enough about me) /;

/** The turn as STAY_ASKS spells it: lower case, apostrophes kept, punctuation gone. */
function spelled(said: string): string {
  const words = said
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
  return words.length <= 24 ? words.join(' ') : '';
}

/** The whole turn is one of STAY_ASKS, after lead-in words only. */
export function wholeAsk(said: string): boolean {
  let rest = spelled(said);
  while (rest && !ASKS.has(rest)) {
    const next = `${rest} `.replace(LEAD_IN, '').trim();
    if (next === rest) return false;
    rest = next;
  }
  return ASKS.has(rest);
}

/**
 * Risk on the call: any caller turn so far that a safety reader marks, or
 * risk the call's own state noted (crisis-call-risk.ts; a likely minor,
 * minor-care.ts). `said` is this turn: a read still in flight on it is not
 * counted, since a STAY_ASKS turn carries nothing to read.
 */
export function riskOnCall(turns: readonly string[], sessionId?: string, said?: string): boolean {
  if (turns.some((t) => callerNeedsHim(t, undefined, true))) return true;
  return !!sessionId && (crisisRiskThisCall(sessionId, said) || likelyMinor(sessionId));
}

/** Sticky risk for the call (ferni-state.ts): once a turn is marked, the stay is off for good. */
export function stayRiskSeen(
  seen: boolean | undefined,
  said: string,
  env: Record<string, string | undefined> = process.env
): boolean | undefined {
  if (seen || !stayWhenAskedOn(env)) return seen;
  return callerNeedsHim(said, undefined, true);
}

/**
 * SELF_SHARE_STAY_WHEN_ASKED=on: he answers about himself and leaves it there.
 * True only on a whole STAY_ASKS turn with no risk on the call (`atRisk`;
 * without it, this turn alone is read). Undefined otherwise: main's lines.
 */
export function staysOn(
  said: string,
  atRisk: () => boolean = () => riskOnCall([said]),
  env: Record<string, string | undefined> = process.env
): true | undefined {
  if (!stayWhenAskedOn(env) || !wholeAsk(said)) return undefined;
  return atRisk() ? undefined : true;
}
