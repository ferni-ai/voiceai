/**
 * One turn's second read (CRISIS_CLASSIFIER_SECOND_READ), shared by the reply gate and the turn
 * pipeline. The gate reads its chat context; the pipeline reads recentTranscripts, which can be a
 * shorter window, stale, or empty (#2615). Each deciding from its own lines let the pipeline fill
 * a turn the gate read as a worry about someone else, replacing that guidance with the caller's
 * 988 script (#2587: 98 of 11,712 rows). So the gate decides once per turn whether v3 may fill;
 * the pipeline fills only where the gate decided fill and read every line the pipeline reads (no
 * decision yet: no fill); and a fill about the caller stands only once the other path has noted
 * the turn (the gate waits for the pipeline, bounded) and no read of it is about someone else.
 * Per call, in memory, for 30 seconds.
 *
 * @module CrisisSecondReadTurn
 */

import { crisisTurnOf } from './crisis-call-risk.js';
import type { CrisisClassifierInput } from './crisis-classifier.js';

export type SecondReadPath = 'gate' | 'pipeline';

/** One path's view of a turn: what its classifier read sees. */
export type SecondReadView = CrisisClassifierInput;

/** The caller's latest words and Ferni's line before them, letters and digits only. */
const turnOf = (view: SecondReadView) => ({
  text: crisisTurnOf(view.latest),
  companion: crisisTurnOf(view.companion ?? ''),
});

interface TurnNote extends ReturnType<typeof turnOf> {
  path: SecondReadPath;
  at: number;
  /** Every line this path read, the same way: what the gate's decision covers. */
  lines: string[];
  /** The gate's decision: v3 may fill this turn. */
  fill: boolean;
  /** This path's patterns or base read are about someone else. Never rejects. */
  thirdParty: Promise<boolean>;
}

const TTL_MS = 30_000;
const MAX_CALLS = 64;
const MAX_NOTES = 32;
const notes = new Map<string, TurnNote[]>();
const waiters = new Map<string, Set<() => void>>();

const linesOf = (view: SecondReadView): string[] =>
  [view.latest, ...view.earlier].map(crisisTurnOf).filter(Boolean);

function notesOf(call: string, now = Date.now()): TurnNote[] {
  const kept = (notes.get(call) ?? []).filter((n) => now - n.at <= TTL_MS);
  if (kept.length) notes.set(call, kept);
  else notes.delete(call);
  return kept;
}

/** One turn on both paths: the gate's joined lines end with the pipeline's last line. */
const gateEndsWith = (gate: string, pipeline: string): boolean =>
  !!pipeline && (gate === pipeline || gate.endsWith(` ${pipeline}`));

export function noteSecondReadTurn(
  call: string | undefined,
  path: SecondReadPath,
  view: SecondReadView,
  fill: boolean,
  thirdParty: Promise<boolean>
): void {
  if (!call) return;
  const kept = notesOf(call);
  if (!notes.has(call) && notes.size >= MAX_CALLS) notes.delete(notes.keys().next().value ?? '');
  const note = { ...turnOf(view), path, at: Date.now(), lines: linesOf(view), fill };
  notes.delete(call); // most recently noted call last
  notes.set(
    call,
    [...kept, { ...note, thirdParty: thirdParty.catch(() => true) }].slice(-MAX_NOTES)
  );
  for (const check of [...(waiters.get(call) ?? [])]) check();
}

/** The pipeline: the gate decided fill, having read every line the pipeline reads. */
export function gateDecidedFill(call: string | undefined, view: SecondReadView): boolean {
  const { text, companion } = turnOf(view);
  const lines = linesOf(view);
  const gate = (call ? notesOf(call) : []).filter(
    (n) => n.path === 'gate' && n.companion === companion && gateEndsWith(n.text, text)
  );
  // No gate decision yet, or any gate read of the turn that said no: no fill.
  return (
    gate.length > 0 &&
    gate.every((n) => n.fill && lines.every((line) => n.lines.some((seen) => seen.includes(line))))
  );
}

/**
 * Whether a fill about the caller may stand on this path: the other path has noted the turn (the
 * gate waits up to waitMs for the pipeline), and no read of the turn is about someone else.
 */
export async function selfFillStands(
  call: string | undefined,
  path: SecondReadPath,
  view: SecondReadView,
  waitMs: number
): Promise<boolean> {
  if (!call) return false;
  const { text, companion } = turnOf(view);
  const noted = (): boolean =>
    notesOf(call).some(
      (n) =>
        n.path !== path &&
        n.companion === companion &&
        (path === 'gate' ? gateEndsWith(text, n.text) : gateEndsWith(n.text, text))
    );
  const set = waiters.get(call) ?? new Set<() => void>();
  const found =
    noted() ||
    (await new Promise<boolean>((resolve) => {
      const done = (seen: boolean): void => {
        clearTimeout(timer);
        set.delete(check);
        if (!set.size) waiters.delete(call);
        resolve(seen);
      };
      const check = (): void => void (noted() && done(true));
      const timer = setTimeout(() => done(false), waitMs);
      waiters.set(call, set.add(check));
    }));
  // Any note of the same turn, either way round: a wider match only drops more fills.
  const turn = notesOf(call).filter(
    (n) =>
      n.companion === companion &&
      !!text &&
      !!n.text &&
      (n.text.includes(text) || text.includes(n.text))
  );
  return found && !(await Promise.all(turn.map((n) => n.thirdParty))).some(Boolean);
}

/** For tests: forget every turn. */
export function resetSecondReadTurns(): void {
  notes.clear();
  waiters.clear();
}
