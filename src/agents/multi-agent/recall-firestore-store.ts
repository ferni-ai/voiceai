/**
 * The recall store on Firestore: the collections the live pipeline writes
 * (moved out of memory-recall-hook.ts).
 *
 * @module agents/multi-agent/recall-firestore-store
 */

import type { VectorRecallStore } from '../../memory/recall/stored-fact-vectors.js';
import { rememberFactNames, snapshotTopics } from '../../memory/recall/forget-every-reader.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

/** Reads the collections the live pipeline writes. Plain queries, but for nearest (a vector index). */
export const firestoreRecallStore: VectorRecallStore = {
  // Null when unreadable: the snapshot then fails closed (session-recall.ts). With
  // FORGET_EVERY_READER the read is shared with the other readers (forget-every-reader.ts).
  forgotten: async (userId) => snapshotTopics(userId),
  async facts(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    // Newest first: an unordered limit loaded an arbitrary 300 of a user's
    // facts (2,024 for one test user). Facts without a date fall back to it.
    const newest = await facts.orderBy('extractedAt', 'desc').limit(300).get();
    const snap = newest.docs.length > 0 ? newest : await facts.limit(300).get();
    const rows = snap.docs.map((d) => d.data());
    rememberFactNames(userId, rows); // FORGET_EVERY_READER: names the forget matcher keeps whole
    return rows;
  },
  // RECALL_VECTOR_INDEX: the stored facts nearest a turn's meaning, however old.
  async nearest(userId, queryVector, k) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_facts')
      .findNearest({
        vectorField: 'embedding',
        queryVector,
        limit: k,
        distanceMeasure: 'COSINE',
        distanceResultField: '_d',
      })
      .get();
    return snap.docs.map((d) => d.data());
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
