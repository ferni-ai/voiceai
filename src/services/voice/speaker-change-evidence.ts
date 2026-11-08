/**
 * How much a SpeakerChangeDetector must hear before it reports someone new,
 * and which voice it keeps as the reference.
 *
 * SPEAKER_CHECK_STRICT is on by default; `off` is the kill switch and restores
 * the old rule: 2 windows in a row unlike the reference confirm a change, and
 * the last of them alone becomes the new reference.
 *
 * Why strict: on the web, callers alone on a call saw "Someone new?" again and
 * again (prod, 2026-10). Two changes fired within ~25-40 s of each other, and
 * the second already had no previous speaker. One odd window (Ferni's own
 * voice leaking back from the speakers, a laugh, a cough) became the reference,
 * so the caller's real voice then read as someone else, and "Yes, it's me"
 * did not move the reference back. The thresholds were measured on six clean
 * TTS voices, not on a laptop microphone.
 *
 * Strict:
 * - a change needs STRICT_CHANGE_WINDOWS windows in a row that are unlike the
 *   reference AND like each other: a new person sounds like themselves, while a
 *   laugh, then a cough, then echo do not;
 * - the new reference is the average of those windows, not the last one;
 * - "Yes, it's me" re-anchors the reference to the caller's recent voice
 *   (SpeakerChangeDetector.reanchorToRecentVoice) and clears the count.
 * The caller's frames while Ferni is audible are not fed at all:
 * agents/voice-agent/speaker-change-feed.ts.
 *
 * @module services/voice/speaker-change-evidence
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { cosineSimilarity } from '../../memory/rust-accelerator.js';

/** Windows (2 s each) a strict change needs. */
const STRICT_CHANGE_WINDOWS = 3;

/** SPEAKER_CHECK_STRICT, read once per detector. */
export function speakerCheckStrict(env: Env = process.env): boolean {
  return flagOn('SPEAKER_CHECK_STRICT', env);
}

/** Element-wise mean of equal-length vectors. */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return embeddings[0];
  const result = new Array<number>(embeddings[0].length).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < emb.length; i++) result[i] += emb[i];
  }
  return result.map((sum) => sum / embeddings.length);
}

/**
 * The run of windows that scored unlike the reference. A window like the
 * reference ends it (`reset`).
 */
export class ChangeEvidence {
  private run: number[][] = [];
  private readonly windowsNeeded: number;

  constructor(
    private readonly strict: boolean,
    debounceCount: number
  ) {
    this.windowsNeeded = strict ? Math.max(debounceCount, STRICT_CHANGE_WINDOWS) : debounceCount;
  }

  /** Windows in the current run. */
  get count(): number {
    return this.run.length;
  }

  /**
   * Add a window that scored unlike the reference. Returns the new reference
   * once the change is confirmed (and starts over), else null. Strict: a
   * window unlike the run so far (`sameThreshold`) starts a new run.
   */
  addDifferent(embedding: number[], sameThreshold: number): number[] | null {
    if (this.strict && this.run.length > 0) {
      const runVoice = averageEmbeddings(this.run);
      if (cosineSimilarity(embedding, runVoice) < sameThreshold) this.run = [];
    }
    this.run.push(embedding);
    if (this.run.length < this.windowsNeeded) return null;
    const reference = this.strict ? averageEmbeddings(this.run) : embedding;
    this.run = [];
    return reference;
  }

  reset(): void {
    this.run = [];
  }
}
