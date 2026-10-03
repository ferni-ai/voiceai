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

/**
 * Longest run without sentence punctuation before a forced cut (a safety net
 * for text that never punctuates). It was 80, which split ordinary 80-120
 * character sentences mid-sentence; Cartesia paces and intonates from whole
 * sentences ("full sentences ... produce the best pacing and intonation") and
 * the reply stream sends with max_buffer_delay_ms 0, trusting whole sentences.
 */
const MAX_UNPUNCTUATED = 250;

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

/** Characters that will be spoken: markup (<...>, [...]) removed. */
function spokenLength(text: string): number {
  return text.replace(/<[^>]*>|\[[^\]]*\]/g, '').trim().length;
}

/** A clause break inside a sentence: , ; : or a dash or ellipsis, then whitespace. */
const CLAUSE_END = /(?<![0-9])(,|;|:|—|–|\.\.\.|…)\s/g;

/**
 * Where to cut the FIRST piece of a reply on a continuation context. Waiting
 * for a full sentence held the first audio until the LLM had streamed the
 * whole first sentence ("Friday? That's, what, forty-eight hours from now..."
 * waits for "now..."); a clause is enough to start speaking, and the
 * continuation keeps the pacing and intonation continuous across the cut.
 * Takes the earliest sentence end, or clause break at or after minLength.
 */
export function findFirstChunkEnd(buffer: string, minLength: number): number | null {
  if (buffer.length < minLength) return null;
  const candidates: number[] = [];
  const sentenceEnd = findSentenceEnd(buffer); // abbreviation-safe (#177)
  if (sentenceEnd !== null) candidates.push(sentenceEnd);
  for (const m of buffer.matchAll(CLAUSE_END)) {
    const end = (m.index ?? 0) + m[0].length;
    // Count spoken characters only: leading tags would let "Oh, " through.
    if (spokenLength(buffer.slice(0, end)) >= minLength) {
      candidates.push(end);
      break;
    }
  }
  // A short sentence may go first ("Friday? "); a clause must reach minLength
  // (no "Oh, " fragments).
  for (const end of candidates.sort((a, b) => a - b)) {
    const cut = markupSafeCut(buffer, end);
    if (cut !== null && cut > 0) return cut;
  }
  return findChunkEnd(buffer, minLength);
}

/**
 * Where to cut the first piece when the model is slow to reach a clause break:
 * after the last complete word, once at least `minSpoken` characters will be
 * spoken, never inside markup. Dev, 2026-09-30: waiting for a clause held text
 * already written for 148 ms at the median and 860 ms at p90 before any of it
 * went to Cartesia, while the caller heard nothing.
 */
export function findFirstWordEnd(buffer: string, minSpoken: number): number | null {
  for (let space = buffer.lastIndexOf(' '); space > 0; space = buffer.lastIndexOf(' ', space - 1)) {
    const end = space + 1;
    if (spokenLength(buffer.slice(0, end)) < minSpoken) return null;
    const cut = markupSafeCut(buffer, end);
    if (cut !== null && cut > 0 && spokenLength(buffer.slice(0, cut)) >= minSpoken) return cut;
  }
  return null;
}
