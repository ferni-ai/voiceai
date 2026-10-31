/**
 * The call sheet's store: bogle_users/{uid}/person_model/current, plus person_model/prev,
 * the copy it replaced, for the "what changed" diff (call-sheet plan, lane M2).
 *
 * - loadPersonModelInputs reads what the pure build takes, bounded (30 summaries, 300
 *   temporal snapshots, 300 facts, 200 of each other store). Facts go through the recall
 *   loader (forget marks, corrections, low confidence); forgotten topics via the port.
 * - savePersonModel is the only writer: one transaction that writes nothing when the
 *   stored inputHash is the new one, else moves current to prev and stores the new one.
 *
 * Erased with the person's record (user-stores.ts), exported (user-records-export.ts),
 * copied to dev (copy-user.ts). Nothing reads it in a call until lane M6 (PERSON_MODEL_READ).
 *
 * @module services/stores/person-model-store
 */
import type { Firestore, Query } from '@google-cloud/firestore';
import {
  PERSON_MODEL_VERSION,
  type PersonModel,
  type PersonModelInputs,
} from '../../intelligence/person-model/index.js';
import { firestoreForgottenStore } from '../../memory/adapters/firestore/forgotten-store.js';
import { loadRecallSnapshot } from '../../memory/recall/session-recall.js';

const PERSON_MODEL_COLLECTION = 'person_model';
/** The model as stored: the build, rendered, and the hash of the inputs it was built from. */
export type StoredPersonModel = PersonModel & { inputHash: string };

const UID = /^[\w:.@+-]{1,200}$/;
const userDoc = (db: Firestore, uid: string) => {
  if (!UID.test(uid)) throw new Error('person model: refusing an invalid user id');
  return db.collection('bogle_users').doc(uid);
};
const sheet = (db: Firestore, uid: string, id: 'current' | 'prev') =>
  userDoc(db, uid).collection(PERSON_MODEL_COLLECTION).doc(id);

/** The stored current model, or null when there is none or it isn't this build's shape. */
export async function readPersonModel(
  db: Firestore,
  uid: string
): Promise<StoredPersonModel | null> {
  const data = (await sheet(db, uid, 'current').get()).data();
  return data?.v === PERSON_MODEL_VERSION &&
    data.userId === uid &&
    typeof data.inputHash === 'string'
    ? (data as StoredPersonModel)
    : null;
}

/**
 * Stores `model` as current, moving the old current to prev, in one
 * transaction. Writes nothing ('unchanged') when the stored current was built
 * from the same inputs, so a rerun costs one read.
 */
export async function savePersonModel(
  db: Firestore,
  uid: string,
  model: PersonModel,
  inputHash: string
): Promise<'written' | 'unchanged'> {
  const current = sheet(db, uid, 'current');
  const prev = sheet(db, uid, 'prev');
  return db.runTransaction(async (tx) => {
    const old = (await tx.get(current)).data();
    if (old?.inputHash === inputHash) return 'unchanged';
    if (old) tx.set(prev, old);
    tx.set(current, { ...model, inputHash } satisfies StoredPersonModel);
    return 'written';
  });
}

type Docs = Array<Record<string, unknown>>;
const docsOf = async (q: Query): Promise<Docs> => (await q.get()).docs.map((d) => d.data());
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/**
 * Everything the build reads for one person, or null when their record is
 * gone (erased). Throws when a store can't be read, so a half-read person is
 * never built.
 */
export async function loadPersonModelInputs(
  db: Firestore,
  uid: string
): Promise<PersonModelInputs | null> {
  const user = userDoc(db, uid);
  const profile = await user.get();
  if (!profile.exists) return null;
  const root = profile.data() ?? {};
  const prefs = (root.preferences ?? {}) as Record<string, unknown>;
  const sub = (name: string) => user.collection(name);
  const [summaries, temporalSnapshots, rawFacts, forgotten, ...rest] = await Promise.all([
    docsOf(sub('summaries').orderBy('timestamp', 'desc').limit(30)),
    docsOf(sub('temporal_snapshots').orderBy('timestamp', 'desc').limit(300)),
    docsOf(sub('dynamic_facts').orderBy('extractedAt', 'desc').limit(300)),
    firestoreForgottenStore(db).readForgotten(uid),
    ...[
      'relationship_network',
      'commitments',
      'ferni_commitments',
      'follow_through',
      'world_facts',
      'topic_patterns',
    ].map((name) => docsOf(sub(name).limit(200))),
  ]);
  const [relationshipNetwork, commitments, ferniCommitments, followThrough, worldFacts, topics] =
    rest;
  const { facts } = await loadRecallSnapshot(
    {
      facts: async () => rawFacts,
      summaries: async () => [],
      forgotten: async () => forgotten.topics,
    },
    uid
  );
  return {
    userId: uid,
    timezone: text(prefs.timezone) ?? text(root.timezone),
    summaries,
    temporalSnapshots,
    facts,
    relationshipNetwork,
    familyMembers: Array.isArray(root.familyMembers) ? (root.familyMembers as Docs) : [],
    commitments,
    ferniCommitments,
    followThrough,
    worldFacts,
    topicPatterns: topics,
    forgotten: forgotten.topics,
    forgetGeneration: forgotten.generation,
  };
}
