/**
 * Claim items that are due, across all users, for a scheduled job.
 *
 * Scheduled work (scheduled actions, scheduled outreach) is stored per user as
 * bogle_users/{uid}/{collection}/{id} with status 'pending' and a due time.
 * A Cloud Scheduler job calls claimDueItems() to find what's due and claim
 * each item in a transaction (pending → claimStatus), so two overlapping runs
 * never both act on the same item. Items found later than `lateAfterMs` after
 * their time are marked `lateStatus` instead: a reminder to "call your mom"
 * delivered the next morning is noise.
 *
 * Needs a collection-group index (status, dueField) in firestore.indexes.json.
 *
 * @module services/scheduling/due-items
 */

import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

export interface DueItem {
  id: string;
  ref: DocumentReference;
  /**
   * Owner, from the document's path (bogle_users/{uid}/...). Never the
   * document's own userId field: that is data a writer controls, and trusting
   * it would let one user's document act on another user.
   */
  userId: string;
  data: Record<string, unknown>;
}

export interface ClaimResult {
  due: number;
  claimed: DueItem[];
  late: number;
  /** The items marked late (none on a dry run), so a job can report each one. */
  lateItems: DueItem[];
  /** Claimed by another run first. */
  skipped: number;
}

export interface ClaimOptions {
  collection: string;
  /** Field holding the due time. */
  dueField: string;
  /** How the due time is stored: ISO string or Firestore Timestamp/Date. */
  dueType: 'iso' | 'timestamp';
  claimStatus: string;
  lateStatus: string;
  lateAfterMs: number;
  now?: Date;
  limit?: number;
  /** Report what would happen without claiming anything. */
  dryRun?: boolean;
  /**
   * Claim by a lease instead of a status: the item stays 'pending' and its due time moves this
   * far ahead (late items too, still reported as late). A run that dies mid-item leaves it due
   * again when the lease ends, never stuck; a run that overlaps finds it not due. claimStatus and
   * lateStatus are not written.
   */
  leaseMs?: number;
}

function dueTime(value: unknown): number {
  const raw = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  return new Date(raw as string | number | Date).getTime();
}

/** The claim's write: a lease (a later due time), the late status, or the claim status. */
function claimWrite(opts: ClaimOptions, now: Date, late: boolean): Record<string, unknown> {
  if (opts.leaseMs !== undefined) {
    const until = new Date(now.getTime() + opts.leaseMs);
    return { [opts.dueField]: opts.dueType === 'iso' ? until.toISOString() : until, claimedAt: now.toISOString() }; // prettier-ignore
  }
  return late
    ? { status: opts.lateStatus, missedAt: now.toISOString() }
    : { status: opts.claimStatus, claimedAt: now.toISOString() };
}

export async function claimDueItems(db: Firestore, opts: ClaimOptions): Promise<ClaimResult> {
  const now = opts.now ?? new Date();
  const cutoff = opts.dueType === 'iso' ? now.toISOString() : now;
  const snapshot = await db
    .collectionGroup(opts.collection)
    .where('status', '==', 'pending')
    .where(opts.dueField, '<=', cutoff)
    .orderBy(opts.dueField)
    .limit(opts.limit ?? 50)
    .get();

  const result: ClaimResult = {
    due: snapshot.size,
    claimed: [],
    late: 0,
    lateItems: [],
    skipped: 0,
  };
  for (const doc of snapshot.docs) {
    const owner = doc.ref.parent.parent?.id;
    if (!owner) continue; // not under bogle_users/{uid}
    const data = { ...doc.data() };
    const late = now.getTime() - dueTime(data[opts.dueField]) > opts.lateAfterMs;
    const item: DueItem = {
      id: doc.id,
      ref: doc.ref,
      userId: owner,
      data,
    };

    if (opts.dryRun) {
      if (late) result.late++;
      else result.claimed.push(item);
      continue;
    }

    const outcome = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data();
      if (fresh?.status !== 'pending') return 'skipped';
      // Leased by another run since the query read it: no longer due.
      if (opts.leaseMs !== undefined && dueTime(fresh[opts.dueField]) > now.getTime()) return 'skipped'; // prettier-ignore
      tx.update(doc.ref, claimWrite(opts, now, late));
      return late ? 'late' : 'claimed';
    });
    if (outcome === 'skipped') result.skipped++;
    else if (outcome === 'late') {
      result.late++;
      result.lateItems.push(item);
    } else result.claimed.push(item);
  }
  return result;
}
