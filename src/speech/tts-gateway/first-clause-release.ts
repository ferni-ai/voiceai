/**
 * FIRST_CLAUSE_TTS: the first piece of a reply goes to TTS at its first
 * clause break instead of its first sentence end (#1505, "speak sooner").
 *
 * The sentence-overlap path (gateway-tts-node.ts, STREAMING_TTS_OVERLAP)
 * cuts every piece at a sentence end, so the caller hears nothing until the
 * model has written its whole first sentence. With the flag on, the first
 * piece may end at a comma, semicolon or colon once at least
 * FIRST_CLAUSE_MIN_CHARS spoken characters are written; every later piece
 * keeps the sentence cut. Dashes and ellipses are not clause breaks here.
 *
 * Commas inside numbers never cut: "1,000" has no space after its comma, and
 * a digit followed by a comma at the end of what has arrived ("$1,") waits
 * for the next token, which may be "000". Colons in times ("7:30") likewise.
 *
 * This only decides where the text the TTS node receives is cut. The reply
 * guards (name gate, action-claim guard, tool lead-in, crisis hold) run in
 * the agent's llmNode, before the text reaches TTS, so nothing they hold can
 * be released earlier by this cut.
 *
 * @module speech/tts-gateway/first-clause-release
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { findChunkEnd } from './chunk-boundary.js';

/** Spoken characters the first clause needs before it may go out ("Oh, " may not). */
export const FIRST_CLAUSE_MIN_CHARS = 12;

/** A comma, semicolon or colon followed by whitespace or the end of what has arrived. */
const CLAUSE_BREAK = /[,;:](?=\s|$)/g;

export function firstClauseTtsEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_CLAUSE_TTS', env);
}

/** Characters that will be spoken: markup (<...>, [...]) removed. */
function spokenLength(text: string): number {
  return text.replace(/<[^>]*>|\[[^\]]*\]/g, '').trim().length;
}

function insideMarkup(text: string, index: number): boolean {
  return (
    text.lastIndexOf('<', index) > text.lastIndexOf('>', index) ||
    text.lastIndexOf('[', index) > text.lastIndexOf(']', index)
  );
}

/**
 * @returns the index just past the first clause break with at least
 *   `minChars` spoken characters before it, or null when there isn't one yet
 */
export function findFirstClauseEnd(
  buffer: string,
  minChars: number = FIRST_CLAUSE_MIN_CHARS
): number | null {
  for (const m of buffer.matchAll(CLAUSE_BREAK)) {
    const at = m.index + 1;
    const atEnd = at === buffer.length;
    // "$1," may still become "$1,000": wait for the next character.
    if (atEnd && /[0-9]/.test(buffer[m.index - 1] ?? '')) continue;
    if (insideMarkup(buffer, m.index)) continue;
    if (spokenLength(buffer.slice(0, at)) < minChars) continue;
    return atEnd ? at : at + 1; // take the space after the break with it
  }
  return null;
}

/**
 * Where to cut the first piece of a reply: the sentence cut (findChunkEnd),
 * or with FIRST_CLAUSE_TTS on, whichever of that and the first clause break
 * comes first.
 */
export function findFirstReleaseEnd(
  buffer: string,
  minLength: number,
  env: Env = process.env
): number | null {
  const sentenceCut = findChunkEnd(buffer, minLength);
  if (!firstClauseTtsEnabled(env)) return sentenceCut;
  const clauseCut = findFirstClauseEnd(buffer);
  if (clauseCut === null) return sentenceCut;
  return sentenceCut === null ? clauseCut : Math.min(clauseCut, sentenceCut);
}
