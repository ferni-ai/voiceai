/**
 * What the raw LLM text says before the SSML processor strips it: the
 * emotion the LLM wrote, and the sighs it asked for.
 *
 * Runs on every token in shadow and live, so it is incremental (each chunk is
 * scanned once, with a short overlap so a cue split across chunks is still
 * seen) and it never throws: a failure here would error the text stream, and
 * continuation-tts cancels the reply on a text-stream error with no verbatim
 * fallback. After a failure it stops looking and reports what it saw.
 *
 * @module speech/tts-gateway/director/raw-cues
 */

/** Needs the closing quote/slash so "<emotion value="sym" + "pathetic"/>" reads whole. */
const AUTHORED_EMOTION = /<emotion\s+value=["']?([a-z_]+)["'\s/>]/i;
const SIGH_CUE = /\[(?:[a-z]+\s+)?sighs?\]|\*sighs?\*|\((?:[a-z]+\s+)?sighs?\)/gi;
/** Longest cue we expect to straddle a chunk boundary. */
const OVERLAP = 64;

export class RawCues {
  authoredEmotion?: string;
  /** Time spent scanning the raw stream, counted in the reply's latency. */
  elapsedNs = 0n;
  /** Characters scanned in total: stays linear in the reply's length. */
  scannedChars = 0;
  failed = false;
  private tail = '';
  private seenSighs = 0;
  private placedSighs = 0;

  see(chunk: string): void {
    if (this.failed) return;
    const start = process.hrtime.bigint();
    try {
      const text = this.tail + chunk;
      this.scannedChars += text.length;
      if (this.authoredEmotion === undefined) {
        this.authoredEmotion = AUTHORED_EMOTION.exec(text)?.[1]?.toLowerCase();
      }
      // A cue that ended inside the tail was counted by the previous scan.
      SIGH_CUE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = SIGH_CUE.exec(text)) !== null) {
        if (m.index + m[0].length > this.tail.length) this.seenSighs++;
      }
      this.tail = text.slice(-OVERLAP);
    } catch {
      this.failed = true;
    } finally {
      this.elapsedNs += process.hrtime.bigint() - start;
    }
  }

  takeSighs(): number {
    const n = this.seenSighs - this.placedSighs;
    this.placedSighs = this.seenSighs;
    return n;
  }
}
