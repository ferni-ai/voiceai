/**
 * Firestore side of fact supersession (memory/dynamic/fact-supersession.ts):
 * the caller's dynamic facts and the per-caller cursor.
 *
 * @module memory/storage/supersession-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { SupersessionStore } from '../dynamic/fact-supersession.js';

/** bogle_users/{uid}/dynamic_facts, and the cursor in bogle_users/{uid}/memory_state/supersession. */
export const firestoreSupersessionStore: SupersessionStore = {
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
        id: d.id,
        entityName: String(x.entityName ?? ''),
        key: String(x.key ?? ''),
        value: String(x.value ?? ''),
        extractedAt: String(x.extractedAt ?? ''),
        ...(typeof x.supersededAt === 'string' && { supersededAt: x.supersededAt }),
      };
    });
  },
  async markSuperseded(userId, marks, at) {
    const db = getFirestoreDb();
    if (!db) return;
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    const batch = db.batch();
    for (const m of marks) batch.update(facts.doc(m.id), { supersededAt: at, supersededBy: m.by });
    await batch.commit();
  },
  async cursor(userId) {
    const db = getFirestoreDb();
    if (!db) return undefined;
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_state')
      .doc('supersession')
      .get();
    const at = doc.exists ? doc.data()?.cursor : undefined;
    return typeof at === 'string' ? at : undefined;
  },
  async setCursor(userId, at) {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_state')
      .doc('supersession')
      .set({ cursor: at }, { merge: true });
  },
};
