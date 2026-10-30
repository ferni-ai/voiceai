/**
 * MINOR_CARE_SHARED_HOLD (off by default, needs MINOR_CARE): the minor-care hold, seen outside
 * the voice process.
 *
 * The hold (utils/minor-care.ts) lives in the voice agent's memory. The inbound SMS webhook runs
 * in the API server, so a text a held caller sent during or just after the call was kept: the
 * API server can't see the call's hold. When a session becomes held for its user, the voice agent
 * writes minor_care_holds/{userId} = { heldUntil, v: 1 } (when, never words or an age), and
 * refreshes it at the held call's end to the same 6 h idle window. sharedHeld(userId) is the
 * check for writers and senders in any process.
 *
 * A record that can't be read means not held (a warning is logged): failing closed would stop
 * every adult's texts while Firestore is down, and the call itself stays held in its process.
 * Writers that only skip saving fail closed instead (sharedHeldStrict: text chat).
 * Each write sets heldUntil to now + IDLE_MS (never added on), so only another held call extends a
 * hold. The record is erased with the account (user-stores.ts; a number's with the account's
 * numbers, erase-other-keys.ts), and a lapsed one by the TTL policy on expireAt.
 *
 * @module services/outreach/minor-care-shared-hold
 */
import { flagOn } from '../../config/env-flag.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { IDLE_MS, minorCareOn, sharedId, userHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'minor-care-shared-hold' });

type Env = Record<string, string | undefined>;

export const HOLDS_COLLECTION = 'minor_care_holds';
/** How long a held answer is reused (readHeld). A "not held" is never reused. */
export const CACHE_MS = 30_000;
const MAX_CACHED = 5000;

export interface HoldRecord {
  heldUntil: number;
  v: 1;
}

export interface HoldStore {
  heldUntil: (userId: string) => Promise<number | undefined>;
  write: (userId: string, record: HoldRecord) => Promise<void>;
}

function firestore(): FirebaseFirestore.Firestore {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  return db;
}
const holds = () => firestore().collection(HOLDS_COLLECTION);

/** A stored time (ms), or 0 when there is none. */
const timeOf = (v: unknown): number => (typeof v === 'number' ? v : 0);

export const firestoreHoldStore: HoldStore = {
  async heldUntil(userId) {
    const until = (await holds().doc(userId).get()).data()?.heldUntil;
    return typeof until === 'number' ? until : undefined;
  },
  // expireAt (a Date is stored as a Timestamp): the TTL field that deletes lapsed holds. A merge,
  // and never before keepUntil: the same doc keeps the purges' held windows (held-window.ts).
  // None while a window is unscrubbed: it hides what the failed scrub left (null isn't a TTL date).
  async write(userId, record) {
    const ref = holds().doc(userId);
    await firestore().runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      const until = Math.max(record.heldUntil, timeOf(data?.keepUntil), timeOf(data?.quietUntil));
      const list: unknown[] = Array.isArray(data?.windows) ? data.windows : [];
      const pending = list.some((w) => (w as { scrubbed?: unknown })?.scrubbed !== true);
      tx.set(ref, { ...record, expireAt: pending ? null : new Date(until) }, { merge: true });
    });
  },
};

/**
 * CRISIS_QUIET_FROM_GATE: a held caller's crisis starts the proactive quiet window here, as a
 * time with no words, no crisis type and no session (agents/safety/crisis-quiet-window.ts).
 * Never moved earlier; the TTL never deletes the doc before it. Not gated on
 * MINOR_CARE_SHARED_HOLD: no hold is set, only the quiet time. Throws on a failed write.
 */
export async function recordQuietHold(userId: string, quietUntil: number): Promise<void> {
  if (!holdable(userId)) throw new Error('not a holdable id');
  const ref = holds().doc(userId);
  await firestore().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const until = Math.max(quietUntil, timeOf(data?.quietUntil));
    const list: unknown[] = Array.isArray(data?.windows) ? data.windows : [];
    const pending = list.some((w) => (w as { scrubbed?: unknown })?.scrubbed !== true);
    const expireAt = Math.max(until, timeOf(data?.heldUntil), timeOf(data?.keepUntil));
    tx.set(
      ref,
      { quietUntil: until, expireAt: pending ? null : new Date(expireAt) },
      { merge: true }
    );
  });
}

/** A held caller's quietUntil (ms), 0 for none (human-transfer/crisis-signals.ts). Throws if unreadable. */
export async function quietHoldUntil(
  db: Pick<FirebaseFirestore.Firestore, 'collection'>,
  userId: string
): Promise<number> {
  if (!holdable(userId)) return 0;
  return timeOf((await db.collection(HOLDS_COLLECTION).doc(userId).get()).data()?.quietUntil);
}

let store: HoldStore = firestoreHoldStore;
/** userId -> its heldUntil (0: none) and when that was read. */
const cache = new Map<string, { until: number; at: number }>();

/** Tests only. */
export function setHoldStore(next: HoldStore = firestoreHoldStore): void {
  store = next;
  cache.clear();
}

function remember(userId: string, until: number, at: number): void {
  cache.delete(userId);
  cache.set(userId, { until, at });
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
}

export function sharedHoldOn(env: Env = process.env): boolean {
  return minorCareOn(env) && flagOn('MINOR_CARE_SHARED_HOLD', env);
}

/** One person's id that names one document: never a placeholder, shared or path-like id. */
function holdable(userId: string | undefined): userId is string {
  return !!userId && !sharedId(userId) && !userId.includes('/');
}

/** Held until IDLE_MS from now (a held session started, or a held call ended). Never throws. */
export async function recordSharedHold(
  userId: string,
  env: Env = process.env,
  now = Date.now()
): Promise<void> {
  if (!sharedHoldOn(env) || !holdable(userId)) return;
  const record: HoldRecord = { heldUntil: now + IDLE_MS, v: 1 };
  remember(userId, record.heldUntil, now);
  try {
    await store.write(userId, record);
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CARE shared hold not written');
  }
}

/**
 * The record, read. Only a held answer is reused: another process writes a hold, and nothing
 * here can invalidate a cached "not held", so that answer is always read fresh. Throws if unreadable.
 */
async function readHeld(userId: string, now: number): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_MS && hit.until > now) return true;
  const until = (await store.heldUntil(userId)) ?? 0;
  remember(userId, until, now);
  return until > now;
}

/** This user is held, here or in any other process (flag on). A failed read: not held. */
export async function sharedHeld(
  userId: string | undefined,
  env: Env = process.env,
  now = Date.now()
): Promise<boolean> {
  if (!sharedHoldOn(env) || !holdable(userId)) return false;
  if (userHeld(userId, env)) return true;
  try {
    return await readHeld(userId, now);
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CARE shared hold unreadable: treated as not held');
    return false;
  }
}

/** How long a fail-closed read may take before the caller is treated as held. */
export const STRICT_READ_MS = 1000;

/**
 * sharedHeld for writers that fail closed (text chat, api/chat-minor-care.ts): a record that
 * can't be read, or isn't read within timeoutMs, means held. Nothing is saved; the reply still goes.
 */
export async function sharedHeldStrict(
  userId: string | undefined,
  env: Env = process.env,
  timeoutMs = STRICT_READ_MS
): Promise<boolean> {
  if (!sharedHoldOn(env) || !holdable(userId)) return false;
  if (userHeld(userId, env)) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([readHeld(userId, Date.now()), late]);
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CARE shared hold unreadable: treated as held');
    return true;
  } finally {
    clearTimeout(timer);
  }
}
