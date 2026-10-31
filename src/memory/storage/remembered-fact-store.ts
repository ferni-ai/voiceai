/**
 * Firestore side of remembered facts (memory/dynamic/remembered-facts.ts).
 *
 * @module memory/storage/remembered-fact-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { RememberedFactStore } from '../dynamic/remembered-facts.js';

/** gRPC ALREADY_EXISTS: the document is there, which create-only counts as no write, not a failure. */
const ALREADY_EXISTS = 6;

/**
 * bogle_users/{uid}/dynamic_facts: create only, as the after-call sweep writes (sweep-store.ts).
 * Throws when a create fails for any other reason, so "already there" never hides a lost write.
 */
export const firestoreRememberedFactStore: RememberedFactStore = {
  async create(userId, docs) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Fact store unavailable');
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    const results = await Promise.allSettled(docs.map(async (d) => facts.doc(d.id).create(d.data)));
    const failed = results.find(
      (r) => r.status === 'rejected' && (r.reason as { code?: unknown })?.code !== ALREADY_EXISTS
    );
    if (failed) throw (failed as PromiseRejectedResult).reason;
    return results.filter((r) => r.status === 'fulfilled').length;
  },
};
