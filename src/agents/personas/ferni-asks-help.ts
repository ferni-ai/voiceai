/**
 * Ferni asks the caller for a small hand now and then (FERNI_ASKS_HELP, off by
 * default). Closeness grows when both people disclose and ask, not when one
 * side only listens; until now every ask went toward the caller.
 *
 * On at most one call in five, with a caller he knows (five calls or more),
 * the self-share slot on a light turn invites one small, real ask from his
 * running life thread (ferni-life-threads.ts): a name for the jade plant, a
 * title for the book. Once he has asked, the caller's next turn gets one line:
 * take their answer as they said it and say it back as his choice in a full
 * sentence. That sentence is his own reply, so the life ledger
 * (life-ledger.ts) stores it with the call like anything he says about his
 * life, and the next call recalls it.
 *
 * Nothing is invented: each ask is written here against a thread beat, and
 * the thread is only running when FERNI_THREADS is on. When the caller needs
 * him, ferni-state.ts returns before any of this runs.
 *
 * Issue #1520 (part of #1509).
 *
 * @module agents/personas/ferni-asks-help
 */

import { flagOn } from '../../config/env-flag.js';
import { LIFE_THREADS, type LifeThread } from './ferni-life-threads.js';
import { priorCallsOf } from './personal-beats.js';

export function ferniAsksHelpOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('FERNI_ASKS_HELP', env);
}

/** A caller he knows: past "getting to know" (calculateRelationshipStage, user-profile.ts). */
export const FRIEND_AFTER_CALLS = 5;
/** At most one call in this many. */
export const CALLS_PER_ASK = 5;
/** Light turns the ask is offered on before he lets it go for the call. */
export const MAX_OFFERS = 2;

interface HelpAsk {
  /** What he asks a hand with, as the end of "a small hand with ...". */
  ask: string;
  /** A word his reply holds when he has asked it (whole word). */
  cue: RegExp;
}

const PLANT_NAME: HelpAsk = {
  ask: 'a name for the jade plant Scott gave you, since nothing you have owned has lived long enough to get one',
  cue: /\bplant\b/i,
};
const BOOK_TITLE: HelpAsk = {
  ask: 'a working title for the book, because you keep calling it "the book" and it deserves better',
  cue: /\b(?:book|title)\b/i,
};
const JAPAN_STOP: HelpAsk = {
  ask: 'one place to take your brothers and sisters on the Japan trip after Tokyo, since you only know the city',
  cue: /\b(?:japan|trip)\b/i,
};
const SKI_LEGS: HelpAsk = {
  ask: 'a good way to get your legs back before the ski week, beyond the long walks',
  cue: /\b(?:ski|legs)\b/i,
};

/** Per thread, the ask for each weekly beat (undefined: nothing to ask that week). */
export const HELP_ASKS: Readonly<Record<string, ReadonlyArray<HelpAsk | undefined>>> = {
  'jade-plant': [
    PLANT_NAME,
    PLANT_NAME,
    PLANT_NAME,
    {
      ask: 'whether the jade plant that dropped two leaves wants more water or less',
      cue: /\b(?:plant|water)\b/i,
    },
  ],
  book: [BOOK_TITLE, BOOK_TITLE, BOOK_TITLE, BOOK_TITLE, BOOK_TITLE],
  'japan-siblings': [undefined, JAPAN_STOP, JAPAN_STOP, JAPAN_STOP],
  'ski-week': [
    undefined,
    {
      ask: "settling it between Ken's Japan powder and Dermot's Alps for the ski week, since they want a tiebreaker",
      cue: /\b(?:ski|alps|powder)\b/i,
    },
    SKI_LEGS,
    SKI_LEGS,
  ],
};

/** The ask for this call's day detail, when it is a thread beat that has one. */
export function helpAskFor(
  detail: string,
  threads: readonly LifeThread[] = LIFE_THREADS
): HelpAsk | undefined {
  for (const thread of threads) {
    const beat = thread.beats.indexOf(detail);
    if (beat >= 0) return HELP_ASKS[thread.id]?.[beat];
  }
  return undefined;
}

function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Whether this call is this caller's one in five: a known caller (a real id,
 * enough prior calls), and the call count lands on the caller's own slot, so
 * two asks are always five calls apart.
 */
export function helpCall(userId: string | undefined, priorCalls: number | undefined): boolean {
  if (!userId || userId === 'anonymous') return false;
  if (priorCalls === undefined || priorCalls < FRIEND_AFTER_CALLS) return false;
  return priorCalls % CALLS_PER_ASK === hash(userId) % CALLS_PER_ASK;
}

/** Per call: how far the ask has got. */
export interface HelpAskState {
  offers: number;
  /** His reply count when the first offer went out. */
  offeredAt?: number;
  followed: boolean;
}

export const newHelpAskState = (): HelpAskState => ({ offers: 0, followed: false });

const askLine = (ask: string): string =>
  `[If it fits right here, ask them for a small hand with ${ask}. One short, easy question, because you'd honestly like their take, then let them answer. Only once this call.]`;

/** Said back as his choice, so it is his life the ledger keeps (life-ledger.ts). */
export const FOLLOW_LINE =
  '[You just asked them for a hand. If they gave you an answer, take it as they said it, without improving on it: say you are going with it in one full sentence that names it, like "Okay, the jade plant is Pickle now, that\'s settled", and thank them. If they brushed it off, let it go lightly and don\'t ask again.]';

export interface HelpTurn {
  /** This call's day detail (ferni-state.ts). */
  detail: string;
  /** His replies so far, oldest first, markup removed. */
  replies: string[];
  /** Whether a story of his own may ride this reply (selfShareFor). */
  ownStory: boolean;
  userId?: string;
  userData: unknown;
  env?: Record<string, string | undefined>;
}

/** The ask or follow-through line for this turn, or '' (and the state moves on). */
export function helpAskLine(turn: HelpTurn, state: HelpAskState): string {
  if (!ferniAsksHelpOn(turn.env) || state.followed) return '';
  if (!helpCall(turn.userId, priorCallsOf(turn.userData))) return '';
  const help = helpAskFor(turn.detail);
  if (!help) return '';
  const since = state.offeredAt === undefined ? [] : turn.replies.slice(state.offeredAt);
  if (since.some((r) => r.includes('?') && help.cue.test(r))) {
    state.followed = true;
    return FOLLOW_LINE;
  }
  if (!turn.ownStory || state.offers >= MAX_OFFERS) return '';
  state.offers += 1;
  state.offeredAt ??= turn.replies.length;
  return askLine(help.ask);
}
