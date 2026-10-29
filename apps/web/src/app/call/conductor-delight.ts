/**
 * Earned delight: Ferni celebrates what you DID, never how often you showed up.
 *
 * Checked twice. When a delight is asked for: a listed reason, never while
 * upset, within the per-call budget and the gap between any two delights.
 * And again at play time: a celebration write plays only for the run it was
 * earned for, and never once the user is upset or in crisis, so a delight that
 * was queued or already playing when the mood turned yields instead.
 */
import type { Mood } from './call-types.js';
import type { WriteContext } from './conductor.js';
import { upsetLike } from './conductor-mood.js';

type Size = 'small' | 'big';
/** A delight asked for: how big, and why. */
export interface DelightAsk {
  readonly size: Size;
  readonly reason?: string;
}
/** The sequence a moment plays, or why it is dropped. */
export type Verdict = { readonly play: string } | string;

/** The delight half of CONDUCTOR_POLICY. */
export interface DelightRules {
  readonly reasons: readonly string[];
  readonly perCall: Readonly<Record<Size, number>>;
  readonly minGapMs: number;
  /** Celebration sequences asked for directly, with the size and reason they count as. */
  readonly asSequence: Readonly<Record<string, DelightAsk>>;
}

const SEQUENCE_OF: Readonly<Record<Size, string>> = {
  small: 'celebration_small',
  big: 'celebration_big',
};
const sizeOf = (sequenceId: string): Size | null =>
  (Object.keys(SEQUENCE_OF) as Size[]).find((s) => SEQUENCE_OF[s] === sequenceId) ?? null;

/** One call's delight budget, and the celebrations it has earned. */
export class DelightLedger {
  private spent: Record<Size, number> = { small: 0, big: 0 };
  private lastAt = -Infinity;
  /** Earned, not yet playing, oldest first. */
  private waiting: Size[] = [];
  /** The run playing an earned celebration. */
  private playing: { readonly runId: number; readonly size: Size } | null = null;

  constructor(private readonly rules: DelightRules) {}

  /** The size and reason a sequence beat counts as, or undefined if it is no celebration. */
  askedAs(sequenceId: string): DelightAsk | undefined {
    return this.rules.asSequence[sequenceId];
  }

  /** Ask time: the celebration a delight earns, or why it is not earned. */
  ask({ size: asked, reason }: DelightAsk, mood: Mood, now: number): Verdict {
    if (upsetLike(mood)) return `delight:mood=${mood}`;
    if (!reason || !this.rules.reasons.includes(reason)) {
      return `delight:reason=${reason ?? 'none'}`;
    }
    const size = mood === 'tender' ? 'small' : asked;
    if (this.spent[size] >= this.rules.perCall[size]) return `delight:${size}:budget`;
    if (now - this.lastAt < this.rules.minGapMs) return `delight:${size}:gap`;
    this.spent[size] += 1;
    this.lastAt = now;
    this.waiting.push(size);
    return { play: SEQUENCE_OF[size] };
  }

  /** Play time: the drop reason for a celebration write, or null when it may play. */
  admit(w: WriteContext): string | null {
    const size = sizeOf(w.sequenceId);
    if (!size) return null;
    if (upsetLike(w.mood)) return `delight:${w.sequenceId}:mood=${w.mood}`;
    if (this.playing?.runId === w.runId) return null;
    const i = this.waiting.indexOf(size);
    if (i < 0) return `delight:${w.sequenceId}:unearned`;
    this.waiting.splice(i, 1);
    this.playing = { runId: w.runId, size };
    return null;
  }

  /** True only for writes of the run that earned a big celebration. */
  earnedBig(w: WriteContext): boolean {
    return this.playing?.runId === w.runId && this.playing.size === 'big';
  }

  /** A celebration playing or queued yields to upset or crisis. */
  yieldsTo(mood: Mood, sequenceId: string): boolean {
    return upsetLike(mood) && sizeOf(sequenceId) !== null;
  }

  /** Upset or crisis forgets every earned celebration; the budget they used stays spent. */
  onMood(mood: Mood): void {
    if (!upsetLike(mood)) return;
    this.waiting = [];
    this.playing = null;
  }
}
