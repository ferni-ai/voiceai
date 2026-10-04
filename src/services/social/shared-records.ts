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
import { getBackend, type Decide, type Json } from './shared-records-backend.js';

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

/** A transaction over shared records (see sharedTransaction). */
export interface SharedTx {
  get<T>(records: SharedRecords<T>, id: string): Promise<T | null>;
  set<T>(records: SharedRecords<T>, id: string, record: T): void;
  remove<T>(records: SharedRecords<T>, id: string): void;
}

/**
 * Run `fn` as one transaction across any shared collections. Do every get
 * before the first set (Firestore requires it). On Firestore, a conflicting
 * write makes the whole function run again, so keep it free of side effects.
 */
export async function sharedTransaction<R>(fn: (tx: SharedTx) => Promise<R>): Promise<R> {
  return getBackend().transact(async (raw) =>
    fn({
      get: async (records, id) => records.decode(await raw.get(records.collection, id)),
      set: (records, id, record) => raw.set(records.collection, id, records.encode(record)),
      remove: (records, id) => raw.remove(records.collection, id),
    })
  );
}

export interface SharedRecords<T> {
  readonly collection: string;
  /** The stored form of a record (JSON, plus ttlAt), and back. For sharedTransaction. */
  encode(record: T): Json;
  decode(data: Json | null): T | null;
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
  /**
   * Records matching every equality filter. `limit` is applied by the store
   * itself, so one user's thousands of records are never all read.
   */
  query(filters: Partial<Record<keyof T & string, string>>, limit: number): Promise<T[]>;
  /** The `limit` records with the highest `field`, highest first (no filters). */
  top(field: string, limit: number): Promise<T[]>;
  /** How many records have `field` above `value` (a count aggregation). */
  countAbove(field: string, value: number): Promise<number>;
  remove(id: string): Promise<void>;
  /** Delete every record whose `field` equals `value` (in pages); resolves to how many. */
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
    collection,
    encode: toJson,
    decode: fromJson,
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
    async query(filters, limit) {
      const rows = await getBackend().query(collection, filters as Record<string, string>, limit);
      return rows.map((row) => fromJson(row.data) as T);
    },
    async top(field, limit) {
      return (await getBackend().top(collection, field, limit)).map((row) => fromJson(row) as T);
    },
    async countAbove(field, value) {
      return getBackend().countAbove(collection, field, value);
    },
    async remove(id) {
      await getBackend().remove(collection, id);
    },
    async removeWhere(field, value) {
      let removed = 0;
      for (;;) {
        const rows = await getBackend().query(collection, { [field]: value }, 200);
        if (rows.length === 0) return removed;
        await Promise.all(rows.map(async (row) => getBackend().remove(collection, row.id)));
        removed += rows.length;
      }
    },
  };
}
