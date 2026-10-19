/**
 * The recall store on Firestore: the collections the live pipeline writes
 * (moved out of memory-recall-hook.ts).
 *
 * @module agents/multi-agent/recall-firestore-store
 */

import type { RecallStore } from '../../memory/recall/session-recall.js';
import { forgottenTopicsOrNull } from '../../memory/recall/forget.js';
import { isExpired } from '../../memory/recall/expired.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

/** Reads the collections the live pipeline writes. Plain queries: no composite index needed. */
export const firestoreRecallStore: RecallStore = {
  // Null when unreadable: the snapshot then fails closed (session-recall.ts).
  forgotten: async (userId) => forgottenTopicsOrNull(userId),
  async facts(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    // Newest first: an unordered limit loaded an arbitrary 300 of a user's
    // facts (2,024 for one test user). Facts without a date fall back to it.
    const newest = await facts.orderBy('extractedAt', 'desc').limit(300).get();
    const snap = newest.docs.length > 0 ? newest : await facts.limit(300).get();
    // A remembered call past its 180 days (outreach/call-memory.ts) is out before TTL deletes it.
    return snap.docs.map((d) => d.data()).filter((d) => !isExpired(d.expireAt));
  },
  async summaries(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    return snap.docs.map((d) => d.data());
  },
};
