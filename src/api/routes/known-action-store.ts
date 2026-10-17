/**
 * Firestore side of the memory view's actions
 * (intelligence/memory-view/actions.ts): every write is under
 * bogle_users/{the caller}, by path.
 *
 * @module api/routes/known-action-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { firestoreForgetStore } from '../../memory/recall/forget.js';
import { correctRemembered, forgetRemembered } from '../../memory/recall/memory-control.js';
import { firestoreMemoryControlStore } from '../../memory/storage/memory-control-store.js';
import { createFirestoreWorldFactStore } from '../../intelligence/world-model/temporal/store.js';
import type { TemporalFact } from '../../intelligence/world-model/temporal/types.js';
import type { MindModel } from '../../intelligence/theory-of-mind/types.js';
import type { ActionStore } from '../../intelligence/memory-view/actions.js';
import type { StoredPondering } from '../../intelligence/memory-view/known.js';

/** Run `change` on one document in a transaction; false (and no write) when it returns null. */
async function changeDoc<T>(
  path: string[],
  change: (current: T) => T | null,
  valid: (data: unknown) => data is T
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  const [userId, collection, docId] = path as [string, string, string];
  const ref = db.collection('bogle_users').doc(userId).collection(collection).doc(docId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data: unknown = doc.exists ? doc.data() : undefined;
    if (!valid(data)) return false;
    const next = change(data);
    if (next === null) return false;
    tx.set(ref, JSON.parse(JSON.stringify(next)) as Record<string, unknown>);
    return true;
  });
}

const isMind = (d: unknown): d is MindModel =>
  typeof d === 'object' &&
  d !== null &&
  (d as MindModel).version === 1 &&
  Array.isArray((d as MindModel).patterns) &&
  Array.isArray((d as MindModel).sensitivities);

const isPondering = (d: unknown): d is StoredPondering =>
  typeof d === 'object' &&
  d !== null &&
  Array.isArray((d as StoredPondering).followUps) &&
  Array.isArray((d as StoredPondering).thinkingOf);

const worldStore = createFirestoreWorldFactStore();
const worldDoc = (userId: string, id: string): FirebaseFirestore.DocumentReference | null =>
  getFirestoreDb()?.collection('bogle_users').doc(userId).collection('world_facts').doc(id) ?? null;

export const firestoreActionStore: ActionStore = {
  forgetFact: async (userId, id) => forgetRemembered(userId, id, firestoreMemoryControlStore),
  async correctFact(userId, id, value) {
    const r = await correctRemembered(userId, id, value, firestoreMemoryControlStore);
    return r.kind === 'corrected' ? { kind: 'done', replacedBy: r.fact.id } : r;
  },
  world: {
    ...worldStore,
    async get(userId, id) {
      const doc = await worldDoc(userId, id)?.get();
      return doc?.exists ? { ...(doc.data() as TemporalFact), id: doc.id } : null;
    },
    async forget(userId, id, at, wrong) {
      await worldDoc(userId, id)?.update({ validTo: at, forgottenAt: at, ...(wrong && { wrong }) });
    },
  },
  updateMind: async (userId, change) =>
    changeDoc([userId, 'mind_model', 'current'], change, isMind),
  updatePondering: async (userId, change) =>
    changeDoc([userId, 'predictive_intelligence', 'pondering'], change, isPondering),
  addForgottenTopic: async (userId, topic) => firestoreForgetStore.addTopic(userId, topic),
};
