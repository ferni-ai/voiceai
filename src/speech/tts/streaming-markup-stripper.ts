/**
 * Strips speech markup from a STREAMED reply before it reaches Cartesia.
 *
 * LLM replies stream in small chunks, and markup often arrives split across
 * two of them ("<break ti" + "me=\"80ms\"/>"). Stripping each chunk on its own
 * misses split tags, so fragments were spoken as words, and trimming each
 * chunk glued sentences together. This holds back an unfinished `<tag` or
 * `[cue` until it closes, removes it, and never trims across chunk
 * boundaries.
 *
 * Removed: XML-style tags (<break/>, <emotion/>, <speak>, ...) and bracketed
 * performance cues made of letters and spaces ([laughter], [sigh]). Kept:
 * real text such as "3 < 5" or "[1-10]".
 *
 * @module speech/tts/streaming-markup-stripper
 */

/** Past this length an unclosed `<` or `[` is treated as ordinary text. */
const MAX_PENDING = 80;

const TAG = /<\/?[A-Za-z][^>]*>/g;
const CUE = /\[[A-Za-z][A-Za-z ]{0,30}\]/g;
const DANGLING_TAG = /^<\/?[A-Za-z]?[^>]*$/;
const DANGLING_CUE = /^\[[A-Za-z][A-Za-z ]{0,30}$/;

export class StreamingMarkupStripper {
  private pending = '';
  private emittedAny = false;
  private lastEndedWithSpace = false;

  /** Add a chunk; returns the text that is safe to speak now. */
  push(chunk: string): string {
    const text = this.pending + chunk;
    const cut = this.findUnclosedStart(text);
    if (cut === -1) {
      this.pending = '';
      return this.emit(text);
    }
    this.pending = text.slice(cut);
    return this.emit(text.slice(0, cut));
  }

  /** End of stream: release what is left, dropping a dangling tag fragment. */
  flush(): string {
    const rest = this.pending;
    this.pending = '';
    if (DANGLING_TAG.test(rest) || DANGLING_CUE.test(rest)) return '';
    return this.emit(rest);
  }

  private findUnclosedStart(text: string): number {
    const lt = text.lastIndexOf('<');
    const lb = text.lastIndexOf('[');
    const start = Math.max(lt, lb);
    if (start === -1) return -1;
    const closer = start === lt ? '>' : ']';
    if (text.indexOf(closer, start) !== -1) return -1;
    const next = text.charAt(start + 1);
    const looksLikeMarkup =
      next === '' || (start === lt ? /[A-Za-z/]/.test(next) : /[A-Za-z]/.test(next));
    if (!looksLikeMarkup) return -1;
    if (text.length - start > MAX_PENDING) return -1;
    return start;
  }

  private emit(raw: string): string {
    if (raw === '') return '';
    let out = raw
      .replace(TAG, ' ')
      .replace(CUE, ' ')
      .replace(/[ \t]{2,}/g, ' ');
    if (!this.emittedAny || this.lastEndedWithSpace) out = out.replace(/^[ \t]+/, '');
    if (out === '') return '';
    this.emittedAny = true;
    this.lastEndedWithSpace = /[ \t]$/.test(out);
    return out;
  }
}
