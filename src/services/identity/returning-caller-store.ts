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
/** Wrong names stated for a record, across every call: at this many it is never surfaced again. */
export const MAX_NAME_GUESSES = 3;

/** The only fields a record may hold. */
export const RETURNING_CALLER_FIELDS = [
  'firstName',
  'summary',
  'lastCallAt',
  'callCount',
  'expireAt',
  'forgotten',
  'deniedUntil',
  'failedGuesses',
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
  /** Wrong names stated for this record on any call, counted in the denial's transaction. */
  failedGuesses?: number;
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
  /**
   * Sets deniedUntil on a live record (not a tombstone) and counts the wrong
   * name, in one transaction, so calls running at once each count. Throws when
   * nothing could be stored.
   */
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
      if (isLiveTombstone(stored, now) || deniedNow(stored, now) || guessesSpent(stored)) {
        return false;
      }
      if (isLive(mark.exists ? (mark.data() ?? null) : null, now)) {
        tx.set(ref, tombstone(now));
        tx.delete(marker);
        return false;
      }
      // A refresh keeps the count of wrong names: only expiry clears it.
      const failedGuesses = isLive(stored, now) ? stored?.failedGuesses : undefined;
      tx.set(ref, toStoredRecord({ ...data, failedGuesses }));
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
    if (!db) throw new Error('Firestore unavailable');
    const ref = db.collection(RETURNING_CALLERS).doc(hash);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.exists ? (snap.data() ?? null) : null;
      if (!isLive(stored, now) || isLiveTombstone(stored, now)) return;
      tx.set(ref, withDenial(stored, until));
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

/** A stored record with one more wrong name counted, held until `until`. */
export function withDenial(
  stored: Record<string, unknown> | null,
  until: Date
): StoredReturningCaller {
  const before = typeof stored?.failedGuesses === 'number' ? stored.failedGuesses : 0;
  return toStoredRecord({ ...stored, deniedUntil: until, failedGuesses: before + 1 });
}

/** A record that has had MAX_NAME_GUESSES wrong names: never surfaced or refreshed again. */
export function guessesSpent(data: Record<string, unknown> | null): boolean {
  const n = data?.failedGuesses;
  return typeof n === 'number' && n >= MAX_NAME_GUESSES;
}

/** What "forget me" leaves: no name, no summary, the number forgotten until expiry. */
export function tombstone(now: Date): StoredReturningCaller {
  const expireAt = new Date(now.getTime() + TTL_MS);
  return toStoredRecord({ forgotten: true, lastCallAt: now, callCount: 0, expireAt });
}
