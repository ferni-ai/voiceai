/**
 * What one reply does, learned from real friends: answer, add something, ask, react, agree or
 * push back.
 *
 * Blind next-turn test (scripts/voice-eval/next-turn, 2026-10-11): with its length fixed
 * (TURN_LENGTH=learned), the judge still spotted Ferni mostly for generic remarks (60% of the
 * pairs he lost), summing up what was said (25-30%) and not building on it (21-25%). Labelled by
 * move, nearly half his replies only reacted to or commented on what the caller said ("that's a
 * great part", "that's a hard pill to swallow"); friends do that in 16% of next turns. They
 * add something new in 25% (the next fact, more of the story, something of their own), push back
 * or tease in 15%, ask about a detail in 11%, answer 9% (32% after a question).
 *
 * TURN_MOVE=learned: each reply's move is drawn from friends' next turns in the same kind of
 * moment (their turn a question or not, its length, Ferni's own last turn;
 * turn-move-table.generated.ts, fitted by scripts/voice-eval/next-turn/fit-turn-move.mjs), and the
 * reminder says how to make that move concretely. No pushing back while they are hurting. Off by
 * default; a few microseconds per turn.
 *
 * @module agents/personas/turn-move
 */

import { MOVES, NEXT_MOVE } from './turn-move-table.generated.js';
import type { RecentTurns } from './turn-length.js';

export type Move = (typeof MOVES)[number];

export const moveLearned = (env: Record<string, string | undefined> = process.env): boolean =>
  env.TURN_MOVE === 'learned';

const countWords = (t: string): number => t.split(/\s+/).filter(Boolean).length;
const bucket = (x: number, edges: number[]): number => edges.filter((e) => x > e).length;

/** This reply's move, drawn from what friends do next in the same kind of moment. */
export function nextMove(
  said: string,
  recent: RecentTurns | undefined,
  careful: boolean,
  rng: () => number
): Move {
  const asked = /\?\s*$/.test(said.trim()) ? 1 : 0;
  const key = `${asked}${bucket(countWords(said), [6, 15])}${bucket(recent?.ferniLastWords ?? 0, [4, 12])}`;
  const shares = (NEXT_MOVE[key] ?? NEXT_MOVE['010']).map((p, i) =>
    careful && MOVES[i] === 'push_back' ? 0 : p
  );
  let r = rng() * shares.reduce((a, b) => a + b, 0);
  for (let i = 0; i < MOVES.length; i++) {
    if (r < shares[i]) return MOVES[i];
    r -= shares[i];
  }
  return 'add';
}

/** How to make each move, concretely: what friends do instead of commenting on what was said. */
export const MOVE_LINE: Record<Move, string> = {
  answer:
    'THIS REPLY ANSWERS: give a straight answer to what they asked or were getting at, from what you actually know or think.',
  add: 'THIS REPLY ADDS SOMETHING: carry what they said forward with something new and specific (the next detail, a fact you know, something of your own that connects, or a practical idea), not a comment on what they said.',
  ask: 'THIS REPLY ASKS: one short question about a specific thing they mentioned that you would actually want to know (who, which, when, how much), never how they feel.',
  react:
    'THIS REPLY JUST REACTS: how it really lands for you, in your own few words, without restating what they said.',
  agree:
    'THIS REPLY GOES ALONG: agree or confirm in a few words of your own, without repeating theirs.',
  push_back:
    'THIS REPLY PUSHES BACK A LITTLE: tease them, question it, or say where you see it differently, warmly and briefly.',
};
