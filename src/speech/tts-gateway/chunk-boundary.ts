/**
 * Where the gateway may cut a streamed reply into a TTS chunk.
 *
 * Each chunk is sanitized and synthesized on its own, so a cut inside Cartesia
 * markup leaves half a tag in each chunk: the tag regexes match neither half
 * and the rest is read aloud ('<speed ratio="0.92"/>' became "ratio equals 0.92
 * slash"). Cuts therefore never land inside <...> or [...].
 *
 * @module speech/tts-gateway/chunk-boundary
 */

/**
 * Sentence end: punctuation followed by whitespace, or at the end of the buffer.
 * Neither form fires after a digit, so "3.50" streamed as "3." + "50" is not
 * cut at its decimal point.
 */
export const SENTENCE_END = /(?<![A-Z][a-z]|[A-Z]|[0-9])([.!?]+)\s|(?<![0-9])([.!?]+)$/;

/** Longest a chunk may grow without a sentence end before cutting at a space. */
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

  const match = buffer.match(SENTENCE_END);
  if (match?.index !== undefined) {
    const cut = markupSafeCut(buffer, match.index + match[0].length);
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
  const sentence = buffer.match(SENTENCE_END);
  if (sentence?.index !== undefined) candidates.push(sentence.index + sentence[0].length);
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
