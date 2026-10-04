/**
 * Records every API instance sees: challenges, taste-match games, leaderboard
 * entries and game stats.
 *
 * These lived in a Map inside each process. Cloud Run runs up to 10 API
 * instances, so a record written on one was unknown to the rest: a challengee
 * got 404/403 depending on which instance answered, a game started on one
 * instance couldn't be played on another, and each instance showed its own
 * leaderboard. Authorization depended on load balancing.
 *
 * On Cloud Run (K_SERVICE set, or CHALLENGE_STORE=firestore) records live in
 * Firestore, one document each. Read-modify-writes run in a transaction, so two
 * instances can't both answer one challenge or lose each other's increments.
 * With no Firestore available there, calls throw: a per-instance fallback would
 * bring the split back. Elsewhere (local dev, tests) records live in memory.
 *
 * Records are stored as JSON (Dates as ISO strings) and the listed date fields
 * are revived on read. A collection may give each record a `ttlAt` (a real
 * Date, i.e. a Firestore Timestamp, which Firestore TTL policies require) saying
 * when it can be deleted; it is written on every put and update and never
 * returned to callers.
 *
 * @module services/social/shared-records
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';

type Json = Record<string, unknown>;
type Decide = (current: Json | null) => Json | null;

interface Backend {
  get(collection: string, id: string): Promise<Json | null>;
  put(collection: string, id: string, data: Json): Promise<void>;
  /** Read, decide, write, in one step. `decide` returns the new data, or null to write nothing. */
  update(
    collection: string,
    id: string,
    decide: Decide
  ): Promise<{ current: Json | null; written: Json | null }>;
  where(
    collection: string,
    field: string,
    value: string
  ): Promise<Array<{ id: string; data: Json }>>;
  all(collection: string): Promise<Json[]>;
  remove(collection: string, id: string): Promise<void>;
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
      const written = decide(current);
      if (written) col(collection).set(id, written);
      return { current, written };
    },
    async where(collection, field, value) {
      return [...col(collection)]
        .filter(([, d]) => d[field] === value)
        .map(([id, data]) => ({ id, data }));
    },
    async all(collection) {
      return [...col(collection).values()];
    },
    async remove(collection, id) {
      col(collection).delete(id);
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
    async where(collection, field, value) {
      const snap = await db().collection(collection).where(field, '==', value).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Json }));
    },
    async all(collection) {
      const snap = await db().collection(collection).get();
      return snap.docs.map((d) => d.data() as Json);
    },
    async remove(collection, id) {
      await db().collection(collection).doc(id).delete();
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

/** `days` after `from`, for ttlAt values. */
export function daysAfter(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface SharedRecordsOptions<T> {
  /** Top-level fields stored as ISO strings and revived as Dates. */
  dateFields: ReadonlyArray<keyof T & string>;
  /** When a record may be deleted (written as `ttlAt`). Omit for long-lived records. */
  ttlAt?: (record: T, now: Date) => Date;
}

export interface SharedRecords<T> {
  get(id: string): Promise<T | null>;
  put(id: string, record: T): Promise<void>;
  /**
   * Change one existing record atomically. `change` gets the stored record and
   * returns the new one, or null to leave it alone. Resolves to the record before
   * (`current`, null when there is none) and what was written, if anything.
   */
  update(
    id: string,
    change: (current: T) => T | null
  ): Promise<{ current: T | null; written: T | null }>;
  /** Like update, but `change` also runs (with null) when there is no record yet. */
  upsert(id: string, change: (current: T | null) => T | null): Promise<T | null>;
  /** Every record whose `field` equals `value`. */
  where(field: keyof T & string, value: string): Promise<T[]>;
  /** Every record in the collection. */
  all(): Promise<T[]>;
  /** Delete every record whose `field` equals `value`; resolves to how many. */
  removeWhere(field: keyof T & string, value: string): Promise<number>;
}

/** Typed access to one shared collection. */
export function sharedRecords<T>(
  collection: string,
  options: SharedRecordsOptions<T>
): SharedRecords<T> {
  const toJson = (record: T): Json => {
    const json = JSON.parse(JSON.stringify(record)) as Json;
    return options.ttlAt ? { ...json, ttlAt: options.ttlAt(record, new Date()) } : json;
  };
  const fromJson = (data: Json | null): T | null => {
    if (!data) return null;
    const { ttlAt: _ttl, ...record } = data;
    for (const field of options.dateFields) {
      const value = record[field];
      if (typeof value === 'string') record[field] = new Date(value);
    }
    return record as T;
  };
  const decideWith =
    (change: (current: T | null) => T | null): Decide =>
    (data) => {
      const next = change(fromJson(data));
      return next ? toJson(next) : null;
    };
  return {
    async get(id) {
      return fromJson(await getBackend().get(collection, id));
    },
    async put(id, record) {
      await getBackend().put(collection, id, toJson(record));
    },
    async update(id, change) {
      const result = await getBackend().update(
        collection,
        id,
        decideWith((current) => (current ? change(current) : null))
      );
      return { current: fromJson(result.current), written: fromJson(result.written) };
    },
    async upsert(id, change) {
      const result = await getBackend().update(collection, id, decideWith(change));
      return fromJson(result.written ?? result.current);
    },
    async where(field, value) {
      const rows = await getBackend().where(collection, field, value);
      return rows.map((row) => fromJson(row.data) as T);
    },
    async all() {
      return (await getBackend().all(collection)).map((row) => fromJson(row) as T);
    },
    async removeWhere(field, value) {
      const rows = await getBackend().where(collection, field, value);
      await Promise.all(rows.map(async (row) => getBackend().remove(collection, row.id)));
      return rows.length;
    },
  };
}
