/**
 * Where returning-caller records live and what they may hold
 * (returning-caller.ts): the field allow-list, the Firestore store with its
 * transactional writes, and the checks on a stored doc (expired, tombstone,
 * denial cooldown). Two top-level, server-only collections, both with an
 * expireAt TTL field.
 *
 * @module services/identity/returning-caller-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export const RETURNING_CALLERS = 'returning_callers';
/** Pending-erase markers: a "forget me" whose tombstone couldn't be stored yet. */
export const RETURNING_CALLER_ERASURES = 'returning_caller_erasures';

export const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The only fields a record may hold. */
export const RETURNING_CALLER_FIELDS = [
  'firstName',
  'summary',
  'lastCallAt',
  'callCount',
  'expireAt',
  'forgotten',
  'deniedUntil',
] as const;

export interface StoredReturningCaller {
  firstName?: string;
  summary?: string;
  lastCallAt: Date;
  callCount: number;
  expireAt: Date;
  /** A tombstone: they asked not to be remembered; no name or summary, until expiry. */
  forgotten?: true;
  /** Someone on this number stated another name: nothing is surfaced or refreshed until then. */
  deniedUntil?: Date;
}

export interface ReturningCallerStore {
  get: (hash: string) => Promise<Record<string, unknown> | null>;
  set: (hash: string, data: StoredReturningCaller) => Promise<void>;
  /**
   * Writes, unless (read in the same transaction) the doc is a live tombstone,
   * or a live pending-erase marker exists: then it stores the tombstone instead
   * and clears the marker. False when the record was not written.
   */
  setUnlessForgotten: (hash: string, data: StoredReturningCaller, now: Date) => Promise<boolean>;
  /** A live pending-erase marker for this hash. */
  erasurePending: (hash: string, now: Date) => Promise<boolean>;
  markErasure: (hash: string, expireAt: Date) => Promise<void>;
  clearErasure: (hash: string) => Promise<void>;
  /** Sets deniedUntil on a live record (not a tombstone), in a transaction. */
  markDenied: (hash: string, until: Date, now: Date) => Promise<void>;
}

export const firestoreReturningCallerStore: ReturningCallerStore = {
  async get(hash) {
    const snap = await getFirestoreDb()?.collection(RETURNING_CALLERS).doc(hash).get();
    return snap?.exists ? (snap.data() ?? null) : null;
  },
  async set(hash, data) {
    await getFirestoreDb()?.collection(RETURNING_CALLERS).doc(hash).set(data);
  },
  async setUnlessForgotten(hash, data, now) {
    const db = getFirestoreDb();
    if (!db) return false;
    const ref = db.collection(RETURNING_CALLERS).doc(hash);
    const marker = db.collection(RETURNING_CALLER_ERASURES).doc(hash);
    return db.runTransaction(async (tx) => {
      const [snap, mark] = await Promise.all([tx.get(ref), tx.get(marker)]);
      const stored = snap.exists ? (snap.data() ?? null) : null;
      if (isLiveTombstone(stored, now) || deniedNow(stored, now)) return false;
      if (isLive(mark.exists ? (mark.data() ?? null) : null, now)) {
        tx.set(ref, tombstone(now));
        tx.delete(marker);
        return false;
      }
      tx.set(ref, data);
      return true;
    });
  },
  async erasurePending(hash, now) {
    const snap = await getFirestoreDb()?.collection(RETURNING_CALLER_ERASURES).doc(hash).get();
    return isLive(snap?.exists ? (snap.data() ?? null) : null, now);
  },
  async markErasure(hash, expireAt) {
    await getFirestoreDb()?.collection(RETURNING_CALLER_ERASURES).doc(hash).set({ expireAt });
  },
  async clearErasure(hash) {
    await getFirestoreDb()?.collection(RETURNING_CALLER_ERASURES).doc(hash).delete();
  },
  async markDenied(hash, until, now) {
    const db = getFirestoreDb();
    if (!db) return;
    const ref = db.collection(RETURNING_CALLERS).doc(hash);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.exists ? (snap.data() ?? null) : null;
      if (!isLive(stored, now) || isLiveTombstone(stored, now)) return;
      tx.set(ref, toStoredRecord({ ...stored, deniedUntil: until }));
    });
  },
};

/** Only the allow-listed fields, so nothing else can reach the store. */
export function toStoredRecord(input: Record<string, unknown>): StoredReturningCaller {
  const out: Record<string, unknown> = {};
  for (const field of RETURNING_CALLER_FIELDS) {
    if (input[field] !== undefined) out[field] = input[field];
  }
  return out as unknown as StoredReturningCaller;
}

export function expiryOf(data: Record<string, unknown>): Date | undefined {
  const expire = data.expireAt as { toDate?: () => Date } | Date | undefined;
  return expire instanceof Date ? expire : expire?.toDate?.();
}

/** A stored doc that hasn't expired (TTL deletion can lag). */
export function isLive(data: Record<string, unknown> | null, now: Date): boolean {
  return !!data && (expiryOf(data)?.getTime() ?? Infinity) > now.getTime();
}

/** A stored "forget me" marker that hasn't expired. */
export function isLiveTombstone(data: Record<string, unknown> | null, now: Date): boolean {
  return data?.forgotten === true && isLive(data, now);
}

/** A record held by a denial cooldown. */
export function deniedNow(data: Record<string, unknown> | null, now: Date): boolean {
  const until = data?.deniedUntil as { toDate?: () => Date } | Date | undefined;
  const at = until instanceof Date ? until : until?.toDate?.();
  return !!at && at.getTime() > now.getTime();
}

/** What "forget me" leaves: no name, no summary, the number forgotten until expiry. */
export function tombstone(now: Date): StoredReturningCaller {
  const expireAt = new Date(now.getTime() + TTL_MS);
  return toStoredRecord({ forgotten: true, lastCallAt: now, callCount: 0, expireAt });
}
