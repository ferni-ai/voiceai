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
/** Leading markup, then a sigh cue: the reply opens with a sigh. */
const LEAD = String.raw`^(?:\s|<[^>]*>)*`;
const OPENING_SIGH = new RegExp(
  LEAD + String.raw`(?:\[(?:[a-z]+\s+)?sighs?\]|\*sighs?\*|\((?:[a-z]+\s+)?sighs?\))`,
  'i'
);
/** The behavior tool's sigh (tools/domains/behavior PRESENCE_SSML.sigh): spoken "Ahh.". */
const OPENING_SPOKEN_SIGH = new RegExp(
  LEAD + String.raw`<emotion\s+value=["']gentle["']\s*\/>\s*ahh`,
  'i'
);
/** A laughter cue the LLM wrote (the SSML processor maps all of these to [laughter]). */
const LAUGHTER_CUE = /\[(?:laughs?|laughter|laughing|chuckles?|chuckling|warm laugh|big laugh)\]/i;
/** How much of the raw reply's start is kept to read its opening. */
const HEAD = 160;
/** Longest cue we expect to straddle a chunk boundary. */
const OVERLAP = 64;

export class RawCues {
  authoredEmotion?: string;
  /** Time spent scanning the raw stream, counted in the reply's latency. */
  elapsedNs = 0n;
  /** Characters scanned in total: stays linear in the reply's length. */
  scannedChars = 0;
  failed = false;
  /** The reply opens with a sigh cue (any form). */
  opensWithSigh = false;
  /** ...and that cue is the behavior tool's spoken "Ahh." (its text must go). */
  opensWithSpokenSigh = false;
  /** The LLM already wrote a laughter cue in this reply. */
  sawLaughter = false;
  private head = '';
  private tail = '';
  private seenSighs = 0;
  private placedSighs = 0;

  see(chunk: string): void {
    if (this.failed) return;
    const start = process.hrtime.bigint();
    try {
      const text = this.tail + chunk;
      this.scannedChars += text.length;
      this.readOpening(chunk);
      if (!this.sawLaughter) this.sawLaughter = LAUGHTER_CUE.test(text);
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

  private readOpening(chunk: string): void {
    if (this.head.length >= HEAD || this.opensWithSigh) return;
    this.head = (this.head + chunk).slice(0, HEAD);
    this.opensWithSpokenSigh = OPENING_SPOKEN_SIGH.test(this.head);
    this.opensWithSigh = this.opensWithSpokenSigh || OPENING_SIGH.test(this.head);
  }

  takeSighs(): number {
    const n = this.seenSighs - this.placedSighs;
    this.placedSighs = this.seenSighs;
    return n;
  }
}
