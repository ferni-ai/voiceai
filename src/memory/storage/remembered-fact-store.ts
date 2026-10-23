/**
 * Firestore side of remembered facts (memory/dynamic/remembered-facts.ts).
 *
 * @module memory/storage/remembered-fact-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { RememberedFactStore } from '../dynamic/remembered-facts.js';

/** bogle_users/{uid}/dynamic_facts: create only, as the after-call sweep writes (sweep-store.ts). */
export const firestoreRememberedFactStore: RememberedFactStore = {
  async create(userId, docs) {
    const db = getFirestoreDb();
    if (!db) return 0;
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    const results = await Promise.allSettled(docs.map(async (d) => facts.doc(d.id).create(d.data)));
    return results.filter((r) => r.status === 'fulfilled').length;
  },
};
