/**
 * Fitting humor to the person.
 *
 * Some people laugh easily and light up at playfulness; others rarely laugh
 * on these calls, and jokes land as not listening. A friend calibrates to
 * each person over time. The live call already hears every laugh; counted
 * across calls, that says how much playfulness this caller welcomes.
 *
 * Pure: the read and its wording. Counting lives with the laugh recorder.
 *
 * @module conversation/humor-fit
 */

export interface HumorHistory {
  /** Calls counted (with at least a couple of turns). */
  calls: number;
  /** Laughs heard across those calls. */
  laughs: number;
}

/** Calls before reading anything into it. */
const MIN_CALLS = 3;
/** With no laughs at all, a little longer before concluding they rarely laugh. */
const MIN_CALLS_QUIET = 4;
/** A laugh a call on average is someone who laughs easily with you. */
const EASY_RATE = 1;

export const PLAYFUL_CUE =
  '[THEIR SENSE OF HUMOR] They laugh easily with you: playfulness and light teasing are welcome when the moment is light.';

export const GENTLE_CUE =
  '[THEIR SENSE OF HUMOR] They rarely laugh on these calls: keep humor light and rare; warmth over jokes.';

/** The cue for this caller, or null when there is no clear read yet. */
export function humorCue(history: HumorHistory | null | undefined): string | null {
  if (!history || history.calls < MIN_CALLS) return null;
  if (history.laughs / history.calls >= EASY_RATE) return PLAYFUL_CUE;
  if (history.laughs === 0 && history.calls >= MIN_CALLS_QUIET) return GENTLE_CUE;
  return null;
}
