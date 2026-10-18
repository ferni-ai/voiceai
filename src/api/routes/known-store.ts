/**
 * Firestore side of what Ferni knows (intelligence/memory-view/known.ts):
 * every read is under bogle_users/{uid}, the caller's own record, by path.
 *
 * @module api/routes/known-store
 */
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { firestoreForgetStore } from '../../memory/recall/forget.js';
import { listRemembered } from '../../memory/recall/memory-control.js';
import { firestoreMemoryControlStore } from '../../memory/storage/memory-control-store.js';
import { MAX_OPEN_FACTS } from '../../intelligence/world-model/temporal/store.js';
import type { TemporalFact } from '../../intelligence/world-model/temporal/types.js';
import type { MindModel } from '../../intelligence/theory-of-mind/types.js';
import type { KnownStore, StoredPondering } from '../../intelligence/memory-view/known.js';

function asMindModel(data: unknown): MindModel | null {
  const d = data as Partial<MindModel> | undefined;
  if (!d || d.version !== 1 || !Array.isArray(d.patterns) || !Array.isArray(d.sensitivities)) {
    return null;
  }
  return d as MindModel;
}

function dayOf(ts: unknown): string | undefined {
  if (typeof ts === 'string' && !Number.isNaN(Date.parse(ts))) {
    return new Date(ts).toISOString().slice(0, 10);
  }
  const toDate = (ts as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(ts).toISOString().slice(0, 10) : undefined;
}

export function createFirestoreKnownStore(
  getDb: () => Firestore | null = getFirestoreDb
): KnownStore {
  const user = (userId: string): FirebaseFirestore.DocumentReference | null =>
    getDb()?.collection('bogle_users').doc(userId) ?? null;
  return {
    facts: async (userId) => listRemembered(userId, firestoreMemoryControlStore),
    async forgotten(userId) {
      const topics = await firestoreForgetStore.topics(userId);
      if (topics === null) throw new Error('Forgotten topics unreadable');
      return topics;
    },
    async worldFacts(userId) {
      const snap = await user(userId)
        ?.collection('world_facts')
        .where('validTo', '==', null)
        .limit(MAX_OPEN_FACTS)
        .get();
      return snap ? snap.docs.map((d) => ({ ...(d.data() as TemporalFact), id: d.id })) : [];
    },
    async mindModel(userId) {
      const doc = await user(userId)?.collection('mind_model').doc('current').get();
      return doc?.exists ? asMindModel(doc.data()) : null;
    },
    async pondering(userId) {
      const doc = await user(userId)?.collection('predictive_intelligence').doc('pondering').get();
      return doc?.exists ? ((doc.data() as StoredPondering | undefined) ?? null) : null;
    },
    async summaryDays(userId, ids) {
      const root = user(userId);
      const db = getDb();
      const days = new Map<string, string>();
      if (!root || !db) return days;
      const docs = await db.getAll(...ids.map((id) => root.collection('summaries').doc(id)));
      for (const d of docs) {
        const day = d.exists ? dayOf(d.get('timestamp')) : undefined;
        if (day) days.set(d.id, day);
      }
      return days;
    },
  };
}

export const firestoreKnownStore: KnownStore = createFirestoreKnownStore();
