/**
 * Reads of a user's remembered facts and people for recall.
 *
 * Facts come most recently updated first (single-field order: no composite
 * index needed), plus every user-edited fact, plus (until the dedupe migration
 * has stamped `updatedAt` on old documents) the legacy documents an ordered
 * query cannot see.
 *
 * @module memory/recall/user-memory-store
 */

import { USERS_COLLECTION, type DocData, type FirestoreLike } from '../dynamic/firestore-shapes.js';

export interface StoredDoc extends DocData {
  id: string;
}

const MAX_EDITED = 200;

/** Up to `max` fact documents (plus user-edited ones), each with its `id`. */
export async function loadUserFactDocs(
  db: FirestoreLike,
  userId: string,
  max: number
): Promise<StoredDoc[]> {
  const col = db.collection(USERS_COLLECTION).doc(userId).collection('dynamic_facts');
  const byId = new Map<string, StoredDoc>();
  const add = (docs: Array<{ id: string; data(): DocData | undefined }>) => {
    for (const d of docs) if (!byId.has(d.id)) byId.set(d.id, { ...(d.data() ?? {}), id: d.id });
  };

  const [recent, edited] = await Promise.all([
    col.orderBy('updatedAt', 'desc').limit(max).get(),
    col.where('userEdited', '==', true).limit(MAX_EDITED).get(),
  ]);
  add(recent.docs);
  add(edited.docs);
  if (recent.size < max) {
    // Documents written before deterministic ids have no updatedAt.
    const legacy = await col.limit(max).get();
    add(legacy.docs);
  }
  return [...byId.values()];
}

/** People the user has mentioned (dynamic_entities of type person). */
export async function loadUserPeople(
  db: FirestoreLike,
  userId: string,
  max = 200
): Promise<StoredDoc[]> {
  const snap = await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection('dynamic_entities')
    .where('type', '==', 'person')
    .limit(max)
    .get();
  return snap.docs.map((d) => ({ ...(d.data() ?? {}), id: d.id }));
}
