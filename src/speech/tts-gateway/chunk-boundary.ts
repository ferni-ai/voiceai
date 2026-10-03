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
 * `isAbbreviationBoundary` below. Abbreviations are not all the same shape:
 * a TITLE ("Dr.", "Mrs.", "St.") is always followed by the name it
 * introduces, so its period is never a sentence end. A GENERAL abbreviation
 * ("etc.", "vs.", "p.m.") usually isn't either, but unlike a title it CAN
 * end a sentence ("...stuff, etc. Then we left.") — treating it as always
 * non-terminal ran the chunk past it to the 80-char fallback, cutting
 * mid-phrase. `isAbbreviationBoundary` tells the two apart.
 *
 * @module speech/tts-gateway/chunk-boundary
 */

import {
  TITLE_ABBREVIATIONS,
  GENERAL_ABBREVIATIONS,
} from '../../ssml/constants/common-abbreviations.js';

/** Lowercase lookups, split by whether the abbreviation can ever end a sentence. */
const TITLE_WORDS = new Set(TITLE_ABBREVIATIONS);
const GENERAL_WORDS = new Set(GENERAL_ABBREVIATIONS);

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

/** True when `text[matchEnd]` starts a capitalized word (the usual shape of a new sentence). */
function startsWithCapitalWord(text: string, matchEnd: number): boolean {
  return matchEnd < text.length && /[A-Z]/.test(text[matchEnd]);
}

/**
 * True when the punctuation run `text[matchStart..matchEnd)` is NOT a real
 * sentence end:
 * - a decimal ("3.50")
 * - a single initial ("U.S.", "J. Smith") — title-like, never terminal
 * - a title abbreviation ("Mrs.", "Dr.", "St.") — never terminal, the next
 *   word is the name it introduces regardless of capitalization
 * - a general abbreviation ("etc.", "vs.", "7 p.m.") — terminal only when
 *   followed by a capitalized word; otherwise still mid-sentence, or there
 *   isn't enough text yet to tell
 */
function isAbbreviationBoundary(text: string, matchStart: number, matchEnd: number): boolean {
  if (matchStart > 0 && /[0-9]/.test(text[matchStart - 1])) return true; // decimal: "3.50"

  // "7 p.m." / "7 a.m." — wordBefore() only finds "m" here (the first period
  // inside "p.m." breaks the letter run), so check the whole suffix instead.
  const isTimeAbbrev = /[ap]\.m$/i.test(text.slice(0, matchStart));
  if (isTimeAbbrev) return !startsWithCapitalWord(text, matchEnd);

  const word = wordBefore(text, matchStart);
  if (!word) return false;
  if (word.length === 1) return /[A-Z]/.test(word); // single initial: "U.S.", "J. Smith"

  const lower = word.toLowerCase();
  if (TITLE_WORDS.has(lower)) return true; // "Dr. Smith" stays joined either way
  if (GENERAL_WORDS.has(lower)) return !startsWithCapitalWord(text, matchEnd);
  return false;
}

/**
 * @returns the index right after the first real sentence end in `text`
 * starting the search from `fromIndex`, or null if there isn't one yet.
 */
export function findSentenceEnd(text: string, fromIndex = 0): number | null {
  SENTENCE_END_CANDIDATE.lastIndex = fromIndex;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END_CANDIDATE.exec(text)) !== null) {
    const matchEnd = match.index + match[0].length;
    if (!isAbbreviationBoundary(text, match.index, matchEnd)) {
      return matchEnd;
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
