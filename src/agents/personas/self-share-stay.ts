/**
 * When an answer about himself may stop there (SELF_SHARE_STAY_WHEN_ASKED=on, #3475).
 *
 * "Leave it there, no question back" fits a turn that is nothing but a plain
 * question about him. Rounds 2 and 3 found the question inside a longer turn
 * and let the rest through a word list; the verifier (2026-11-05) kept
 * finding a rest that was the caller's own news: "What'd you get up to today?
 * Doing it tonight.", "How are you? This is the last night." So there is no
 * rest. The whole turn, less filler words ("Okay, so", "Enough about me."),
 * must be one of STAY_ASKS, written in plain letters, and no safety reader may
 * have marked any caller turn on the call (callerNeedsHim, every reader).
 * Round 4's verify: an answer word ("Yes. How are you?" after his "are you
 * thinking about hurting yourself?"), a bare age ("14. And you?") and an
 * emoji or another script got the stay. So the lead-ins are fillers only, a
 * turn with any digit, emoji or symbol is not a plain ask, he never stays
 * right after a question of his own, and the asks that lean on what came
 * before ("Is that normal for you?") stay only after a share of his own.
 * Anything else gets main's lines, byte for byte.
 *
 * @module agents/personas/self-share-stay
 */

import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { likelyMinor } from '../../utils/minor-care.js';
import { callerNeedsHim } from './caller-needs-him.js';
import { isSelfShare } from './ferni-self-share.js';
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

/**
 * The asks that lean on what he just said ("that"): about him only after a
 * share of his own. After "My husband takes my car keys and checks my phone
 * every night.", "Is that normal for you?" is about the caller's life.
 */
export const AFTER_HIS_SHARE: readonly string[] = [
  'what did you do after that',
  "what'd you do after that",
  'what did you actually do',
  'what did you actually do something specific',
  'is that normal for you',
  'is that a normal day for you',
  'is that a normal day for you or kind of a weird one',
  'is that a lot for you to handle',
  'was that hard for you',
];
const LEANS = new Set(AFTER_HIS_SHARE);

/**
 * Filler a plain question may open with, and "enough about me" (turning it
 * round to him). Never an answer word: "Yeah. Anyway, how was your day?" or
 * "No. And you?" answers something first.
 */
export const LEAD_INS: readonly string[] = [
  'ok',
  'okay',
  'alright',
  'so',
  'well',
  'huh',
  'hm',
  'hmm',
  'oh',
  'ah',
  'um',
  'umm',
  'uh',
  'anyway',
  'anyways',
  'hey',
  'hi',
  'hello',
  'and',
  'ferni',
  'enough about me',
  "that's enough about me",
  'okay enough about me',
];

/** Letters, spaces and sentence punctuation only: a digit, emoji, symbol or other script is more than a plain ask. */
const PLAIN = /^[A-Za-z\s.,!?'"‘’-]*$/;

/** The turn as STAY_ASKS spells it: lower case, apostrophes kept, punctuation gone; '' if not plain. */
function spelled(said: string): string {
  if (!PLAIN.test(said)) return '';
  const words = said
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
  return words.length <= 24 ? words.join(' ') : '';
}

/** The STAY_ASKS phrase the whole turn is, after lead-in words only. */
export function wholeAsk(said: string): string | undefined {
  let rest = spelled(said);
  while (rest && !ASKS.has(rest)) {
    const lead = LEAD_INS.find((w) => rest.startsWith(`${w} `));
    if (!lead) return undefined;
    rest = rest.slice(lead.length + 1);
  }
  return ASKS.has(rest) ? rest : undefined;
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
 * True only on a whole STAY_ASKS turn, when `last` (his last reply) asked
 * nothing, AFTER_HIS_SHARE asks only after a share of his own, and with no risk
 * on the call (`atRisk`; without it, this turn alone is read). Undefined
 * otherwise: main's lines.
 */
export function staysOn(
  said: string,
  last = '',
  atRisk: () => boolean = () => riskOnCall([said]),
  env: Record<string, string | undefined> = process.env
): true | undefined {
  if (!stayWhenAskedOn(env)) return undefined;
  const ask = wholeAsk(said);
  if (!ask || last.includes('?')) return undefined;
  if (LEANS.has(ask) && !isSelfShare(last)) return undefined;
  return atRisk() ? undefined : true;
}
