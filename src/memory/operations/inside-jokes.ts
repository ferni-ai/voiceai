/**
 * Inside jokes in conversation summaries: the prompt tail that asks the summary
 * model for them, and the parser that keeps only the ones with a line on file.
 *
 * A bit is kept only when the line it came from appears word for word in this
 * conversation (normalised for case and punctuation) and says who said it.
 * Anything the model invents, or any bare string from an older summary, has no
 * line and is dropped, so recall never brings back a bit that wasn't said.
 *
 * A kept bit holds at most 80 characters of the line and of the bit, and expires a year after
 * the call (Seth, 2026-10-26: utils/shared-moment-retention.ts). Recall skips an expired bit, and
 * after the next call the sweep (storage/summary-joke-retention.ts) takes it out of the summary.
 */

import type { InsideJokeRef } from '../../types/profile/inside-joke.js';
import {
  clampMomentWords,
  isMomentExpired,
  momentExpireAt,
} from '../../utils/shared-moment-retention.js';

const MAX_INSIDE_JOKES = 3;
const MIN_QUOTE_WORDS = 3;

/** Closes the summary JSON shape with the insideJokes field and says what counts. */
export const INSIDE_JOKES_PROMPT_TAIL = `  "insideJokes": [{"bit": "a few words on the bit", "quote": "the line it came from, copied word for word", "speaker": "user or assistant"}]
}

insideJokes: moments in THIS conversation that were genuinely funny between USER and ASSISTANT: both laughed, the user played along, or a bit got repeated. Each needs the exact line it came from, copied word for word from the conversation (at least three words), and who said it. Use [] if nothing was. Never invent one; a bit with no line from this conversation is left out. Leave out stock jokes or lines the assistant told on its own.`;

/** Lower-case words only, so case and punctuation don't decide whether a line matches. */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Words so common they say nothing about a bit: a line that only shares these isn't the bit. */
const FILLER = new Set([
  'really', 'should', 'though', 'because', 'people', 'actually', 'about', 'think', 'would',
  'could', 'going', 'something', 'things', 'there', 'their', 'where', 'which', 'these', 'those',
  'right', 'thing', 'still', 'maybe', 'anyway', 'always', 'never', 'every', 'before', 'after',
  'thanks', 'honestly', 'pretty', 'having', 'feeling', 'morning', 'evening', 'afternoon',
  'anything', 'everything', 'tonight', 'talking', 'calling', 'single', 'today', 'weekend',
  'hearing', 'friend', 'telling', 'good', 'great', 'doing', 'seeing', 'coming',
]);

/** A line as compared for sameness: its words, case and punctuation dropped. */
export const lineKey = (text: string): string => normalise(text);

/** The distinctive words in a text: at least six letters, not filler. */
export const jokeWords = (text: string): Set<string> =>
  new Set((normalise(text).match(/[\p{L}']{6,}/gu) ?? []).filter((w) => !FILLER.has(w)));

/**
 * The inside jokes the summary model reported, checked against the turns: each
 * kept bit has a quote found in one of the turns and that turn's speaker. At
 * most three, deduped by bit. Anything else yields [] rather than failing the summary.
 */
export function parseInsideJokes(
  raw: unknown,
  turns: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  now?: number // the clock, for tests; momentExpireAt reads it otherwise
): InsideJokeRef[] {
  if (!Array.isArray(raw)) return [];
  // Padded with spaces so a quote only matches whole words, never inside one.
  const said = turns.map((t) => ({ speaker: t.role, text: ` ${normalise(t.content)} ` }));
  const refs: InsideJokeRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { bit, quote, speaker } = item as Record<string, unknown>;
    if (typeof bit !== 'string' || typeof quote !== 'string') continue;
    if (speaker !== 'user' && speaker !== 'assistant') continue;
    const text = clampMomentWords(bit);
    const needle = normalise(quote);
    if (!text || needle.split(' ').length < MIN_QUOTE_WORDS) continue;
    // The line must be said by the speaker the model named, and the bit must name a word in it.
    const line = said.find((s) => s.speaker === speaker && s.text.includes(` ${needle} `));
    if (!line || [...jokeWords(text)].every((w) => !jokeWords(quote).has(w))) continue;
    const kept = clampMomentWords(quote); // checked whole above, kept cut
    if (refs.some((r) => r.bit.toLowerCase() === text.toLowerCase() || lineKey(r.quote) === lineKey(kept))) continue;
    refs.push({ bit: text, quote: kept, speaker, expireAt: momentExpireAt(now).toISOString() });
    if (refs.length >= MAX_INSIDE_JOKES) break;
  }
  return refs;
}

/** A summary's bits, and the earliest one's expiry: the after-call sweep finds the summary by it */
export interface SummaryInsideJokes {
  insideJokes?: InsideJokeRef[];
  insideJokesExpireAt?: string;
}

/** The summary fields for these bits: none for no bits, else the bits and their earliest expiry. */
export function summaryInsideJokes(jokes: InsideJokeRef[]): SummaryInsideJokes {
  if (jokes.length === 0) return {};
  const expiries = jokes.flatMap((j) => (j.expireAt ? [j.expireAt] : [])).sort();
  return { insideJokes: jokes, ...(expiries[0] && { insideJokesExpireAt: expiries[0] }) };
}

/** A stored bit past its expireAt: recall leaves it out. One with none (from before) never expires. */
export function jokeExpired(joke: object, now: number = Date.now()): boolean {
  return isMomentExpired(joke as { expireAt?: unknown }, now);
}
