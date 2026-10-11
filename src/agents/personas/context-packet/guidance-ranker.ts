/**
 * The one ranker for a turn's guidance notes (context-packet.ts). Each note has
 * a kind, the kinds have one order, and a note that pulls the opposite way from
 * a higher-ranked one on the same axis ("answer honestly" vs "stop explaining
 * your math") is dropped with the reason recorded. At most MAX_GUIDANCE survive.
 *
 * Order: safety/crisis > honesty/candor > the caller's explicit ask > director
 * notes > style nudges; ties keep the order given. Pure: no I/O, env or clock.
 *
 * @module agents/personas/context-packet/guidance-ranker
 */

export const GUIDANCE_KINDS = ['safety', 'honesty', 'caller-ask', 'director', 'style'] as const;
export type GuidanceKind = (typeof GUIDANCE_KINDS)[number];
export const MAX_GUIDANCE = 3;

/** What a note pushes on, and which way: notes on one axis with opposite signs conflict. */
export type Axes = Readonly<Record<string, 1 | -1>>;

export interface GuidanceNote {
  /** Stable within the turn, so a dropped note can be named in the receipt. */
  id: string;
  kind: GuidanceKind;
  /** The module it came from (director-notes.ts, crisis-gate.ts, ...). */
  source: string;
  text: string;
  /** From the injector when it knows; otherwise inferred from the text (inferAxes). */
  axes?: Axes;
}

export type DropReason = 'contradiction' | 'duplicate' | 'over-limit' | 'budget';

/** Ids, kinds and reasons only: the turn receipt keeps no note text. */
export interface DroppedNote {
  id: string;
  kind: GuidanceKind;
  source: string;
  reason: DropReason;
  /** The kept note it lost to (contradiction, duplicate). */
  by?: string;
}

export interface RankedGuidance {
  kept: GuidanceNote[];
  dropped: DroppedNote[];
}

/**
 * [pushes for, pushes against], whole words and phrases only: a bare "explain"
 * would match "they explained the plan", which pulls on nothing.
 */
const AXIS_PATTERNS: Readonly<Record<string, readonly [RegExp, RegExp]>> = {
  'say-how-you-know': [
    /\b(answer (them )?honestly|be honest|be straight|(tell (them|him|her)|say) (how|where) you (know|heard|learned)|name (the|your) source)\b/i,
    /\b(stop explaining|don[’']?t explain|do not explain|no need to explain|skip the explanation|don[’']?t justify|stop justifying)\b/i,
  ],
  'ask-a-question': [
    /\b(ask (them|him|her) (about|how|what|whether|if)|follow up on)\b/i,
    /\b(no more questions|don[’']?t ask|stop asking|fewer questions|too many questions)\b/i,
  ],
  'go-long': [
    /\b(explain (it )?(fully|in detail|step by step)|walk (them|him|her) through|go into detail)\b/i,
    /\b(keep it short|be brief|a few words|one sentence|shorter)\b/i,
  ],
};

export function inferAxes(text: string): Axes {
  const axes: Record<string, 1 | -1> = {};
  for (const [axis, [plus, minus]] of Object.entries(AXIS_PATTERNS)) {
    const up = plus.test(text);
    // A note that pushes both ways on one axis pushes neither.
    if (up !== minus.test(text)) axes[axis] = up ? 1 : -1;
  }
  return axes;
}

const rankOf = (kind: GuidanceKind): number => GUIDANCE_KINDS.indexOf(kind);
const axesOf = (note: GuidanceNote): Axes => note.axes ?? inferAxes(note.text);
const normal = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();
const conflict = (a: Axes, b: Axes): boolean =>
  Object.entries(a).some(([axis, sign]) => b[axis] !== undefined && b[axis] !== sign);

/** Rank, resolve contradictions and cap. The same notes in the same order give the same result. */
export function rankGuidance(notes: readonly GuidanceNote[], limit = MAX_GUIDANCE): RankedGuidance {
  const order = notes
    .map((note, i) => ({ note, i }))
    .sort((x, y) => rankOf(x.note.kind) - rankOf(y.note.kind) || x.i - y.i)
    .map(({ note }) => note);
  const kept: GuidanceNote[] = [];
  const dropped: DroppedNote[] = [];
  const drop = (note: GuidanceNote, reason: DropReason, by?: string): void => {
    dropped.push({ id: note.id, kind: note.kind, source: note.source, reason, ...(by && { by }) });
  };
  for (const note of order) {
    if (!note.text.trim()) continue;
    const same = kept.find((k) => normal(k.text) === normal(note.text));
    const winner = same ? undefined : kept.find((k) => conflict(axesOf(k), axesOf(note)));
    if (same) drop(note, 'duplicate', same.id);
    else if (winner) drop(note, 'contradiction', winner.id);
    else if (kept.length >= limit) drop(note, 'over-limit');
    else kept.push(note);
  }
  return { kept, dropped };
}
