/**
 * Firestore side of revived intelligence (intelligence/revived/revived-intelligence.ts):
 * the caller's latest call summaries, the same query memory recall uses
 * (single-field order, no composite index).
 *
 * @module memory/storage/revived-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { RevivedStore } from '../../intelligence/revived/revived-intelligence.js';
import type { SummaryDoc } from '../../intelligence/revived/revived-builders.js';

const SUMMARIES = 6;

/** bogle_users/{uid}/summaries, newest first. */
export const firestoreRevivedStore: RevivedStore = {
  async summaries(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(SUMMARIES)
      .get();
    return snap.docs.map((d) => d.data() as SummaryDoc);
  },
};
