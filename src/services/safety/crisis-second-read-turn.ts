/**
 * One turn's second read (CRISIS_CLASSIFIER_SECOND_READ), shared by the reply gate and the turn
 * pipeline, whose lines for a turn differ (a shorter window, stale, or empty: #2615, #2587). The
 * gate decides once per turn whether v3 may fill; the pipeline fills only where the gate decided
 * fill for the same turn (no decision yet: no fill); a fill about the caller stands only once the
 * other path has noted the turn (the gate waits, bounded) and no read of it is about someone else
 * or failed. A turn is the call's turnCount, which both paths read (one per final transcript),
 * never the caller's words: those matched an earlier turn that ended alike (#2666 round 1). A
 * turn's notes expire when the call's next turn is noted. No turn count: no notes, no fill.
 *
 * @module CrisisSecondReadTurn
 */

export type SecondReadPath = 'gate' | 'pipeline';

interface TurnNote {
  path: SecondReadPath;
  /** The gate's decision: v3 may fill this turn. */
  fill: boolean;
  /** This path's patterns or base read are about someone else, or the read failed. */
  thirdParty: Promise<boolean>;
}

const MAX_CALLS = 64;
/** Per call, its latest turn's notes only; the least recently noted call goes first. */
const turns = new Map<string, { turn: number; notes: TurnNote[] }>();
const waiters = new Map<string, Set<() => void>>();

/** The turn count, when it is one: a positive integer. */
export const turnOf = (count: unknown): number | undefined =>
  typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : undefined;

/** A path's second-read options: its user data's turn count, and its patterns' subject. */
export const secondReadOf = (path: SecondReadPath, userData: unknown, subject?: string) => ({
  path,
  count: (userData as { turnCount?: unknown } | undefined)?.turnCount,
  thirdParty: subject === 'third_party',
});

const notesOf = (call: string | undefined, turn: number | undefined): TurnNote[] | undefined => {
  const kept = call === undefined ? undefined : turns.get(call);
  return kept?.turn === turn ? kept?.notes : undefined;
};

export function noteSecondReadTurn(
  call: string | undefined,
  turn: number | undefined,
  path: SecondReadPath,
  fill: boolean,
  thirdParty: Promise<boolean>
): void {
  if (!call || turn === undefined) return;
  const kept = turns.get(call);
  if (kept && kept.turn > turn) return; // that turn is over
  if (!kept && turns.size >= MAX_CALLS) turns.delete(turns.keys().next().value ?? '');
  const notes = kept && kept.turn === turn ? kept.notes : []; // a new turn: the last one expires
  notes.push({ path, fill, thirdParty: thirdParty.catch(() => true) });
  turns.delete(call);
  turns.set(call, { turn, notes });
  for (const check of [...(waiters.get(call) ?? [])]) check();
}

/** The pipeline: the gate decided this turn may be filled, and no gate read of it said no. */
export function gateDecidedFill(call: string | undefined, turn: number | undefined): boolean {
  const gate = (notesOf(call, turn) ?? []).filter((n) => n.path === 'gate');
  return gate.length > 0 && gate.every((n) => n.fill);
}

/**
 * Whether a fill about the caller may stand on this path: the other path has noted the turn (the
 * gate waits up to waitMs for the pipeline; the call moving to its next turn ends the wait), and
 * no read of the turn is about someone else or failed.
 */
export async function selfFillStands(
  call: string | undefined,
  turn: number | undefined,
  path: SecondReadPath,
  waitMs: number
): Promise<boolean> {
  if (!call || turn === undefined) return false;
  // The turn's notes once the other path is among them; false once the turn has ended.
  const noted = (): TurnNote[] | false | undefined => {
    if ((turns.get(call)?.turn ?? 0) > turn) return false;
    const notes = notesOf(call, turn);
    return notes?.some((n) => n.path !== path) ? notes : undefined;
  };
  const set = waiters.get(call) ?? new Set<() => void>();
  const notes =
    noted() ??
    (await new Promise<TurnNote[] | false>((resolve) => {
      const done = (seen: TurnNote[] | false): void => {
        clearTimeout(timer);
        set.delete(check);
        if (!set.size) waiters.delete(call);
        resolve(seen);
      };
      const check = (): void => {
        const seen = noted();
        if (seen !== undefined) done(seen);
      };
      const timer = setTimeout(() => done(false), waitMs);
      waiters.set(call, set.add(check));
    }));
  if (!notes) return false;
  // Every read of the turn, a note that arrives while these settle included.
  for (let read = 0; read < notes.length;) {
    const batch = notes.slice(read);
    read += batch.length;
    if ((await Promise.all(batch.map((n) => n.thirdParty))).some(Boolean)) return false;
  }
  return true;
}

/** For tests: forget every turn. */
export function resetSecondReadTurns(): void {
  turns.clear();
  waiters.clear();
}
