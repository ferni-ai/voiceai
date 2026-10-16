/**
 * Inside jokes in conversation summaries: the prompt tail that asks the summary
 * model for them, and the parser that keeps only the ones with a line on file.
 *
 * A bit is kept only when the line it came from appears word for word in this
 * conversation (normalised for case and punctuation) and says who said it.
 * Anything the model invents, or any bare string from an older summary, has no
 * line and is dropped, so recall never brings back a bit that wasn't said.
 */

import type { InsideJokeRef } from '../../types/profile/inside-joke.js';

const MAX_INSIDE_JOKES = 3;
const MAX_BIT_LENGTH = 140;
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
  turns: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
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
    const text = bit.trim().slice(0, MAX_BIT_LENGTH);
    const needle = normalise(quote);
    if (!text || needle.split(' ').length < MIN_QUOTE_WORDS) continue;
    // The line must be said by the speaker the model named, and the bit must name a word in it.
    const line = said.find((s) => s.speaker === speaker && s.text.includes(` ${needle} `));
    if (!line || [...jokeWords(text)].every((w) => !jokeWords(quote).has(w))) continue;
    if (refs.some((r) => r.bit.toLowerCase() === text.toLowerCase() || lineKey(r.quote) === lineKey(quote))) continue;
    refs.push({ bit: text, quote: quote.trim(), speaker });
    if (refs.length >= MAX_INSIDE_JOKES) break;
  }
  return refs;
}
