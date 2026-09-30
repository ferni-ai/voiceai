/**
 * Judgement between the notes for one reply.
 *
 * Several small systems each add a note to the next reply: repair, how they
 * asked to be talked to, an interruption, a day that matters, how they sound
 * today, humor, laughing along, a goodbye, name use. Each is right on its
 * own; together they need the judgement a friend has without thinking: no
 * teasing on the anniversary of a loss, no playfulness when they sound worn
 * out, and not so many instructions that the reply loses the thread.
 *
 * - Heavy notes (a loss today, a subdued voice, heavy words just said)
 *   silence light ones (playfulness, laughing along).
 * - What remains is ordered by priority and cut to a budget, dropping the
 *   least important first.
 *
 * Pure: ordering and filtering.
 *
 * @module conversation/cue-arbiter
 */

export type CueKind =
  | 'yielding'
  | 'repair'
  | 'talk'
  | 'leaving'
  | 'day'
  | 'voice'
  | 'laugh'
  | 'humor'
  | 'name';

export interface Cue {
  kind: CueKind;
  text: string;
  /** This moment is heavy: light notes do not belong in it. */
  heavy?: boolean;
  /** Playful: only when nothing heavy is present. */
  light?: boolean;
}

/** Lower comes first and is kept longest. */
const PRIORITY: Record<CueKind, number> = {
  yielding: 0,
  repair: 1,
  talk: 2,
  leaving: 3,
  day: 4,
  voice: 5,
  laugh: 6,
  humor: 7,
  name: 8,
};

/** Enough for several notes; past this the reply starts losing the thread. */
export const CUE_BUDGET_CHARS = 1400;

/** Why a note was left out of a reply. */
export interface DroppedCue {
  kind: CueKind;
  reason: 'heavy_moment' | 'budget';
}

/** The notes kept for this reply, and the ones left out and why. */
export function judgeCues(
  cues: readonly Cue[],
  budget: number = CUE_BUDGET_CHARS,
  heavyMoment = false
): { kept: Cue[]; dropped: DroppedCue[]; heavy: boolean } {
  const heavy = heavyMoment || cues.some((c) => c.heavy);
  const dropped: DroppedCue[] = [];
  const candidates: Cue[] = [];
  for (const c of cues) {
    if (heavy && c.light) dropped.push({ kind: c.kind, reason: 'heavy_moment' });
    else candidates.push(c);
  }
  candidates.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const kept: Cue[] = [];
  let used = 0;
  for (const c of candidates) {
    if (used + c.text.length > budget && kept.length > 0) {
      dropped.push({ kind: c.kind, reason: 'budget' });
      continue;
    }
    kept.push(c);
    used += c.text.length;
  }
  return { kept, dropped, heavy };
}

/** The notes for this reply: heavy moments first, light ones only when fitting, within budget. */
export function arbitrateCues(
  cues: readonly Cue[],
  budget: number = CUE_BUDGET_CHARS,
  heavyMoment = false
): string[] {
  return judgeCues(cues, budget, heavyMoment).kept.map((c) => c.text);
}
