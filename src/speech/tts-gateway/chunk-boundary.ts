/**
 * Where the gateway may cut a streamed reply into a TTS chunk.
 *
 * Each chunk is sanitized and synthesized on its own, so a cut inside Cartesia
 * markup leaves half a tag in each chunk: the tag regexes match neither half
 * and the rest is read aloud ('<speed ratio="0.92"/>' became "ratio equals 0.92
 * slash"). Cuts therefore never land inside <...> or [...].
 *
 * Sentence-end detection also has to avoid abbreviations ("Mrs. Johnson",
 * "etc.", "vs.") and decimals/times ("3.50", "7 p.m.") — see
 * `isAbbreviationBoundary` below.
 *
 * @module speech/tts-gateway/chunk-boundary
 */

import { SENTENCE_BOUNDARY_ABBREVIATIONS } from '../../ssml/constants/common-abbreviations.js';

/** Lowercase lookup of title/abbreviation words that precede a non-ending period. */
const ABBREVIATION_WORDS = new Set(SENTENCE_BOUNDARY_ABBREVIATIONS);

/**
 * Candidate sentence ends: a run of ./!/? followed by whitespace or the end
 * of the buffer. Each candidate is then checked by `isAbbreviationBoundary`
 * before it's accepted — a fixed-width lookbehind can't tell "Mrs." from a
 * real sentence end, since the two characters before both periods are
 * ordinary lowercase letters.
 */
const SENTENCE_END_CANDIDATE = /([.!?]+)(\s|$)/g;

/** The run of letters immediately before `index` in `text` (no trailing partial match). */
function wordBefore(text: string, index: number): string {
  let i = index;
  while (i > 0 && /[A-Za-z]/.test(text[i - 1])) i--;
  return text.slice(i, index);
}

/**
 * True when the punctuation run starting at `index` is NOT a real sentence
 * end: a decimal ("3.50"), a single initial ("U.S.", "J. Smith"), a time
 * ("7 p.m."), or a known title/abbreviation ("Mrs.", "etc.", "vs.").
 */
function isAbbreviationBoundary(text: string, index: number): boolean {
  if (index > 0 && /[0-9]/.test(text[index - 1])) return true; // decimal: "3.50"

  const before = text.slice(0, index);
  if (/[ap]\.m$/i.test(before)) return true; // "7 p.m." / "7 a.m."

  const word = wordBefore(text, index);
  if (!word) return false;
  if (word.length === 1) return /[A-Z]/.test(word); // single initial: "U.S.", "J. Smith"
  return ABBREVIATION_WORDS.has(word.toLowerCase());
}

/**
 * @returns the index right after the first real sentence end in `text`
 * starting the search from `fromIndex`, or null if there isn't one yet.
 */
function findSentenceEnd(text: string, fromIndex = 0): number | null {
  SENTENCE_END_CANDIDATE.lastIndex = fromIndex;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END_CANDIDATE.exec(text)) !== null) {
    if (!isAbbreviationBoundary(text, match.index)) {
      return match.index + match[0].length;
    }
    // Abbreviation: keep scanning right after this punctuation run so an
    // infinite loop isn't possible on a zero-width continuation.
    SENTENCE_END_CANDIDATE.lastIndex = match.index + match[1].length;
  }
  return null;
}

/** Longest a chunk may grow without a sentence end before cutting at a space. */
const MAX_UNPUNCTUATED = 80;

/** True when `index` falls inside an unclosed `open`...`close` span of `text`. */
function insideSpan(text: string, index: number, open: string, close: string): boolean {
  return text.lastIndexOf(open, index - 1) > text.lastIndexOf(close, index - 1);
}

/**
 * Move a proposed cut out of any markup it lands in: back to just before the
 * tag when there is text before it, otherwise past the tag's end. Returns null
 * when the tag is still streaming in and there is nothing safe to cut yet.
 */
function markupSafeCut(text: string, end: number): number | null {
  for (const [open, close] of [
    ['<', '>'],
    ['[', ']'],
  ] as const) {
    if (!insideSpan(text, end, open, close)) continue;
    const start = text.lastIndexOf(open, end - 1);
    if (start > 0) return start;
    const tagEnd = text.indexOf(close, end);
    return tagEnd === -1 ? null : tagEnd + 1;
  }
  return end;
}

/**
 * @returns the index to cut the buffer at, or null to keep buffering
 */
export function findChunkEnd(buffer: string, minLength: number): number | null {
  if (buffer.length < minLength) return null;

  const sentenceEnd = findSentenceEnd(buffer);
  if (sentenceEnd !== null) {
    const cut = markupSafeCut(buffer, sentenceEnd);
    if (cut !== null && cut > 0) return cut;
  }

  if (buffer.length >= MAX_UNPUNCTUATED) {
    const space = buffer.lastIndexOf(' ', MAX_UNPUNCTUATED);
    const anySpace = space > 0 ? space : buffer.indexOf(' ');
    const cut = markupSafeCut(buffer, anySpace > 0 ? anySpace + 1 : MAX_UNPUNCTUATED);
    if (cut !== null && cut > 0) return cut;
  }

  return null;
}
