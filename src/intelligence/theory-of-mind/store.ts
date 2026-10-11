/**
 * Where the model lives: bogle_users/{userId}/mind_model/current, one small
 * document per person, erased with the rest of their record.
 *
 * @module intelligence/theory-of-mind/store
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { MindModel } from './types.js';

export interface MindStore {
  load: (userId: string) => Promise<MindModel | null>;
  save: (model: MindModel) => Promise<void>;
}

type Db = NonNullable<ReturnType<typeof getFirestoreDb>>;

const ref = (db: Db, userId: string): FirebaseFirestore.DocumentReference =>
  db.collection('bogle_users').doc(userId).collection('mind_model').doc('current');

/** Plain JSON: drops undefined fields, which Firestore rejects. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A stored model is used only if it has the shape this version writes. */
export function asMindModel(data: unknown, userId: string): MindModel | null {
  const d = data as Partial<MindModel> | undefined;
  if (!d || d.version !== 1) return null;
  if (!Array.isArray(d.toldFerni) || !Array.isArray(d.patterns) || !Array.isArray(d.sensitivities))
    return null;
  return { ...(d as MindModel), userId };
}

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

/** For tests and local runs: the same contract, in memory. */
export function memoryMindStore(): MindStore & { models: Map<string, MindModel> } {
  const models = new Map<string, MindModel>();
  return {
    models,
    load: (userId) => {
      const m = models.get(userId);
      return Promise.resolve(m ? asMindModel(plain(m), userId) : null);
    },
    save: (model) => {
      models.set(model.userId, plain(model));
      return Promise.resolve();
    },
  };
}
