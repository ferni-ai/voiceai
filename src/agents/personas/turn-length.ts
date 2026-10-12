/**
 * How long and how rough one reply is, learned from real friends instead of fixed in a prompt.
 *
 * Blind next-turn test (scripts/voice-eval/next-turn, 2026-10-11): against real friends' next
 * turns, Ferni's replies ran a median 17 words to their 7 and had a filler in 55% of replies to
 * their 26%, mostly mid-reply ("that is, um, wild"), the commonest thing the judge quoted as an AI
 * tell. Real friends' lengths vary widely (a third are four words or fewer, one in ten is over 20)
 * and depend weakly on the moment: longer when they already hold the floor and the talk is lively,
 * shorter after a long turn from the other person. Their roughness rises with length (22% of short
 * turns, 71% of long ones) and short turns are rough at the start ("uh, no"), long ones mid-way.
 *
 * TURN_LENGTH=learned: each reply gets a length drawn from friends' next turns in the same kind of
 * moment (turn-length-table.generated.ts, fitted by scripts/voice-eval/next-turn/fit-turn-length.mjs).
 * TURN_TEXTURE=learned: roughness at friends' rate for a reply that size, in their form; otherwise
 * the reply is said cleanly. Both off by default; a few microseconds per turn.
 *
 * @module agents/personas/turn-length
 */

import { NEXT_TURN_WORDS, ROUGH_KINDS, ROUGH_SHARE } from './turn-length-table.generated.js';

type Env = Record<string, string | undefined>;

export const lengthLearned = (env: Env = process.env): boolean => env.TURN_LENGTH === 'learned';
export const textureLearned = (env: Env = process.env): boolean => env.TURN_TEXTURE === 'learned';

/** The turns before this reply that set its length: Ferni's own last reply and the talk's pace. */
export interface RecentTurns {
  ferniLastWords: number;
  /** Mean words per turn over the last six turns, both speakers. */
  energy: number;
}

const countWords = (t: string): number => t.split(/\s+/).filter(Boolean).length;
const bucket = (x: number, edges: number[]): number => edges.filter((e) => x > e).length;

/** RecentTurns from the conversation so far, oldest first, ending with the caller's turn. */
export function recentTurns(turns: Array<{ ferni: boolean; text: string }>): RecentTurns {
  const last6 = turns.slice(-6);
  const energy = last6.reduce((s, t) => s + countWords(t.text), 0) / Math.max(1, last6.length);
  const ferniLast = [...turns].reverse().find((t) => t.ferni);
  return { ferniLastWords: ferniLast ? countWords(ferniLast.text) : 0, energy };
}

/**
 * Words for this reply, drawn from friends' next turns in the same kind of moment. `atLeastMedian`
 * keeps news that matters, or a question about him, from getting a two-word reply.
 */
export function targetWords(
  said: string,
  recent: RecentTurns | undefined,
  rng: () => number,
  atLeastMedian = false
): number {
  const theirs = countWords(said);
  const key = `${bucket(recent?.ferniLastWords ?? 0, [4, 12])}${bucket(theirs, [3, 15])}${bucket(recent?.energy ?? theirs, [6, 12])}`;
  const q = NEXT_TURN_WORDS[key] ?? NEXT_TURN_WORDS['111'];
  const i = Math.floor(rng() * q.length);
  return q[atLeastMedian ? Math.max(i, q.length / 2) : i];
}

/** The length part of the reminder, for a target in words. */
export function lengthLine(target: number): string {
  if (target <= 3) return 'THIS REPLY: a quick spoken reaction of two or three words, then stop.';
  if (target <= 7)
    return `THIS REPLY: just a few words, about ${target}, as a friend would say it.`;
  if (target <= 15) return `THIS REPLY: one sentence, about ${target} words.`;
  if (target <= 30) return `THIS REPLY: a sentence or two, about ${target} words.`;
  return `THIS REPLY: you have something to say here, so say it: a few spoken sentences, about ${target} words.`;
}

/** How each kind of roughness is written: commas only (dashes and ellipses are read aloud badly). */
const ROUGH_LINES: Record<string, string> = {
  opener:
    'Begin with the small sound or word people start with before the thought ("uh", "well", "oh"), then a comma.',
  pause:
    'Where you would really stop to find the next words, one "um" or "uh", with a comma either side.',
  restart:
    'Start one thought, then start it over or say the first word twice, joined with a comma ("I, I think", "we were, we went").',
  hedge:
    'If you are not quite sure of something you say, soften it once the way people do ("I mean", "kind of", "you know"); if you are sure, say it plainly.',
};
const CLEAN = 'Say it cleanly this time, with no fillers, hesitations or restarts.';

/** The roughness for a reply of `target` words: friends' rate for that size, in their form. */
export function textureLine(target: number, rng: () => number): { line: string; kind: string } {
  const size = bucket(target, [6, 15]);
  if (rng() >= ROUGH_SHARE[size]) return { line: CLEAN, kind: 'clean' };
  let r = rng();
  for (const [kind, p] of Object.entries(ROUGH_KINDS[size])) {
    if (r < p) return { line: ROUGH_LINES[kind], kind };
    r -= p;
  }
  return { line: ROUGH_LINES.restart, kind: 'restart' };
}

/** TURN_PLAN=on: what this reply has to pick up, read from the last turns (turn-plan in the harness). */
export function planLine(pickUp: string | undefined, env: Env = process.env): string {
  if (env.TURN_PLAN !== 'on' || !pickUp) return '';
  return `What your reply picks up: ${pickUp}. Respond to that, in your own words, and keep straight who did what.`;
}
