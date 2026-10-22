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

export interface HelpAsk {
  /** What he asks a hand with, as the end of "a small hand with ...". */
  ask: string;
  /** A word his reply holds when he has asked it (whole word). */
  cue: RegExp;
  /** A made-up answer, for the example only. */
  heard: string;
  /** How he would say that answer back. Plain words: nothing strips brackets before speech. */
  sayBack: string;
}

const PLANT_NAME: HelpAsk = {
  ask: 'a name for the jade plant Scott gave you, since nothing you have owned has lived long enough to get one',
  cue: /\bplant\b/i,
  heard: 'Pickle',
  sayBack: "Okay, the jade plant is Pickle now, that's settled",
};
const BOOK_TITLE: HelpAsk = {
  ask: 'a working title for the book, because you keep calling it "the book" and it deserves better',
  cue: /\b(?:book|title)\b/i,
  heard: 'Third of Seven',
  sayBack: 'The book is Third of Seven now, at least until I finish the next chapter',
};
const JAPAN_STOP: HelpAsk = {
  ask: 'one place to take your brothers and sisters on the Japan trip after Tokyo, since you only know the city',
  cue: /\b(?:japan|trip)\b/i,
  heard: 'Kyoto',
  sayBack: "Kyoto goes on the Japan trip after Tokyo, I'm telling the group chat",
};
const SKI_LEGS: HelpAsk = {
  ask: 'a good way to get your legs back before the ski week, beyond the long walks',
  cue: /\b(?:ski|legs)\b/i,
  heard: 'squats every morning',
  sayBack: "I'm doing squats every morning before the ski week, starting tomorrow",
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
      heard: 'less water',
      sayBack: "Less water it is, I'm doing exactly what you said",
    },
  ],
  book: [BOOK_TITLE, BOOK_TITLE, BOOK_TITLE, BOOK_TITLE, BOOK_TITLE],
  'japan-siblings': [undefined, JAPAN_STOP, JAPAN_STOP, JAPAN_STOP],
  'ski-week': [
    undefined,
    {
      ask: "settling it between Ken's Japan powder and Dermot's Alps for the ski week, since they want a tiebreaker",
      cue: /\b(?:ski|alps|powder)\b/i,
      heard: 'the Alps',
      sayBack: "I'm voting the Alps for the ski week, and I'm telling Ken and Dermot it was you",
    },
    SKI_LEGS,
    SKI_LEGS,
  ],
};

/** Where this call's day detail sits: its thread and beat, when it is a thread beat. */
function beatOf(
  detail: string,
  threads: readonly LifeThread[]
): { thread: string; beat: number } | undefined {
  for (const thread of threads) {
    const beat = thread.beats.indexOf(detail);
    if (beat >= 0) return { thread: thread.id, beat };
  }
  return undefined;
}

/** The ask for this call's day detail, when it is a thread beat that has one. */
export function helpAskFor(
  detail: string,
  threads: readonly LifeThread[] = LIFE_THREADS
): HelpAsk | undefined {
  const at = beatOf(detail, threads);
  return at ? HELP_ASKS[at.thread]?.[at.beat] : undefined;
}

/**
 * The one beat of a thread this caller is asked on: one ask per thread per
 * caller, so a friend who named the plant isn't asked to name it again five
 * calls later. Spread over the beats that have an ask, so callers differ.
 */
export function askBeatFor(userId: string, threadId: string): number | undefined {
  const beats = (HELP_ASKS[threadId] ?? []).flatMap((a, i) => (a ? [i] : []));
  return beats.length ? beats[hash(`${userId}:${threadId}`) % beats.length] : undefined;
}

/** The ask for this caller on this call's day detail: their thread's one ask beat only. */
export function callerAskFor(
  userId: string,
  detail: string,
  threads: readonly LifeThread[] = LIFE_THREADS
): HelpAsk | undefined {
  const at = beatOf(detail, threads);
  if (!at || askBeatFor(userId, at.thread) !== at.beat) return undefined;
  return HELP_ASKS[at.thread]?.[at.beat];
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
  /** His reply count at each offer: the reply at that index answered the offer. */
  offeredAt: number[];
  followed: boolean;
}

export const newHelpAskState = (): HelpAskState => ({ offeredAt: [], followed: false });

const askLine = (ask: string): string =>
  `[If it fits right here, ask them for a small hand with ${ask}. One short, easy question, because you'd honestly like their take, then let them answer. Only once this call.]`;

/** Said back as his choice, so it is his life the ledger keeps (life-ledger.ts). */
export const followLine = (help: HelpAsk): string =>
  `[You just asked them for a hand. If they gave you an answer, take it as they said it, without improving on it: say you are going with it in one full sentence that names it, like "${help.sayBack}" if they had said ${help.heard}, but with their own words, and thank them. If they brushed it off, let it go lightly and don't ask again.]`;

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

/** A request said without a question mark: "Help me name it." "Pick one for me." */
const REQUEST =
  /\b(?:help me|you pick|pick (?:one|a \w+) for me|i need (?:a name|ideas|your help)|any ideas|tell me what you(?:'d| would))\b/i;

/** Words of asking for a hand, not of asking about their life ("How was the trip?"). */
const HAND =
  /\b(?:help|hand|name|call it|title|think|pick|ideas?|advice|suggest\w*|recommend\w*|tiebreak\w*|settle|vote|go with|should i)\b/i;

/**
 * Whether a reply asked it: one sentence names the topic, asks for a hand, and
 * asks, by a question or a plain request. Offering the line is not asking (it
 * says "if it fits here"), and the follow-through line tells him he just
 * asked, so it waits for a reply that did. Unasked, the offer comes back once
 * more at most (MAX_OFFERS).
 */
export function askedFor(reply: string, help: HelpAsk): boolean {
  // "The plant has a new leaf. How was your day?" names the plant but asks about them.
  const sentences = reply.match(/[^.!?]+[.!?]*/g) ?? [];
  return sentences.some(
    (s) => help.cue.test(s) && HAND.test(s) && (s.includes('?') || REQUEST.test(s))
  );
}

/** The ask or follow-through line for this turn, or '' (and the state moves on). */
export function helpAskLine(turn: HelpTurn, state: HelpAskState): string {
  if (!ferniAsksHelpOn(turn.env) || state.followed) return '';
  if (!turn.userId || !helpCall(turn.userId, priorCallsOf(turn.userData))) return '';
  const help = callerAskFor(turn.userId, turn.detail);
  if (!help) return '';
  // Only the reply that answered an offer: a later "How was the trip?" is about them.
  const answered = state.offeredAt.map((i) => turn.replies[i] ?? '');
  if (answered.some((r) => askedFor(r, help))) {
    state.followed = true;
    return followLine(help);
  }
  if (!turn.ownStory || state.offeredAt.length >= MAX_OFFERS) return '';
  state.offeredAt.push(turn.replies.length);
  return askLine(help.ask);
}
