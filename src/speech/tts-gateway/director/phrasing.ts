/**
 * Phrasing: where a reply is cut into pushes on the one Cartesia context.
 *
 * continuation-tts cuts the LLM stream at sentence ends, but a long sentence
 * with no end in sight is cut at an arbitrary space once it reaches 80
 * characters ("...that is a lot of | money to find..."), and Cartesia voices
 * each push as it arrives. The assembler re-cuts such a piece at its last
 * prosodic boundary (a comma, semicolon, colon or dash, else just before a
 * conjunction; not "so", which is as often "so much" as "so we went") and holds the tail until the next piece, so a push never ends
 * mid-phrase. Sentence-ended pieces pass through unchanged, the first piece
 * of a reply is never held (time to first audio), and a held fragment is
 * released once it grows past MAX_HOLD_CHARS.
 *
 * Abbreviation and decimal handling reuses findSentenceEnd (chunk-boundary,
 * PR #177); numbers and abbreviations are already normalized upstream.
 *
 * @module speech/tts-gateway/director/phrasing
 */

import { findSentenceEnd } from '../chunk-boundary.js';

/** Shortest head a cut may leave: shorter reads as a stutter. */
const MIN_PHRASE_CHARS = 20;
const MIN_PHRASE_WORDS = 3;
/** Shortest tail worth holding back for. */
const MIN_TAIL_CHARS = 2;
/** A held fragment this long goes out even without a boundary. */
const MAX_HOLD_CHARS = 200;

const PUNCTUATION_BOUNDARY = /(?:[,;:]|\s[—–-]|—)(?=\s)/g;
const CONJUNCTION_BOUNDARY =
  /\s(?=(?:and|but|because|or|though|although|while|which|when|where|if|until|unless)\s)/gi;

/** True when the text ends at a real sentence end (not "Mrs." or "3."). */
export function endsSentence(text: string): boolean {
  // Closing quotes/brackets after the punctuation still end the sentence.
  const t = text.trimEnd().replace(/["')\]]+$/, '');
  if (/(?:…|\.\.\.)$/.test(t)) return true;
  const end = /[.!?]+$/.exec(t);
  return end !== null && findSentenceEnd(t, end.index) !== null;
}

function insideMarkup(text: string, index: number): boolean {
  return (
    text.lastIndexOf('[', index - 1) > text.lastIndexOf(']', index - 1) ||
    text.lastIndexOf('<', index - 1) > text.lastIndexOf('>', index - 1)
  );
}

function usable(text: string, cut: number): boolean {
  const head = text.slice(0, cut).trim();
  const tail = text.slice(cut).trim();
  return (
    head.length >= MIN_PHRASE_CHARS &&
    head.split(/\s+/).length >= MIN_PHRASE_WORDS &&
    tail.length >= MIN_TAIL_CHARS &&
    !insideMarkup(text, cut)
  );
}

function lastMatchEnd(text: string, pattern: RegExp, useStart: boolean): number | null {
  let best: number | null = null;
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const cut = useStart ? m.index : m.index + m[0].length;
    if (usable(text, cut)) best = cut;
    if (m[0].length === 0) pattern.lastIndex++;
  }
  return best;
}

/**
 * Index to cut `text` at so the head ends on a phrase boundary, or null when
 * there is no boundary that leaves both sides usable.
 */
export function lastPhraseBoundary(text: string): number | null {
  return (
    lastMatchEnd(text, PUNCTUATION_BOUNDARY, false) ??
    lastMatchEnd(text, CONJUNCTION_BOUNDARY, true)
  );
}

/** True when the text ends on "..." / "…" (a trailing-off, or a pause mid-sentence). */
export function endsWithEllipsis(text: string): boolean {
  return /(?:\.\.\.|…)["')\]]*\s*$/.test(text);
}

export interface PhraseOptions {
  /** Re-cut a piece that ends mid-phrase at its last prosodic boundary. */
  reCut: boolean;
  /**
   * Hold a piece ending in "..." until the next one shows whether the
   * sentence goes on ("that's just..." + "huge news"): continuation-tts cuts
   * at "... " as a sentence end, and an ellipsis left at a push boundary
   * can't be told apart from a real trailing-off. Applies to the first piece
   * too: the text usually arrives well before the first audio.
   */
  holdEllipsis: boolean;
}

export class PhraseAssembler {
  private held = '';

  constructor(private readonly options: PhraseOptions = { reCut: true, holdEllipsis: true }) {}

  /** Take one cleaned piece; return the phrases to push now. */
  accept(piece: string, isFirst: boolean): string[] {
    const text = [this.held, piece.trim()].filter(Boolean).join(' ');
    this.held = '';
    if (!text) return [];
    if (this.options.holdEllipsis && endsWithEllipsis(text) && text.length < MAX_HOLD_CHARS) {
      this.held = text;
      return [];
    }
    if (!this.options.reCut || endsSentence(text)) return [text];

    const cut = lastPhraseBoundary(text);
    if (cut !== null) {
      this.held = text.slice(cut).trim();
      return [text.slice(0, cut).trim()];
    }
    if (isFirst || text.length >= MAX_HOLD_CHARS) return [text];
    this.held = text;
    return [];
  }

  /** The reply is over: release anything held. */
  flush(): string[] {
    const rest = this.held;
    this.held = '';
    return rest ? [rest] : [];
  }
}
