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
 * The record is erased with the account (user-stores.ts) and lapses on its own via heldUntil.
 *
 * @module services/safety/minor-care-shared-hold
 */
import { flagOn } from '../../config/env-flag.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { IDLE_MS, minorCareOn, sharedId, userHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'minor-care-shared-hold' });

type Env = Record<string, string | undefined>;

export const HOLDS_COLLECTION = 'minor_care_holds';
/** How long a read is reused: a hold written in another process is seen within this. */
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

function holds(): FirebaseFirestore.CollectionReference {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  return db.collection(HOLDS_COLLECTION);
}

export const firestoreHoldStore: HoldStore = {
  async heldUntil(userId) {
    const until = (await holds().doc(userId).get()).data()?.heldUntil;
    return typeof until === 'number' ? until : undefined;
  },
  async write(userId, record) {
    await holds().doc(userId).set(record);
  },
};

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

/** This user is held, here or in any other process (flag on). A failed read: not held. */
export async function sharedHeld(
  userId: string | undefined,
  env: Env = process.env,
  now = Date.now()
): Promise<boolean> {
  if (!sharedHoldOn(env) || !holdable(userId)) return false;
  if (userHeld(userId, env)) return true;
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.until > now;
  try {
    const until = (await store.heldUntil(userId)) ?? 0;
    remember(userId, until, now);
    return until > now;
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CARE shared hold unreadable: treated as not held');
    return false;
  }
}
