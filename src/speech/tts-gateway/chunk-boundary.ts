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
