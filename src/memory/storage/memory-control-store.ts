/**
 * Firestore side of what the caller sees and changes about what Ferni
 * remembers (memory/recall/memory-control.ts): bogle_users/{uid}/dynamic_facts,
 * always the caller's own, by path.
 *
 * @module memory/storage/memory-control-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { firestoreForgetStore, removeIndexCopies } from '../recall/forget.js';
import type { MemoryControlStore } from '../recall/memory-control.js';

const facts = (userId: string): FirebaseFirestore.CollectionReference | null => {
  const db = getFirestoreDb();
  return db ? db.collection('bogle_users').doc(userId).collection('dynamic_facts') : null;
};

const learned = (d: Record<string, unknown>): string =>
  typeof d.extractedAt === 'string' ? d.extractedAt : '';

export const firestoreMemoryControlStore: MemoryControlStore = {
  async facts(userId) {
    const col = facts(userId);
    if (!col) return [];
    // All of them, sorted here: orderBy('extractedAt') would leave out any fact
    // without that field, which recall still uses. Undated facts come last.
    const snap = await col.get();
    return snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .sort((a, b) => learned(b.data).localeCompare(learned(a.data)));
  },
  async fact(userId, id) {
    const col = facts(userId);
    if (!col) return null;
    const doc = await col.doc(id).get();
    return doc.exists ? (doc.data() ?? null) : null;
  },
  async forget(userId, id, data, at) {
    await firestoreForgetStore.markForgotten(
      userId,
      [{ collection: 'dynamic_facts', id, data }],
      at
    );
  },
  async correct(userId, wrongId, right, at) {
    const db = getFirestoreDb();
    const col = facts(userId);
    if (!db || !col) throw new Error('Fact store unavailable');
    const batch = db.batch();
    batch.create(col.doc(right.id), right.data);
    // syncedToSpanner: false sends it back through the graph sync, which removes its copy.
    batch.update(col.doc(wrongId), {
      forgottenAt: at,
      correctedBy: right.id,
      syncedToSpanner: false,
    });
    await batch.commit();
    await removeIndexCopies(userId, [wrongId]);
  },
};
