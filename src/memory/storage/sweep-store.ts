/**
 * Firestore side of the after-call fact sweep (memory/dynamic/fact-sweep.ts).
 *
 * @module memory/storage/sweep-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { SweepStore } from '../dynamic/fact-sweep.js';

/** bogle_users/{uid}/dynamic_facts: create only, so an existing fact is never overwritten. */
export const firestoreSweepStore: SweepStore = {
  async facts(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_facts')
      .orderBy('extractedAt', 'desc')
      .limit(300)
      .get();
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        entityName: String(x.entityName ?? ''),
        key: String(x.key ?? ''),
        value: String(x.value ?? ''),
      };
    });
  },
  async add(userId, docs) {
    const db = getFirestoreDb();
    if (!db) return 0;
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    const results = await Promise.allSettled(docs.map(async (d) => facts.doc(d.id).create(d.data)));
    return results.filter((r) => r.status === 'fulfilled').length;
  },
};
