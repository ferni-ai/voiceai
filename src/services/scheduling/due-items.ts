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
  userId: string;
  data: Record<string, unknown>;
}

export interface ClaimResult {
  due: number;
  claimed: DueItem[];
  late: number;
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
}

function dueTime(value: unknown): number {
  const raw = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  return new Date(raw as string | number | Date).getTime();
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

  const result: ClaimResult = { due: snapshot.size, claimed: [], late: 0, skipped: 0 };
  for (const doc of snapshot.docs) {
    const data = { ...doc.data() };
    const late = now.getTime() - dueTime(data[opts.dueField]) > opts.lateAfterMs;
    const item: DueItem = {
      id: doc.id,
      ref: doc.ref,
      userId: String(data.userId ?? doc.ref.parent.parent?.id ?? ''),
      data,
    };

    if (opts.dryRun) {
      if (late) result.late++;
      else result.claimed.push(item);
      continue;
    }

    const outcome = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.data()?.status !== 'pending') return 'skipped';
      tx.update(
        doc.ref,
        late
          ? { status: opts.lateStatus, missedAt: now.toISOString() }
          : { status: opts.claimStatus, claimedAt: now.toISOString() }
      );
      return late ? 'late' : 'claimed';
    });
    if (outcome === 'skipped') result.skipped++;
    else if (outcome === 'late') result.late++;
    else result.claimed.push(item);
  }
  return result;
}
