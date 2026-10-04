/**
 * Where shared records live: Firestore on Cloud Run (K_SERVICE set, or
 * CHALLENGE_STORE=firestore), memory elsewhere (local dev, tests). With no
 * Firestore on Cloud Run, calls throw: a per-instance fallback would bring
 * back the split shared-records exists to remove. Used only by shared-records.
 *
 * @module services/social/shared-records-backend
 */
import type { Query } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export type Json = Record<string, unknown>;
export type Decide = (current: Json | null) => Json | null;

export interface Backend {
  get(collection: string, id: string): Promise<Json | null>;
  put(collection: string, id: string, data: Json): Promise<void>;
  /** Read, decide, write, in one step. `decide` returns the new data, or null to write nothing. */
  update(
    collection: string,
    id: string,
    decide: Decide
  ): Promise<{ current: Json | null; written: Json | null }>;
  /** Records matching every equality filter, at most `limit` of them (the store stops there). */
  query(
    collection: string,
    filters: Record<string, string>,
    limit: number
  ): Promise<Array<{ id: string; data: Json }>>;
  /** The `limit` records with the highest `field`, highest first. */
  top(collection: string, field: string, limit: number): Promise<Json[]>;
  /** How many records have `field` greater than `value` (a count, not a read of them). */
  countAbove(collection: string, field: string, value: number): Promise<number>;
  remove(collection: string, id: string): Promise<void>;
  /** Run `fn` as one transaction: reads first, then writes, all or nothing. */
  transact<R>(fn: (tx: RawTx) => Promise<R>): Promise<R>;
}

export interface RawTx {
  get(collection: string, id: string): Promise<Json | null>;
  set(collection: string, id: string, data: Json): void;
  remove(collection: string, id: string): void;
}

/** A field by dotted path ('gameStats.guess.totalScore'), as Firestore reads it. */
const at = (doc: Json, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v as Json | undefined)?.[k], doc);

function memoryBackend(): Backend {
  const collections = new Map<string, Map<string, Json>>();
  let lock: Promise<unknown> = Promise.resolve();
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
      const written = decide(current);
      if (written) col(collection).set(id, written);
      return { current, written };
    },
    async query(collection, filters, limit) {
      return [...col(collection)]
        .filter(([, d]) => Object.entries(filters).every(([f, v]) => d[f] === v))
        .slice(0, limit)
        .map(([id, data]) => ({ id, data }));
    },
    async top(collection, field, limit) {
      return [...col(collection).values()]
        .filter((d) => at(d, field) !== undefined)
        .sort((x, y) => Number(at(y, field)) - Number(at(x, field)))
        .slice(0, limit);
    },
    async countAbove(collection, field, value) {
      return [...col(collection).values()].filter((d) => Number(at(d, field)) > value).length;
    },
    async remove(collection, id) {
      col(collection).delete(id);
    },
    async transact(fn) {
      // One at a time, so a transaction's reads and writes can't interleave with another's.
      const run = lock.then(async () => {
        const pending: Array<[string, string, Json | null]> = [];
        const result = await fn({
          get: async (collection, id) => col(collection).get(id) ?? null,
          set: (collection, id, data) => {
            pending.push([collection, id, data]);
          },
          remove: (collection, id) => {
            pending.push([collection, id, null]);
          },
        });
        for (const [collection, id, data] of pending) {
          if (data) col(collection).set(id, data);
          else col(collection).delete(id);
        }
        return result;
      });
      lock = run.catch(() => undefined);
      return run;
    },
  };
}

function firestoreBackend(): Backend {
  const db = () => {
    const firestore = getFirestoreDb();
    if (!firestore) throw new Error('Shared record store unavailable (no Firestore)');
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
        const written = decide(current);
        if (written) tx.set(ref, written);
        return { current, written };
      });
    },
    async query(collection, filters, limit) {
      // Equality-only filters: Firestore serves these from single-field indexes.
      let q: Query = db().collection(collection);
      for (const [field, value] of Object.entries(filters)) q = q.where(field, '==', value);
      const snap = await q.limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Json }));
    },
    async top(collection, field, limit) {
      // One orderBy, no filter: served by Firestore's automatic single-field index.
      const snap = await db().collection(collection).orderBy(field, 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as Json);
    },
    async countAbove(collection, field, value) {
      const snap = await db().collection(collection).where(field, '>', value).count().get();
      return snap.data().count;
    },
    async remove(collection, id) {
      await db().collection(collection).doc(id).delete();
    },
    async transact(fn) {
      const firestore = db();
      return firestore.runTransaction(async (tx) =>
        fn({
          get: async (collection, id) => {
            const snap = await tx.get(firestore.collection(collection).doc(id));
            return snap.exists ? ((snap.data() as Json | undefined) ?? null) : null;
          },
          set: (collection, id, data) => {
            tx.set(firestore.collection(collection).doc(id), data);
          },
          remove: (collection, id) => {
            tx.delete(firestore.collection(collection).doc(id));
          },
        })
      );
    },
  };
}

let backend: Backend | null = null;

export function getBackend(): Backend {
  backend ??=
    process.env.K_SERVICE || process.env.CHALLENGE_STORE === 'firestore'
      ? firestoreBackend()
      : memoryBackend();
  return backend;
}
