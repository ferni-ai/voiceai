/**
 * Firestore side of disputes (memory/recall/dispute.ts): the caller's facts
 * in both fact collections, their open world facts, and their recent call summaries.
 *
 * @module memory/storage/dispute-store
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { closeWorldFacts, firestoreForgetStore, openWorldFacts } from '../recall/forget.js';
import type { DisputeStore } from '../recall/dispute.js';

/** Facts in both fact collections (forget.ts), and bogle_users/{uid}/summaries. */
export const firestoreDisputeStore: DisputeStore = {
  facts: (userId) => firestoreForgetStore.facts(userId),
  worldFacts: openWorldFacts,
  markWorldFacts: closeWorldFacts,
  async summaries(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  async markFacts(userId, refs, at) {
    // forgottenAt: out of recall and vector search, index copies removed (forget.ts).
    await firestoreForgetStore.markForgotten(userId, refs, at);
    const db = getFirestoreDb();
    if (!db) return;
    const user = db.collection('bogle_users').doc(userId);
    const batch = db.batch();
    for (const r of refs) batch.update(user.collection(r.collection).doc(r.id), { disputedAt: at });
    await batch.commit();
  },
  async markSummaryItems(userId, id, items, at) {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .doc(id)
      .update({ disputedItems: FieldValue.arrayUnion(...items), disputedAt: at });
  },
};
