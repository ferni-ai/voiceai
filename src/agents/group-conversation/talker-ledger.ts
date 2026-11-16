/**
 * Who was loud when, on a call where several people share one audio stream.
 *
 * The room mix notes every person's level for each 10 ms frame. Later, when STT
 * finishes a turn, `dominant(from, to)` says whose voice filled that window, so
 * the turn can be labelled with the right speaker. Pure: no clocks, no I/O;
 * callers stamp notes with `mixClock()` from room-mix-input.
 */

/** A frame at or above this RMS (int16 units) counts as someone talking. */
export const VOICED_RMS = 500;

/** Each note stands for one 10 ms frame of the mix. */
export const FRAME_MS = 10;

/** Voiced frames older than this, measured from the newest note, are forgotten. */
export const LEDGER_RETENTION_MS = 60_000;

interface VoicedFrame {
  identity: string;
  atMs: number;
}

export class TalkerLedger {
  /** Voiced frames only, oldest first. */
  private frames: VoicedFrame[] = [];

  /** `owner` is the caller whose call this is; ties go to them. */
  constructor(readonly owner: string) {}

  /** Records one 10 ms frame of `identity` at `atMs` with level `rms`. */
  note(identity: string, atMs: number, rms: number): void {
    if (rms >= VOICED_RMS) this.frames.push({ identity, atMs });
    this.forgetBefore(atMs - LEDGER_RETENTION_MS);
  }

  /**
   * The person voiced for the most time in `[fromMs, toMs)`, or null if nobody
   * was voiced. A tie goes to the owner.
   */
  dominant(fromMs: number, toMs: number): string | null {
    const voicedMs = new Map<string, number>();
    for (const frame of this.frames) {
      if (frame.atMs < fromMs || frame.atMs >= toMs) continue;
      voicedMs.set(frame.identity, (voicedMs.get(frame.identity) ?? 0) + FRAME_MS);
    }
    let best: string | null = null;
    let bestMs = 0;
    for (const [identity, ms] of voicedMs) {
      const beats = ms > bestMs || (ms === bestMs && identity === this.owner);
      if (beats) {
        best = identity;
        bestMs = ms;
      }
    }
    return best;
  }

  private forgetBefore(cutoffMs: number): void {
    let drop = 0;
    while (drop < this.frames.length && (this.frames[drop]?.atMs ?? Infinity) < cutoffMs) drop++;
    if (drop > 0) this.frames.splice(0, drop);
  }
}
