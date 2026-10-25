/**
 * Marks a turn playful for the turn reminder (FERNI_PLAYFUL, ferni-playful.ts):
 * the flag on and Ferni, not a teammate, speaking. Kept apart from
 * ferni-playful.ts, which turn-shape.ts imports, so neither imports the other.
 *
 * Never near hard news. The first version read one turn, and only its last 12
 * words (classifyBackchannelContext), so grief early in a long turn, "she left
 * me", or "yeah" right after grief all read as easy. Now a heavy turn
 * (isHeavyMoment) or a careful one holds play off for itself and the
 * CALM_TURNS after it, and the playful line comes at most once in LINE_EVERY
 * turns of a call: on every easy turn it became a tic.
 *
 * @module agents/personas/ferni-playful-turn
 */

import type { Env } from '../../config/env-flag.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { ferniPlayfulOn, ferniSpeaking, playfulLineFits } from './ferni-playful.js';
import { callerVenting, regexSignals, type TurnSignals } from './turn-extras.js';
import { callerMove } from './turn-shape.js';

/** Turns after a heavy or careful one with no play at all. */
export const CALM_TURNS = 3;
/** The playful line at most once in this many turns of a call. */
export const LINE_EVERY = 3;

interface PlayState {
  /** The caller's words this turn: a request for the same words, or more of them, is the same turn. */
  said?: string;
  sinceHard: number;
  sinceLine: number;
  /** Whether this turn got the line: the preemptive and final requests agree. */
  line?: boolean;
}

const states = new WeakMap<object, PlayState>();

function stateOf(session: object): PlayState {
  let s = states.get(session);
  if (!s) {
    s = { sinceHard: Infinity, sinceLine: Infinity };
    states.set(session, s);
  }
  return s;
}

/** Hard words or a careful turn, whatever else the signals say. */
function hard(said: string, sig: TurnSignals): boolean {
  return sig.careful || sig.supportFirst === true || callerVenting(said) || isHeavyMoment([said]);
}

/** Count a new caller turn, or recognise the same one asked for again. */
function advance(s: PlayState, said: string): void {
  const same = s.said !== undefined && (said === s.said || said.startsWith(s.said));
  s.said = said;
  if (same) return;
  s.sinceHard++;
  s.sinceLine++;
  s.line = undefined;
}

/**
 * The signals with `playful` set when the flag is on, Ferni is speaking and
 * nothing hard is in this turn or the CALM_TURNS before it; else as given.
 * `playfulLine` says whether this turn may carry the playful line.
 */
export function withPlayful(
  session: object,
  said: string,
  signals: TurnSignals | undefined,
  env: Env = process.env
): TurnSignals | undefined {
  if (!ferniPlayfulOn(env) || !ferniSpeaking(session)) return signals;
  const sig = signals ?? regexSignals(said, callerMove(said));
  const s = stateOf(session);
  advance(s, said);
  if (hard(said, sig)) s.sinceHard = 0;
  if (s.sinceHard <= CALM_TURNS) return signals;
  if (s.line === undefined) {
    s.line = s.sinceLine >= LINE_EVERY && playfulLineFits(sig);
    if (s.line) s.sinceLine = 0;
  }
  return { ...sig, playful: true, playfulLine: s.line };
}
