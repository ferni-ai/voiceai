/**
 * Candor: a good friend sometimes disagrees, or says "I don't know", instead
 * of agreeing with everything and answering everything.
 *
 * Measured before this (2026-10-10, 382 recorded eval calls, 1,625 Ferni
 * turns): no turn disagreed with the caller, and the "I don't know"s were
 * almost all filler ("it's, I don't know, frustrating"); the only owned
 * uncertainty was a look-up that came back empty. Ferni did hold a view under
 * pushback in the dilemma scenario, but no scenario asked it to correct a
 * wrong fact, to refuse to guess, or to say no to someone fishing for a yes.
 *
 * The only stance line before this (STANCE) was drawn at random on 30% of
 * turns, venting and bad news included. CANDOR=on (off by default) makes it
 * fit the moment: always on when they ask for a yes or for something nobody
 * can know, a standing candor line on other turns, and nothing at all while
 * they are hurting, where support comes first (and for a few turns after).
 *
 * @module agents/personas/turn-candor
 */

import type { CallerMove } from './turn-shape.js';
import type { TurnSignals } from './turn-extras.js';

type Env = Record<string, string | undefined>;

export function candorEnabled(env: Env = process.env): boolean {
  return env.CANDOR === 'on';
}

/** The pre-CANDOR line, drawn at random on 30% of non-ack turns. */
export const STANCE =
  'If you\'d see it differently, say so; if you don\'t know, say "I don\'t know" or "hm, no idea" instead of covering.';

/**
 * Bad news, illness, loss: support comes first. Broad on purpose: holding back
 * candor on an ordinary turn costs little, disagreeing with someone whose dad
 * is in hospital costs a lot. Whole words only.
 */
const HARD_NEWS =
  /\b(?:hospital|icu|surgery|chemo|cancer|tumou?r|diagnos(?:ed|is)|biopsy|scan|heart|stroke|died|dead|dying|passed away|funeral|miscarr(?:y|iage|ied)|grie(?:f|ving)|lost (?:my|her|his|our|the baby)|laid off|got fired|divorce|broke up|breaking up|left me|cheat(?:ed|ing) on me)\b/i;

export function hardNews(text: string): boolean {
  return HARD_NEWS.test(text);
}

/** They want a yes: "it's a good idea, right?", "tell me I'm right". */
const WANTS_A_YES =
  /\bright\s*\?|\b(?:tell me i'?m (?:right|not crazy)|am i (?:crazy|wrong)|(?:good|great|smart) (?:idea|call|move)|you(?:'d| would)? agree|don'?t you think|you'?re supposed to be on my side|back me up|i should,? right)\b/i;

/**
 * Asked about something nobody on the call can know: what is in someone
 * else's head, or what happens next. Only when asked ("I'm doing it tomorrow."
 * is a plan, not a question).
 */
const ASKED = /\?|\b(?:you think|do you know|any idea|tell me)\b/i;
const UNKNOWABLE =
  /\b(?:why (?:is|did|does|would|won'?t|hasn'?t) (?:she|he|they)|is (?:she|he|they) (?:mad|upset|ignoring|lying|into|over)|(?:does|did) (?:she|he|they) (?:like|love|hate|mean|want)|what (?:is|was|'s) (?:she|he|they) thinking|(?:going to|gonna) (?:close|jump|go up|go down|crash|win|happen)|tomorrow|next (?:week|month|year)|will i (?:get|win|make)|do you think i'?ll)\b/i;

const CANDOR =
  "Be honest the way a good friend is: if something they said is wrong, or a plan looks like a real mistake, say so kindly and say why, once, then let them decide; if you don't know something, say \"I don't know\" rather than guessing. Don't disagree for the sake of it and don't lecture.";
const CANDOR_YES =
  'They want you to agree. Give your honest view: if it is a good call, say so and why; if you have doubts, name the one that matters, kindly and plainly, and leave the choice with them. Being on their side is not the same as saying yes.';
const CANDOR_UNKNOWABLE =
  "Nobody on this call can know that (what is in someone else's head, what happens next). Say plainly that you don't know, then, if you have one, give your honest guess and call it a guess. Never invent a reason, a number or an outcome.";

/** Turns since the last hard news, per call; past this many, candor comes back. */
const SUPPORT_TURNS = 3;
const held = new WeakMap<object, { last: string; turns: number }>();

/**
 * Whether support still comes first on this call: this turn has hard news (or
 * `hurting`, the model's reading), or one of the last few did. The preemptive and the final request for one turn
 * (the same words, or the final extending the preemptive) count as one turn.
 */
export function supportHeld(session: object, said: string, hurting: boolean): boolean {
  const t = said.trim();
  const prev = held.get(session);
  if (hurting || hardNews(t)) {
    held.set(session, { last: t, turns: 0 });
    return true;
  }
  if (!prev) return false;
  if (t !== prev.last && !t.startsWith(prev.last)) {
    prev.turns++;
    prev.last = t;
  }
  return prev.turns <= SUPPORT_TURNS;
}

export interface Stance {
  lines: string[];
  fired: string[];
}

/**
 * The stance lines for one reply. `drew` is whether the old 30% draw came up
 * (it is still drawn, so the rest of the turn's shape is the same either way).
 */
export function stanceFor(
  userText: string,
  move: CallerMove,
  sig: TurnSignals,
  drew: boolean,
  env: Env = process.env
): Stance {
  if (!candorEnabled(env)) return { lines: drew ? [STANCE] : [], fired: [] };
  if (sig.careful || sig.supportFirst || hardNews(userText))
    return { lines: [], fired: ['candor_held'] };
  if (move === 'ack') return { lines: [], fired: [] };
  if (ASKED.test(userText) && UNKNOWABLE.test(userText))
    return { lines: [CANDOR_UNKNOWABLE], fired: ['candor_unknowable'] };
  if (WANTS_A_YES.test(userText)) return { lines: [CANDOR_YES], fired: ['candor_yes'] };
  return { lines: [CANDOR], fired: ['candor'] };
}
