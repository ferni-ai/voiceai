/**
 * The startup read behind the proactive scheduler's in-memory queue.
 *
 * Every Cloud Run cold boot runs it, and the unbounded collection-group scan
 * of every pending scheduled_outreach doc it replaced was part of a ~40s boot
 * stall (2026-10-18 prod log audit). Now: pending only, within a horizon,
 * soonest first, capped, so a capped read still keeps what is due.
 *
 * The range filter on the ISO-string `scheduledFor` (what proactive-scheduler
 * writes) also skips scheduled-multi-outreach's Timestamp-typed docs, since a
 * Firestore range filter only matches values of its own type.
 *
 * Index: scheduled_outreach COLLECTION_GROUP (status ASC, scheduledFor ASC),
 * live in prod and in firestore.indexes.json.
 *
 * Also one person's pending proactive outreach, for the practice view.
 *
 * @module services/outreach/pending-outreach-query
 */

import type { Firestore, QueryDocumentSnapshot, QuerySnapshot } from '@google-cloud/firestore';

/** Marks our scheduled_outreach docs; scheduled-multi-outreach's go to contacts, not the user. */
export const PROACTIVE_OUTREACH_SOURCE = 'proactive-scheduler';

/** Most pending docs one startup read loads. */
export const PENDING_OUTREACH_LOAD_LIMIT = 500;
/** How far ahead a startup read looks; later outreach loads on a later boot. */
export const PENDING_OUTREACH_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export async function queryPendingOutreach(
  db: Firestore,
  now = Date.now()
): Promise<{ snapshot: QuerySnapshot; capped: boolean }> {
  const horizon = new Date(now + PENDING_OUTREACH_HORIZON_MS).toISOString();
  const snapshot = await db
    .collectionGroup('scheduled_outreach')
    .where('status', '==', 'pending')
    .where('scheduledFor', '<=', horizon)
    .orderBy('scheduledFor')
    .limit(PENDING_OUTREACH_LOAD_LIMIT)
    .get();
  return { snapshot, capped: snapshot.size >= PENDING_OUTREACH_LOAD_LIMIT };
}

/**
 * One person's pending proactive outreach, soonest first.
 *
 * Same type trick as above: the range on the ISO-string `scheduledFor` keeps
 * only proactive-scheduler's docs and skips the Timestamp-typed ones that call
 * other people (scheduled-multi-outreach, call-retry). Every string ranks at or
 * above '', so no pending doc is dropped for being overdue.
 *
 * Index: scheduled_outreach COLLECTION (status ASC, scheduledFor ASC), live in
 * prod and in firestore.indexes.json.
 */
export async function queryUserPendingOutreach(
  db: Firestore,
  userId: string,
  limit: number
): Promise<QueryDocumentSnapshot[]> {
  const snapshot = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('scheduled_outreach')
    .where('status', '==', 'pending')
    .where('scheduledFor', '>=', '')
    .orderBy('scheduledFor')
    .limit(limit)
    .get();
  return snapshot.docs.filter((d) => d.data().source === PROACTIVE_OUTREACH_SOURCE);
}
