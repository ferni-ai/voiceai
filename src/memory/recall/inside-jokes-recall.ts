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
 * The bits to bring back on this turn: the turn shares two distinctive words
 * with the bit's line, or one word that the bit itself names. One shared word
 * alone is how a greeting would match, so it doesn't count.
 */
export function jokesForTurn(jokes: InsideJokeRef[], text: string): InsideJokeRef[] {
  const said = jokeWords(text);
  return jokes.filter((j) => {
    const shared = [...jokeWords(j.quote)].filter((w) => said.has(w));
    return shared.length >= 2 || shared.some((w) => jokeWords(j.bit).has(w));
  });
}
