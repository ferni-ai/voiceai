/**
 * Where temporal facts live: bogle_users/{uid}/world_facts/{factId}.
 *
 * Call start reads current facts (validTo == null), one query. Closed facts
 * stay on file as history; the only closed ones read on a call are those raised
 * lately (listRaisedSince), so dates/recall.ts knows who was just asked about.
 *
 * @module intelligence/world-model/temporal/store
 */

import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import type { ResolutionPlan } from './resolve.js';
import type { TemporalFact } from './types.js';

/** Plenty for one person's world; a call reads them all at once. */
export const MAX_OPEN_FACTS = 200;
/** Facts raised on a call within one quiet window: a few a week at most. */
export const MAX_RAISED_FACTS = 50;

export interface WorldFactStore {
  listOpen(userId: string): Promise<TemporalFact[]>;
  /** Facts raised on a call on or after a day (YYYY-MM-DD), open or closed, newest first. */
  listRaisedSince?: (userId: string, sinceDay: string) => Promise<TemporalFact[]>;
  apply(userId: string, plan: ResolutionPlan): Promise<void>;
}

/** Firestore drops undefined fields only when told to; strip them here. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function createFirestoreWorldFactStore(
  getDb: () => Firestore | null = getFirestoreDb
): WorldFactStore {
  const facts = (db: Firestore, userId: string) =>
    db.collection('bogle_users').doc(userId).collection('world_facts');

  return {
    async listOpen(userId) {
      const db = getDb();
      if (!db) return [];
      const snap = await facts(db, userId).where('validTo', '==', null).limit(MAX_OPEN_FACTS).get();
      return snap.docs.map((doc) => ({ ...(doc.data() as TemporalFact), id: doc.id }));
    },

    async listRaisedSince(userId, sinceDay) {
      const db = getDb();
      if (!db) return [];
      const snap = await facts(db, userId)
        .where('raisedOn', '>=', sinceDay)
        .orderBy('raisedOn', 'desc')
        .limit(MAX_RAISED_FACTS)
        .get();
      return snap.docs.map((doc) => ({ ...(doc.data() as TemporalFact), id: doc.id }));
    },

    async apply(userId, plan) {
      const db = getDb();
      if (!db) return;
      if (plan.create.length + plan.close.length + plan.refresh.length === 0) return;
      const col = facts(db, userId);
      const batch = db.batch();
      for (const fact of plan.create) batch.set(col.doc(fact.id), defined(fact));
      for (const { id, validTo, supersededBy } of plan.close) {
        batch.update(col.doc(id), { validTo, supersededBy });
      }
      for (const { id, observedAt, confidence } of plan.refresh) {
        batch.update(col.doc(id), { observedAt, confidence });
      }
      await batch.commit();
    },
  };
}

/** Notes the day and moment a fact was raised on a call (dates/recall.ts), so it isn't raised again soon. */
export async function markFactRaised(
  userId: string,
  factId: string,
  day: string,
  moment: string,
  getDb: () => Firestore | null = getFirestoreDb
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .collection('bogle_users')
    .doc(userId)
    .collection('world_facts')
    .doc(factId)
    .update({ raisedOn: day, raisedAs: moment });
}
