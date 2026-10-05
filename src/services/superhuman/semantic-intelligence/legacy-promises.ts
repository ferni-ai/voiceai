/**
 * Promises Ferni made before outcomes were tracked (no `outcome` field).
 *
 * Nothing recorded whether those were kept: reminders weren't linked to them
 * and asking about one in conversation wasn't noted. So the honest status of
 * one whose due time has passed is 'unknown', never kept or missed. Unknown is
 * not counted by Trust's "I follow through" (it counts only kept and broken),
 * and Ferni is never asked to own it.
 *
 * One still due later is adopted as 'open' and flagged `legacy`: Ferni can
 * still keep it, and if she doesn't, the sweep settles it 'unknown' (part of
 * its window went unwatched, so a miss can't be shown).
 *
 * One pass, run by the overdue-promise sweep in pages of PAGE docs a run, with
 * its place saved in migration_checkpoints so it finishes once across restarts
 * and instances. Each doc is updated in a transaction only while it still has
 * no outcome, so running a page twice changes nothing.
 *
 * @module services/superhuman/semantic-intelligence/legacy-promises
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'legacy-promises' });

type Db = FirebaseFirestore.Firestore;

const PAGE = 300;
const CHECKPOINT = ['migration_checkpoints', 'legacy_promise_outcomes'] as const;

export const LEGACY_UNKNOWN_REASON = 'made before promise outcomes were tracked';

export interface LegacyPassResult {
  scanned: number;
  unknown: number;
  adopted: number;
  done: boolean;
}

let finished = false;

type When = { toDate?: () => Date } | string | number | Date | null | undefined;
function asDate(v: When): Date | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'object' && 'toDate' in v && typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v as string | number | Date);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** What a legacy doc becomes, or null when it has nothing to settle. */
function patchFor(data: Record<string, unknown>, now: Date): Record<string, unknown> | null {
  if (data.outcome !== undefined || data.fulfilled === true || data.violated === true) return null;
  const dueBy = asDate(data.dueBy as When);
  if (!dueBy) return null; // "remember" / "avoid": never due, nothing to settle
  if (dueBy.getTime() > now.getTime()) {
    // dueBy as an ISO string, so the sweep's string range query finds it.
    return { outcome: 'open', legacy: true, dueBy: dueBy.toISOString() };
  }
  return { outcome: 'unknown', unknownAt: now.toISOString(), unknownReason: LEGACY_UNKNOWN_REASON };
}

/**
 * Settle one page of legacy promises. Returns null once the pass has finished
 * (this process remembers, so a finished pass costs nothing afterwards).
 */
export async function settleLegacyPromises(
  db: Db,
  now: Date,
  pageSize = PAGE
): Promise<LegacyPassResult | null> {
  if (finished) return null;
  const checkpoint = db.collection(CHECKPOINT[0]).doc(CHECKPOINT[1]);
  const saved = (await checkpoint.get()).data() as { after?: string; doneAt?: string } | undefined;
  if (saved?.doneAt) {
    finished = true;
    return null;
  }
  let page = db.collectionGroup('ferni_commitments').orderBy('__name__').limit(pageSize);
  if (saved?.after) page = page.startAfter(saved.after);
  const snap = await page.get();
  const result: LegacyPassResult = { scanned: snap.size, unknown: 0, adopted: 0, done: false };
  for (const doc of snap.docs) {
    if (patchFor(doc.data(), now) === null) continue;
    const patch = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const next = fresh.exists ? patchFor(fresh.data() ?? {}, now) : null;
      if (next) tx.update(doc.ref, next);
      return next;
    });
    if (patch?.outcome === 'unknown') result.unknown++;
    if (patch?.outcome === 'open') result.adopted++;
  }
  result.done = snap.size < pageSize;
  const last = snap.docs.at(-1);
  await checkpoint.set(
    {
      ...(last ? { after: last.ref.path } : {}),
      ...(result.done ? { doneAt: now.toISOString() } : {}),
      updatedAt: now.toISOString(),
    },
    { merge: true }
  );
  if (result.done) finished = true;
  if (result.unknown + result.adopted > 0 || result.done) log.info(result, 'Legacy promises page');
  return result;
}

/** Test seam: forget that this process finished the pass. */
export function resetLegacyPass(): void {
  finished = false;
}
