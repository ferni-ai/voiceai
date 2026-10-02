/**
 * Firestore persistence for personal insights.
 *
 * Reads (owned by other agents, read-only here):
 *   bogle_users/{uid}/dynamic_facts, dynamic_entities, dynamic_relationships,
 *   summaries, conversations, memory_tombstones, conflict_history
 * Writes (owned here, all derived, all carry sourceConversationIds):
 *   bogle_users/{uid}/people_profiles/{personId}
 *   bogle_users/{uid}/life_threads/{threadId}
 *   bogle_users/{uid}/personal_insights/current
 *   bogle_users/{uid}/prediction_outcomes/{conversationId}
 *
 * @module services/personal-insights/firestore-store
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { INSIGHTS_LIMITS } from './config.js';
import {
  normalizeConflict,
  normalizeConversation,
  normalizeEntity,
  normalizeFact,
  normalizeRelationship,
  normalizeSummary,
  withConversationSummaries,
  type RawDoc,
} from './source-normalize.js';
import type {
  InsightBundle,
  LifeThread,
  PersonProfile,
  PredictionOutcome,
  UserMemorySources,
} from './types.js';

// Minimal structural Firestore surface (the real client and test doubles both fit).
export interface DocSnapLike {
  id: string;
  exists?: boolean;
  data(): Record<string, unknown> | undefined;
  ref: DocRefLike;
}
export interface QueryLike {
  where(field: string, op: string, value: unknown): QueryLike;
  orderBy(field: string, dir?: 'asc' | 'desc'): QueryLike;
  limit(n: number): QueryLike;
  get(): Promise<{ docs: DocSnapLike[] }>;
}
export interface CollectionLike extends QueryLike {
  doc(id: string): DocRefLike;
}
export interface DocRefLike {
  id: string;
  get(): Promise<DocSnapLike>;
  set(data: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
  collection(name: string): CollectionLike;
}
export interface FirestoreLike {
  collection(name: string): CollectionLike;
}

export const DERIVED_COLLECTIONS = [
  'people_profiles',
  'life_threads',
  'prediction_outcomes',
] as const;
export const BUNDLE_COLLECTION = 'personal_insights';
export const BUNDLE_DOC = 'current';

/** What the pipeline needs from storage; the Firestore one is below, tests use fakes. */
export interface InsightsStore {
  loadSources(userId: string): Promise<UserMemorySources>;
  loadTombstoneIds(userId: string): Promise<Set<string>>;
  writeTombstone(userId: string, id: string): Promise<void>;
  loadPeople(userId: string): Promise<PersonProfile[]>;
  loadThreads(userId: string): Promise<LifeThread[]>;
  loadBundle(userId: string): Promise<InsightBundle | null>;
  loadOutcomes(userId: string, limit: number): Promise<PredictionOutcome[]>;
  saveOutcome(userId: string, outcome: PredictionOutcome): Promise<void>;
  saveDerived(
    userId: string,
    derived: {
      people: readonly PersonProfile[];
      threads: readonly LifeThread[];
      bundle: InsightBundle;
    }
  ): Promise<void>;
  deletePerson(userId: string, personId: string): Promise<PersonProfile | null>;
  /** Delete derived docs citing a conversation; returns counts per collection. */
  deleteDerivedFor(userId: string, conversationId: string): Promise<Record<string, number>>;
  deleteAllDerived(userId: string): Promise<Record<string, number>>;
}

/** Strip undefined (Firestore rejects it) and make plain JSON. */
function plain<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function createFirestoreInsightsStore(
  getDb: () => FirestoreLike | null = defaultDb
): InsightsStore {
  const user = (userId: string) => {
    const db = getDb();
    return db ? db.collection('bogle_users').doc(userId) : null;
  };
  const readAll = async (
    userId: string,
    name: string,
    limit: number,
    order?: string
  ): Promise<RawDoc[]> => {
    const u = user(userId);
    if (!u) return [];
    try {
      let q: QueryLike = u.collection(name);
      if (order) q = q.orderBy(order, 'desc');
      const snap = await q.limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
    } catch {
      return [];
    }
  };
  const docsOf = async <T>(userId: string, name: string, limit = 500): Promise<T[]> =>
    (await readAll(userId, name, limit)).map((d) => d.data as unknown as T);

  const deleteWhere = async (
    userId: string,
    name: string,
    conversationId: string
  ): Promise<number> => {
    const u = user(userId);
    if (!u) return 0;
    const snap = await u
      .collection(name)
      .where('sourceConversationIds', 'array-contains', conversationId)
      .get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    return snap.docs.length;
  };
  const deleteAll = async (userId: string, name: string): Promise<number> => {
    const u = user(userId);
    if (!u) return 0;
    let total = 0;
    for (;;) {
      const snap = await u.collection(name).limit(300).get();
      if (snap.docs.length === 0) return total;
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
      total += snap.docs.length;
    }
  };
  const replaceCollection = async (
    userId: string,
    name: string,
    docs: ReadonlyArray<{ id: string }>
  ): Promise<void> => {
    const u = user(userId);
    if (!u) return;
    const keep = new Set(docs.map((d) => d.id));
    const existing = await u.collection(name).limit(1000).get();
    await Promise.all([
      ...existing.docs.filter((d) => !keep.has(d.id)).map((d) => d.ref.delete()),
      ...docs.map((d) => u.collection(name).doc(d.id).set(plain(d))),
    ]);
  };

  return {
    async loadSources(userId) {
      const L = INSIGHTS_LIMITS;
      const [facts, entities, relationships, summaries, conversations, conflicts] =
        await Promise.all([
          readAll(userId, 'dynamic_facts', L.maxFacts),
          readAll(userId, 'dynamic_entities', L.maxEntities),
          readAll(userId, 'dynamic_relationships', L.maxRelationships),
          readAll(userId, 'summaries', L.maxSummaries, 'timestamp'),
          readAll(userId, 'conversations', L.maxConversations, 'startedAt'),
          readAll(userId, 'conflict_history', 100, 'timestamp'),
        ]);
      const convs = conversations.map(normalizeConversation).filter((c) => c !== null);
      return {
        facts: facts.map(normalizeFact).filter((f) => f !== null),
        entities: entities.map(normalizeEntity).filter((e) => e !== null),
        relationships: relationships.map(normalizeRelationship).filter((r) => r !== null),
        summaries: withConversationSummaries(
          summaries.map(normalizeSummary).filter((s) => s !== null),
          convs
        ),
        conversations: convs,
        conflicts: conflicts.map(normalizeConflict).filter((c) => c !== null),
      };
    },
    async loadTombstoneIds(userId) {
      return new Set((await readAll(userId, 'memory_tombstones', 2000)).map((d) => d.id));
    },
    async writeTombstone(userId, id) {
      await user(userId)
        ?.collection('memory_tombstones')
        .doc(id)
        .set({ createdAt: new Date().toISOString(), reason: 'user_deleted', kind: 'person' });
    },
    loadPeople: (userId) => docsOf<PersonProfile>(userId, 'people_profiles'),
    loadThreads: (userId) => docsOf<LifeThread>(userId, 'life_threads'),
    async loadBundle(userId) {
      const u = user(userId);
      if (!u) return null;
      const snap = await u.collection(BUNDLE_COLLECTION).doc(BUNDLE_DOC).get();
      const data = snap.exists === false ? undefined : snap.data();
      return data ? (data as unknown as InsightBundle) : null;
    },
    async loadOutcomes(userId, limit) {
      const docs = await readAll(userId, 'prediction_outcomes', limit, 'scoredAt');
      return docs.map((d) => d.data as unknown as PredictionOutcome);
    },
    async saveOutcome(userId, outcome) {
      await user(userId)
        ?.collection('prediction_outcomes')
        .doc(outcome.conversationId)
        .set(plain(outcome));
    },
    async saveDerived(userId, { people, threads, bundle }) {
      await Promise.all([
        replaceCollection(userId, 'people_profiles', people),
        replaceCollection(userId, 'life_threads', threads),
        user(userId)?.collection(BUNDLE_COLLECTION).doc(BUNDLE_DOC).set(plain(bundle)),
      ]);
    },
    async deletePerson(userId, personId) {
      const u = user(userId);
      if (!u) return null;
      const ref = u.collection('people_profiles').doc(personId);
      const snap = await ref.get();
      const data = snap.exists === false ? undefined : snap.data();
      await ref.delete();
      return data ? (data as unknown as PersonProfile) : null;
    },
    async deleteDerivedFor(userId, conversationId) {
      const counts: Record<string, number> = {};
      for (const name of DERIVED_COLLECTIONS)
        counts[name] = await deleteWhere(userId, name, conversationId);
      const u = user(userId);
      const bundleRef = u?.collection(BUNDLE_COLLECTION).doc(BUNDLE_DOC);
      const bundle = bundleRef ? await bundleRef.get() : null;
      const ids = (bundle?.data()?.sourceConversationIds ?? []) as unknown[];
      counts[BUNDLE_COLLECTION] = 0;
      if (bundleRef && ids.includes(conversationId)) {
        await bundleRef.delete();
        counts[BUNDLE_COLLECTION] = 1;
      }
      return counts;
    },
    async deleteAllDerived(userId) {
      const counts: Record<string, number> = {};
      for (const name of [...DERIVED_COLLECTIONS, BUNDLE_COLLECTION])
        counts[name] = await deleteAll(userId, name);
      return counts;
    },
  };
}

function defaultDb(): FirestoreLike | null {
  return getFirestoreDb() as unknown as FirestoreLike | null;
}
