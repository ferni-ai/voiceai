/**
 * Firestore side of what the caller sees and changes about what Ferni
 * remembers (memory/recall/memory-control.ts): bogle_users/{uid}/dynamic_facts,
 * always the caller's own, by path.
 *
 * @module memory/storage/memory-control-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  firestoreForgetStore,
  forgottenTopicsOrNull,
  removeIndexCopies,
  withoutDerivedCopies,
} from '../recall/forget.js';
import { RECALL_READS, type MemoryControlStore } from '../recall/memory-control.js';

const facts = (userId: string): FirebaseFirestore.CollectionReference | null => {
  const db = getFirestoreDb();
  return db ? db.collection('bogle_users').doc(userId).collection('dynamic_facts') : null;
};

/** Copies of one fact found at most (one fact is rarely stored more than a few times). */
const MAX_COPIES = 50;

export const firestoreMemoryControlStore: MemoryControlStore = {
  forgotten: (userId) => forgottenTopicsOrNull(userId),
  async facts(userId) {
    const col = facts(userId);
    if (!col) return [];
    // The read recall makes (memory-recall-hook.ts firestoreRecallStore.facts), so the list
    // is what Ferni will remember: the newest RECALL_READS, else any when none is dated.
    const newest = await col.orderBy('extractedAt', 'desc').limit(RECALL_READS).get();
    const snap = newest.docs.length > 0 ? newest : await col.limit(RECALL_READS).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  async fact(userId, id) {
    const col = facts(userId);
    if (!col) return null;
    const doc = await col.doc(id).get();
    return doc.exists ? (doc.data() ?? null) : null;
  },
  async copies(userId, data) {
    const col = facts(userId);
    if (!col) return [];
    const snap = await col
      .where('entityName', '==', data.entityName ?? null)
      .where('key', '==', data.key ?? null)
      .where('value', '==', data.value ?? null)
      .limit(MAX_COPIES)
      .get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  async forget(userId, id, data, at) {
    await firestoreForgetStore.markForgotten(
      userId,
      [{ collection: 'dynamic_facts', id, data }],
      at
    );
  },
  async correct(userId, wrongIds, right, at) {
    const db = getFirestoreDb();
    const col = facts(userId);
    if (!db || !col) throw new Error('Fact store unavailable');
    const batch = db.batch();
    batch.create(col.doc(right.id), right.data);
    // syncedToSpanner: false sends each back through the graph sync, which removes its copy.
    for (const wrongId of wrongIds) {
      batch.update(col.doc(wrongId), {
        forgottenAt: at,
        correctedBy: right.id,
        syncedToSpanner: false,
        ...withoutDerivedCopies(),
      });
    }
    await batch.commit();
    await removeIndexCopies(userId, wrongIds);
  },
};
