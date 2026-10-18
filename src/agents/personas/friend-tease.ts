/**
 * FRIEND_TEASE (off by default): teasing is earned, never on a low turn, and
 * dropped the moment it lands wrong (#1517, part of #1509).
 *
 * Ferni's sheet says "You tease once you know someone" (character.md), but the
 * model is never told whether it knows this caller, so a first call can tease.
 * The honest-friend praise note says "a little teasing is fine" on any call.
 * With the flag on, each reply's turn reminder says where the caller stands:
 * - a hard turn (crisis aside, which gets no note at all): no teasing, not
 *   even gently. Hard means the understanding's careful mood, venting, hard
 *   news, a low line about themselves, or hard words in the last few turns;
 * - the caller pushes back at Ferni ("that's not funny", "low blow") right
 *   after a reply where a tease was possible (friend stage, nothing hard):
 *   own it in a few plain words and no more teasing on this call. A hard
 *   turn is read first, so venting about someone else never gets an apology;
 * - a light turn before the third call (or with no call count): not yet,
 *   any joke is about himself or the situation;
 * - a light turn from the third call on, Ferni speaking: a light tease is
 *   earned, only on what they said about themselves, and he takes one back.
 *   Offered at most once in TEASE_EVERY light turns, so it stays rare.
 * The stage counts the caller's past calls (`totalConversations`, as
 * PERSONA_BEATS does), not the web app's relationship stage: the issue's
 * series has calls 1 and 2 at acquaintance and calls 3 to 5 at friend.
 *
 * @module agents/personas/friend-tease
 */

import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { ferniSpeaking } from './ferni-playful.js';
import { soundsLow } from './ferni-self-share.js';
import { callerTurnsOf } from './happy-exits.js';
import { honestFriendNote } from './honest-friend.js';
import { priorCallsOf } from './personal-beats.js';
import { hardNews } from './turn-candor.js';
import { callerVenting, modelSignals } from './turn-extras.js';
import { understandingFor, understandingMode } from './turn-understanding.js';

/** Past calls before this one at which teasing is earned: the third call on. */
export const FRIEND_STAGE_PRIOR_CALLS = 2;
/** The earned-tease invitation rides at most one light turn in this many. */
export const TEASE_EVERY = 3;

export const NOT_YET_NOTE =
  "You don't know them well yet, so no teasing: be warm and light, and if there's a joke, make it about yourself or the situation, never about them.";
export const EARNED_NOTE =
  "You know each other by now, so one light tease is earned if it fits: only about something they've said about themselves or clearly enjoy, never their looks, body, money, work troubles or their people. If they tease you, take it with a laugh at yourself and give a small one back.";
export const LOW_NOTE = "They're not in a light place: no teasing at all, not even gently.";
export const PUSHBACK_NOTE =
  'That landed wrong with them. Own it in a few plain words, like "Sorry, that was a bad joke", drop it, and don\'t tease them again this call.';
export const STOPPED_NOTE = 'A tease landed wrong earlier this call, so no more teasing today.';

export type TeaseCue = 'low' | 'pushback' | 'stopped' | 'not_yet' | 'earned' | 'none';

const NOTES: Record<TeaseCue, string> = {
  low: LOW_NOTE,
  pushback: PUSHBACK_NOTE,
  stopped: STOPPED_NOTE,
  not_yet: NOT_YET_NOTE,
  earned: EARNED_NOTE,
  none: '',
};

/**
 * A tease that landed wrong, aimed at Ferni: "you're ...", or "that's ..."
 * about what he just said, never a third party ("my boss was so rude").
 */
const TEASE_PUSHBACK =
  /(?:\b(?:you'?re(?: being)?|that'?s|that was) (?:(?:so|kind of|a bit|a little|really|pretty) )?(?:mean|rude|harsh|uncalled for|not (?:funny|nice|cool))\b|\b(?:that )?wasn'?t funny\b|^\W*not funny\b|\blow blow\b|\bare you making fun of me\b|\b(?:don'?t|stop) mak(?:e|ing) fun of me\b|\bstop teasing me\b)/i;

export function friendTeaseOn(env: Env = process.env): boolean {
  return flagOn('FRIEND_TEASE', env);
}

export function teasePushback(said: string): boolean {
  return TEASE_PUSHBACK.test(said);
}

/** Whether the caller is far enough in for a tease: unknown counts as not. */
export function teaseEarned(priorCalls: number | undefined): boolean {
  return typeof priorCalls === 'number' && priorCalls >= FRIEND_STAGE_PRIOR_CALLS;
}

/** What one reply needs to decide, read in code. */
export interface TeaseTurn {
  said: string;
  /** The caller's turns so far, oldest first, this one last. */
  callerTurns: readonly string[];
  priorCalls: number | undefined;
  /** The understanding (or other signals) reads the turn as careful. */
  careful: boolean;
  /**
   * Which reply this is: Ferni's replies on the call so far. The preemptive
   * and final requests for one reply share it; the next caller turn does not,
   * even with the same words ("yeah", then "yeah").
   */
  reply: number;
  /** Ferni, not a teammate, is speaking: only he gets the earned invitation. */
  ferni: boolean;
}

interface CallState {
  stopped: boolean;
  lightTurns: number;
  last?: { reply: number; cue: TeaseCue };
}

const calls = new WeakMap<object, CallState>();

function hard(turn: TeaseTurn): boolean {
  const s = turn.said;
  return (
    turn.careful ||
    callerVenting(s) ||
    hardNews(s) ||
    soundsLow(s) ||
    isHeavyMoment(turn.callerTurns)
  );
}

/**
 * This reply's cue, kept per call. The same reply asked for again (the
 * preemptive request, then the final one, whose words may have grown) gets
 * the same cue and counts once; keyed on the reply, never on the words.
 */
export function teaseCue(call: object, turn: TeaseTurn): TeaseCue {
  if (!turn.said.trim()) return 'none';
  let state = calls.get(call);
  if (!state) {
    state = { stopped: false, lightTurns: 0 };
    calls.set(call, state);
  }
  if (state.last?.reply === turn.reply) return state.last.cue;
  const cue = decide(state, turn);
  state.last = { reply: turn.reply, cue };
  return cue;
}

/** Whether Ferni's reply just before this turn could have teased: friend stage, nothing hard. */
function teaseWasPossible(state: CallState, turn: TeaseTurn): boolean {
  const prev = state.last;
  return (
    prev?.reply === turn.reply - 1 &&
    (prev.cue === 'earned' || prev.cue === 'none') &&
    teaseEarned(turn.priorCalls)
  );
}

function decide(state: CallState, turn: TeaseTurn): TeaseCue {
  if (hard(turn)) return 'low';
  if (teaseWasPossible(state, turn) && teasePushback(turn.said)) {
    state.stopped = true;
    return 'pushback';
  }
  if (state.stopped) return 'stopped';
  if (!teaseEarned(turn.priorCalls)) return 'not_yet';
  if (!turn.ferni) return 'none';
  const offer = state.lightTurns % TEASE_EVERY === 0;
  state.lightTurns++;
  return offer ? 'earned' : 'none';
}

export const teaseNoteFor = (cue: TeaseCue): string => NOTES[cue];

/** The model's careful reading of these words, when understanding is live. */
function carefulRead(session: object, said: string, env: Env): boolean {
  if (understandingMode(env) !== 'live') return false;
  const understood = understandingFor(session, said);
  return understood ? modelSignals(understood).careful : false;
}

/**
 * The friend notes for one reply: HONEST_FRIEND's (honest-friend.ts) and
 * FRIEND_TEASE's. With FRIEND_TEASE off this is honestFriendNote alone, as
 * before. With crisis guidance, nothing.
 */
export function friendNotes(
  chatCtx: llm.ChatContext,
  session: object,
  said: string,
  crisis: boolean,
  env: Env = process.env
): string[] {
  if (!friendTeaseOn(env) || crisis) {
    return [honestFriendNote(chatCtx, said, { careful: crisis, env })];
  }
  const replies = chatCtx.items.filter((i) => i.type === 'message' && i.role === 'assistant');
  const cue = teaseCue(session, {
    said,
    reply: replies.length,
    callerTurns: callerTurnsOf(chatCtx),
    priorCalls: priorCallsOf((session as { userData?: unknown }).userData),
    careful: carefulRead(session, said, env),
    ferni: ferniSpeaking(session),
  });
  const teaseOk = cue === 'earned' || cue === 'none';
  return [honestFriendNote(chatCtx, said, { env, teaseOk }), teaseNoteFor(cue)];
}
