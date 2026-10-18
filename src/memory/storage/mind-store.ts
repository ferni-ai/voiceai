/**
 * Firestore side of theory of mind (intelligence/theory-of-mind/store.ts):
 * bogle_users/{userId}/mind_model/current, one small document per person,
 * erased with the rest of their record.
 *
 * @module memory/storage/mind-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { asMindModel, type MindStore } from '../../intelligence/theory-of-mind/store.js';

type Db = NonNullable<ReturnType<typeof getFirestoreDb>>;

const ref = (db: Db, userId: string): FirebaseFirestore.DocumentReference =>
  db.collection('bogle_users').doc(userId).collection('mind_model').doc('current');

/** Plain JSON: drops undefined fields, which Firestore rejects. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const firestoreMindStore: MindStore = {
  async load(userId) {
    const db = getFirestoreDb();
    if (!db) return null;
    const snap = await ref(db, userId).get();
    return snap.exists ? asMindModel(snap.data(), userId) : null;
  },
  async save(model) {
    const db = getFirestoreDb();
    if (!db) return;
    await ref(db, model.userId).set(plain(model));
  },
};
