/**
 * Shared bits on the recall side: whether they're shown at all (INSIDE_JOKES)
 * and which ones touch what the caller is saying now.
 */

import type { InsideJokeRef } from '../../types/profile/inside-joke.js';
import { jokeWords } from '../operations/inside-jokes.js';

/**
 * INSIDE_JOKES=on lets Ferni bring back a bit the two of them really shared
 * (off by default). Only things the summarizer saw land in a past call qualify,
 * never stock jokes, so Ferni can't fake a history it doesn't have.
 */
export function insideJokesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.INSIDE_JOKES === 'on';
}

/**
 * The bits whose line shares a word with what the caller is saying now, so a
 * bit comes back on a turn that touches it and not at the greeting. Bits with
 * no shared word stay out of this turn.
 */
export function jokesForTurn(jokes: InsideJokeRef[], text: string): InsideJokeRef[] {
  const said = jokeWords(text);
  return jokes.filter((j) => [...jokeWords(j.quote)].some((w) => said.has(w)));
}
