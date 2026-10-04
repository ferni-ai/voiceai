/**
 * Challenge records every API instance sees.
 *
 * Music and social challenges lived in a Map inside each process. Cloud Run
 * runs up to 10 API instances, so a challenge created on one was unknown to
 * the rest. Its challengee then got 404/403 depending on which instance
 * answered, and the "is this your challenge?" check only saw that instance's
 * records. Authorization depended on load balancing.
 *
 * On Cloud Run (K_SERVICE set, or CHALLENGE_STORE=firestore) records live in
 * Firestore, one document per challenge, and read-modify-writes run in a
 * transaction so two instances can't both answer one challenge. With no
 * Firestore available there, calls throw: a per-instance fallback would bring
 * the split back. Elsewhere (local dev, tests) records live in memory.
 *
 * Records are stored as JSON (Dates as ISO strings) and the listed date
 * fields are revived on read.
 *
 * @module services/social/challenge-records
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';

type Json = Record<string, unknown>;

interface Backend {
  get(collection: string, id: string): Promise<Json | null>;
  put(collection: string, id: string, data: Json): Promise<void>;
  /** Read, decide, write, in one step. `decide` returns the new data, or null to write nothing. */
  update(
    collection: string,
    id: string,
    decide: (current: Json) => Json | null
  ): Promise<{ current: Json | null; written: Json | null }>;
  where(collection: string, field: string, value: string): Promise<Json[]>;
}

function memoryBackend(): Backend {
  const collections = new Map<string, Map<string, Json>>();
  const col = (name: string) => {
    let c = collections.get(name);
    if (!c) collections.set(name, (c = new Map()));
    return c;
  };
  return {
    async get(collection, id) {
      return col(collection).get(id) ?? null;
    },
    async put(collection, id, data) {
      col(collection).set(id, data);
    },
    async update(collection, id, decide) {
      const current = col(collection).get(id) ?? null;
      const written = current ? decide(current) : null;
      if (written) col(collection).set(id, written);
      return { current, written };
    },
    async where(collection, field, value) {
      return [...col(collection).values()].filter((d) => d[field] === value);
    },
  };
}

function firestoreBackend(): Backend {
  const db = () => {
    const firestore = getFirestoreDb();
    if (!firestore) throw new Error('Challenge store unavailable (no Firestore)');
    return firestore;
  };
  return {
    async get(collection, id) {
      const snap = await db().collection(collection).doc(id).get();
      return snap.exists ? ((snap.data() as Json | undefined) ?? null) : null;
    },
    async put(collection, id, data) {
      await db().collection(collection).doc(id).set(data);
    },
    async update(collection, id, decide) {
      const firestore = db();
      const ref = firestore.collection(collection).doc(id);
      return firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? ((snap.data() as Json | undefined) ?? null) : null;
        const written = current ? decide(current) : null;
        if (written) tx.set(ref, written);
        return { current, written };
      });
    },
    async where(collection, field, value) {
      const snap = await db().collection(collection).where(field, '==', value).get();
      return snap.docs.map((d) => d.data() as Json);
    },
  };
}

let backend: Backend | null = null;

function getBackend(): Backend {
  backend ??=
    process.env.K_SERVICE || process.env.CHALLENGE_STORE === 'firestore'
      ? firestoreBackend()
      : memoryBackend();
  return backend;
}

export interface ChallengeRecords<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  put(record: T): Promise<void>;
  /**
   * Change one record atomically. `change` gets the stored record and returns
   * the new one, or null to leave it alone. Resolves to the stored record
   * before (`current`, null when there is none) and what was written, if anything.
   */
  update(
    id: string,
    change: (current: T) => T | null
  ): Promise<{ current: T | null; written: T | null }>;
  /** Every record whose `field` equals `value`. */
  where(field: keyof T & string, value: string): Promise<T[]>;
}

/** Typed access to one challenge collection. */
export function challengeRecords<T extends { id: string }>(
  collection: string,
  dateFields: ReadonlyArray<keyof T & string>
): ChallengeRecords<T> {
  const toJson = (record: T): Json => JSON.parse(JSON.stringify(record)) as Json;
  const fromJson = (data: Json | null): T | null => {
    if (!data) return null;
    const record: Json = { ...data };
    for (const field of dateFields) {
      const value = record[field];
      if (typeof value === 'string') record[field] = new Date(value);
    }
    return record as T;
  };
  return {
    async get(id) {
      return fromJson(await getBackend().get(collection, id));
    },
    async put(record) {
      await getBackend().put(collection, record.id, toJson(record));
    },
    async update(id, change) {
      const result = await getBackend().update(collection, id, (data) => {
        const next = change(fromJson(data) as T);
        return next ? toJson(next) : null;
      });
      return { current: fromJson(result.current), written: fromJson(result.written) };
    },
    async where(field, value) {
      const rows = await getBackend().where(collection, field, value);
      return rows.map((row) => fromJson(row) as T);
    },
  };
}
