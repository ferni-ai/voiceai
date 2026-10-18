/**
 * TEASE_GATE (off by default): teasing is earned, and it stays mutual (#1517).
 *
 * Two notes on the turn path give teasing away with no gate: the praise note
 * ("a little teasing is fine", honest-friend.ts) and the playful line ("a light
 * tease", ferni-playful.ts). Neither knows who is on the line, so a first-time
 * caller, or one who sounds low, can be teased.
 *
 * With the flag on, teasing is allowed only when all of these hold:
 *   - friend stage: at least FRIEND_STAGE_CALLS (6) calls before this one, from
 *     the profile's totalConversations (priorCallsOf, personal-beats.ts). It is
 *     the relationship arc's friend stage (friendship-flowering.ts falls back
 *     to totalConversations >= 6) and the per-persona 'friend' stage (6+
 *     interactions, user-profile.ts). Unknown counts (anonymous callers) fail
 *     closed;
 *   - not a first call (isFirstCall, first-call-rapport.ts);
 *   - the caller doesn't sound low in their last three turns (soundsLow,
 *     ferni-self-share.ts);
 *   - no heavy moment in their last turns (isHeavyMoment, the laugh guards'
 *     check) and no crisis guidance on the reply.
 * Otherwise the two permissions above are cut from the reminder and, crisis
 * aside, a "no teasing today" note rides instead. When allowed, a note keeps it
 * to things the caller joked about first (in the prompt only: no code-side
 * topic signal yet).
 *
 * Once the caller pushes back on a tease ("that's not funny", "rude", "not
 * cool", "hey, that's mean"), Ferni owns it in a word, the way REPAIR_MODE owns
 * a correction, and no teasing rides for the rest of the call.
 *
 * @module agents/personas/tease-gate
 */

import type { llm } from '@livekit/agents';

import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { soundsLow } from './ferni-self-share.js';
import { isFirstCall } from './first-call-rapport.js';
import { callerTurnsOf } from './happy-exits.js';
import { PRAISE_TEASE } from './honest-friend.js';
import { priorCallsOf } from './personal-beats.js';

const log = createLogger({ module: 'TeaseGate' });

/** Calls before this one at which the caller counts as a friend. */
export const FRIEND_STAGE_CALLS = 6;

/** The playful line's teasing option (PLAYFUL_LINE, ferni-playful.ts); a test pins that it is there. */
export const PLAYFUL_TEASE = 'a light tease, ';

/** The teasing permissions cut from the reminder when teasing isn't allowed. */
const TEASE_CLAUSES = [PRAISE_TEASE, PLAYFUL_TEASE] as const;

export const TEASE_OK_NOTE =
  "You two know each other well, so a little teasing is fine now and then, but only about something they joked about first, never about how they look, something they care about or anything hard. If they don't laugh, drop it.";
export const NO_TEASE_NOTE =
  'No teasing today: keep any humor about yourself or the moment, never at their expense.';
export const OWN_TEASE_NOTE =
  'They pushed back on something you said. If you were teasing, own it in a word, the way a friend would ("Fair, my bad."), then go on. No more teasing for the rest of the call.';
export const DROPPED_TEASE_NOTE =
  'Earlier on this call they pushed back on a tease: no teasing for the rest of the call.';

/** Openers before a pushback: "hey,", "whoa.", "okay,", "ouch!". */
const LEAD_IN =
  '(?:(?:hey|whoa|woah|wow|ok|okay|um|uh|dude|man|ouch|oof|ugh|yikes|seriously|come on|excuse me|ferni)\\s*[,.!]*\\s+)*';
/** Words between the opener and the pushback: "that's", "that was", "you're being", "kind of". */
const FRAME =
  "(?:(?:that'?s|that is|that was|it'?s|it was|you'?re|you are|being|so|kinda|kind of|a bit|a little|pretty|really)\\s+)*";
const PUSHBACK_WORDS = '(?:not funny|not cool|rude|mean|uncalled for|(?:a )?low blow)';
/** The pushback ends the clause: "rude." or "not cool, man", never "rude people at work". */
const CLAUSE_END = '(?=\\s*(?:[.!?,;]|$)|\\s+(?:man|dude|bro|ferni|though|of you|to say)\\b)';
const OPENER = new RegExp(`^\\s*${LEAD_IN}`, 'i');
const PUSHBACK = new RegExp(`^\\s*${FRAME}${PUSHBACK_WORDS}${CLAUSE_END}`, 'i');

/**
 * Pushback on a tease, precision first: whole words opening the caller's turn
 * (after an "ouch." or "hey,"), the way a reaction to what Ferni just said comes out.
 * "My boss was so rude today" and "He cut in line. So rude." are about
 * someone else; "hey, guess what" is not pushback at all.
 */
export function isTeasePushback(said: string): boolean {
  const opened = said.replace(/[’‘]/g, "'").replace(OPENER, '');
  const first = opened.split(/(?<=[.!?])\s+/)[0] ?? '';
  return PUSHBACK.test(first);
}

/** Each call's pushback on a tease, kept for the rest of the call. */
const pushedBack = new WeakSet<object>();

const ferniSpoke = (chatCtx: llm.ChatContext): boolean =>
  chatCtx.items.some((i) => i.type === 'message' && i.role === 'assistant');

export function teaseGateEnabled(env: Env = process.env): boolean {
  return flagOn('TEASE_GATE', env);
}

export interface TeaseGate {
  /** The note for this reply ('' when the flag is off or crisis guidance rides it). */
  note: string;
  /** A reminder line with the teasing permissions cut when teasing isn't allowed. */
  strip: (text: string) => string;
}

const unchanged = (text: string): string => text;
const withoutTeasing = (text: string): string =>
  TEASE_CLAUSES.reduce((t, clause) => t.split(clause).join(''), text);

/** Whether this caller and moment have earned a tease (before any pushback). */
export function teaseEarned(chatCtx: llm.ChatContext, session: object, careful: boolean): boolean {
  if (careful) return false;
  const { userData } = session as { userData?: unknown };
  if (isFirstCall(userData) || (priorCallsOf(userData) ?? 0) < FRIEND_STAGE_CALLS) return false;
  const turns = callerTurnsOf(chatCtx);
  return !turns.slice(-3).some(soundsLow) && !isHeavyMoment(turns);
}

/**
 * TEASE_GATE=on: this reply's teasing note and the filter for the rest of the
 * reminder. `said` is the caller's words this reply answers; `careful` means
 * crisis guidance rides it.
 */
export function teaseGateFor(
  chatCtx: llm.ChatContext,
  session: object,
  said: string,
  options: { careful?: boolean; env?: Env } = {}
): TeaseGate {
  if (!teaseGateEnabled(options.env)) return { note: '', strip: unchanged };
  const careful = options.careful === true;
  const pushingBack = Boolean(said) && ferniSpoke(chatCtx) && isTeasePushback(said);
  if (pushingBack && !pushedBack.has(session)) {
    pushedBack.add(session);
    log.info({}, 'TEASE_PUSHBACK');
  }
  if (pushedBack.has(session)) {
    const note = pushingBack ? OWN_TEASE_NOTE : DROPPED_TEASE_NOTE;
    return { note: careful ? '' : note, strip: withoutTeasing };
  }
  if (teaseEarned(chatCtx, session, careful)) return { note: TEASE_OK_NOTE, strip: unchanged };
  return { note: careful ? '' : NO_TEASE_NOTE, strip: withoutTeasing };
}
