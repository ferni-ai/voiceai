/**
 * RETURNING_CALLER=on (default off): Ferni recognises an unverified phone
 * caller who called before, from their attested number, and keeps almost nothing.
 *
 * Each unverified phone call gets a fresh `anon:<uuid>` id, so a caller who
 * gave their name and called back was a stranger. This keeps, per number,
 * only their first name and one short line, for 30 days from their last call:
 *
 *   returning_callers/{HMAC-SHA256(E.164)} =
 *     { firstName?, summary?, lastCallAt, callCount, expireAt }
 *
 * - The number is never stored or logged: the key is an HMAC under a key
 *   derived from LOG_HASH_SECRET for this purpose only (as checkin-replies.ts).
 *   Without the secret the feature does nothing and says so once.
 * - Only the allow-listed fields are written (toStoredRecord). The summary is
 *   built from the call summary's topics, and any topic that might carry an
 *   age, a place, a number, a person's name or a health, faith, money or
 *   legal detail is dropped whole (safeSummary). If none survive, no summary.
 * - Accounts never come here: only an `anon:` session on a SIP call with a
 *   signed attestation A (caller-recognition.ts startReturningCaller), since
 *   caller ID alone can be spoofed.
 * - Nothing is written unless a minor-signal check is registered
 *   (registerMinorSignal) and says the caller is not a likely minor.
 * - A number can be shared, so Ferni never says a stored name first: he greets
 *   warmly without naming anyone, and only a name the caller states that
 *   matches the record confirms them; then the model gets the one-line topic
 *   hint (returning-caller-talk.ts). Only that person refreshes the record.
 * - "Forget me" overwrites the record with a tombstone (no name or summary)
 *   that keeps the number forgotten until expiry, retried with backoff; if it
 *   can't be stored, a pending-erase marker is (returning_caller_erasures, also
 *   TTL), and call start refuses the number and retries while it exists. Ferni
 *   says it's done only once the tombstone is stored. A read that failed, or
 *   a tombstone or marker found at write time, means no record is written.
 * - expireAt is a Firestore TTL field; reads also ignore an expired record.
 *
 * @module services/identity/returning-caller
 */
import { createHmac } from 'node:crypto';
import { flagOn, type Env } from '../../config/env-flag.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { safeFirstName, safeSummary } from './returning-caller-summary.js';
import {
  asksToBeForgotten,
  confirmedNote,
  FORGETTING_NOTE,
  FORGOTTEN_NOTE,
  nameConfirmation,
  POSSIBLY_RETURNING_GREETING,
  POSSIBLY_RETURNING_NOTE,
} from './returning-caller-talk.js';

export { asksToBeForgotten, FORGETTING_NOTE, FORGOTTEN_NOTE } from './returning-caller-talk.js';

const log = createLogger({ module: 'returning-caller' });

export const RETURNING_CALLERS = 'returning_callers';
/** Pending-erase markers: a "forget me" whose tombstone couldn't be stored yet. */
export const RETURNING_CALLER_ERASURES = 'returning_caller_erasures';
/** Domain separation: this key is only ever used to name returning-caller records. */
const HASH_PURPOSE = 'returning-caller/phone/v1';
export const TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Bounds the call-start read: the greeting must not wait on Firestore. */
const LOOKUP_TIMEOUT_MS = 1200;

/** The only fields a record may hold. */
export const RETURNING_CALLER_FIELDS = [
  'firstName',
  'summary',
  'lastCallAt',
  'callCount',
  'expireAt',
  'forgotten',
] as const;

export interface StoredReturningCaller {
  firstName?: string;
  summary?: string;
  lastCallAt: Date;
  callCount: number;
  expireAt: Date;
  /** A tombstone: they asked not to be remembered; no name or summary, until expiry. */
  forgotten?: true;
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
      if (isLiveTombstone(snap.exists ? (snap.data() ?? null) : null, now)) return false;
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
};

export function returningCallerEnabled(env: Env = process.env): boolean {
  return flagOn('RETURNING_CALLER', env);
}

let warnedNoSecret = false;

/** HMAC of an E.164 number under this purpose's key, or null (one warning) without LOG_HASH_SECRET. */
export function callerHash(e164: string, env: Env = process.env): string | null {
  const secret = env.LOG_HASH_SECRET;
  if (!secret) {
    if (!warnedNoSecret) log.warn('Returning caller off: LOG_HASH_SECRET is not set');
    warnedNoSecret = true;
    return null;
  }
  const key = createHmac('sha256', secret).update(HASH_PURPOSE).digest();
  return createHmac('sha256', key).update(e164).digest('hex');
}

/** Only the allow-listed fields, so nothing else can reach the store. */
export function toStoredRecord(input: Record<string, unknown>): StoredReturningCaller {
  const out: Record<string, unknown> = {};
  for (const field of RETURNING_CALLER_FIELDS) {
    if (input[field] !== undefined) out[field] = input[field];
  }
  return out as unknown as StoredReturningCaller;
}

// ---------------------------------------------------------------- per session

export interface ReturningCallerView {
  firstName?: string;
  summary?: string;
}

interface SessionEntry {
  hash: string;
  record?: ReturningCallerView & { callCount: number };
  /** The call-start read didn't complete: what is stored is unknown, so nothing is written. */
  noWrite?: boolean;
  /** They asked to be forgotten (on this call, or a tombstone was read). */
  forgotten?: boolean;
  /** The tombstone is stored: only then may Ferni say it's done. */
  erased?: boolean;
  erasing?: Promise<boolean>;
  /** The caller said they're the record's name (confirmed) or someone else (denied). */
  confirmed?: boolean;
  denied?: boolean;
}

const bySession = new Map<string, SessionEntry>();
const MAX_SESSIONS = 500;

function remember(sessionId: string, entry: SessionEntry): void {
  bySession.set(sessionId, entry);
  if (bySession.size > MAX_SESSIONS) bySession.delete(bySession.keys().next().value as string);
}

/** Hashes forgotten in this process whose tombstone could not be stored, until expiry. */
const forgottenHere = new Map<string, number>();

function expiryOf(data: Record<string, unknown>): Date | undefined {
  const expire = data.expireAt as { toDate?: () => Date } | Date | undefined;
  return expire instanceof Date ? expire : expire?.toDate?.();
}

/** A stored doc that hasn't expired (TTL deletion can lag). */
function isLive(data: Record<string, unknown> | null, now: Date): boolean {
  return !!data && (expiryOf(data)?.getTime() ?? Infinity) > now.getTime();
}

/** A stored "forget me" marker that hasn't expired. */
function isLiveTombstone(data: Record<string, unknown> | null, now: Date): boolean {
  return data?.forgotten === true && isLive(data, now);
}

/** What "forget me" leaves: no name, no summary, the number forgotten until expiry. */
function tombstone(now: Date): StoredReturningCaller {
  const expireAt = new Date(now.getTime() + TTL_MS);
  return toStoredRecord({ forgotten: true, lastCallAt: now, callCount: 0, expireAt });
}

function asView(data: Record<string, unknown> | null, now: Date): SessionEntry['record'] {
  if (!data) return undefined;
  const at = expiryOf(data);
  if (at && at.getTime() <= now.getTime()) return undefined; // expired, TTL not yet run
  const firstName = safeFirstName(typeof data.firstName === 'string' ? data.firstName : undefined);
  const summary = typeof data.summary === 'string' ? data.summary : undefined;
  const callCount = typeof data.callCount === 'number' ? data.callCount : 0;
  return { firstName, summary, callCount };
}

/**
 * Call start, for an unverified phone caller only: hash the number and read
 * any record, within a short timeout. Never throws.
 */
export async function beginReturningCaller(
  sessionId: string,
  e164: string,
  store: ReturningCallerStore = firestoreReturningCallerStore,
  env: Env = process.env,
  now: Date = new Date()
): Promise<void> {
  if (!returningCallerEnabled(env)) return;
  const hash = callerHash(e164, env);
  if (!hash) return;
  const entry: SessionEntry = { hash };
  remember(sessionId, entry);
  if ((forgottenHere.get(hash) ?? 0) > now.getTime()) {
    entry.forgotten = true; // the tombstone never landed: still forgotten here; try again
    void eraseOnce(entry, store);
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol('timed out');
  const timeout = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(() => resolve(timedOut), LOOKUP_TIMEOUT_MS);
  });
  try {
    const read = await Promise.race([
      Promise.all([store.get(hash), store.erasurePending(hash, now)]),
      timeout,
    ]);
    if (read === timedOut) throw new Error('timed out');
    const [data, pending] = read;
    if (isLiveTombstone(data, now)) entry.forgotten = entry.erased = true;
    else if (pending) {
      entry.forgotten = true; // a "forget me" whose tombstone never landed: try again now
      void eraseOnce(entry, store);
    } else entry.record = asView(data, now);
    log.info({ sessionId, returning: !!entry.record }, 'RETURNING_CALLER lookup');
  } catch (error) {
    entry.noWrite = true; // fail closed: never overwrite what couldn't be read
    log.warn({ sessionId, error: String(error) }, 'RETURNING_CALLER lookup failed');
  } finally {
    clearTimeout(timer);
  }
}

/** What Ferni knows about this session's caller from earlier calls, if anything. */
export function returningCallerFor(sessionId: string | undefined): ReturningCallerView | undefined {
  const entry = sessionId ? bySession.get(sessionId) : undefined;
  return entry && !entry.forgotten ? entry.record : undefined;
}

/** The record's name, while it may still be this caller (not forgotten, not denied). */
function nameToCheck(sessionId: string | undefined): string | undefined {
  const entry = sessionId ? bySession.get(sessionId) : undefined;
  return entry && !entry.forgotten && !entry.denied ? entry.record?.firstName : undefined;
}

/** The model's call-start note: possibly someone who called before; no name, no summary. */
export function returningCallerAwareness(sessionId: string): string | null {
  const name = nameToCheck(sessionId);
  return name ? POSSIBLY_RETURNING_NOTE : null;
}

/** The greeting's direction: warm, names nobody, asks who it is; or null. */
export function returningCallerGreeting(sessionId: string): string | null {
  const name = nameToCheck(sessionId);
  return name ? POSSIBLY_RETURNING_GREETING : null;
}

/** Waits before each try to store the tombstone. */
export const ERASE_WAITS_MS = [0, 150, 600];
async function pause(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Overwrites their record with a tombstone (no name, no summary) that keeps
 * the number forgotten until expiry, retrying with backoff. If it can't be
 * stored, a pending-erase marker is (returning_caller_erasures), and the hash
 * stays forgotten in this process as a fast path.
 */
async function erase(entry: SessionEntry, store: ReturningCallerStore): Promise<boolean> {
  for (const wait of ERASE_WAITS_MS) {
    await pause(wait);
    const stone = tombstone(new Date());
    try {
      await store.set(entry.hash, stone);
      entry.erased = true;
      forgottenHere.delete(entry.hash);
      store.clearErasure(entry.hash).catch(() => undefined); // a marker may be left from before
      return true;
    } catch {
      forgottenHere.set(entry.hash, stone.expireAt.getTime()); // fast path for this process
    }
  }
  await markPendingErasure(entry.hash, store);
  return false;
}

/** Durable intent when the tombstone can't be stored: every worker's call start honours it. */
async function markPendingErasure(hash: string, store: ReturningCallerStore): Promise<void> {
  for (const wait of ERASE_WAITS_MS) {
    await pause(wait);
    try {
      await store.markErasure(hash, new Date(Date.now() + TTL_MS));
      log.warn('Returning caller not yet cleared: pending-erase marker stored');
      return;
    } catch {
      // next try
    }
  }
  log.error(
    'Returning caller erase failed: neither the tombstone nor the pending-erase marker was stored'
  );
}

/** Starts the erase once per session, or again after one that failed. */
async function eraseOnce(entry: SessionEntry, store: ReturningCallerStore): Promise<boolean> {
  if (entry.erased) return true;
  entry.erasing ??= erase(entry, store).finally(() => {
    entry.erasing = undefined;
  });
  return entry.erasing;
}

/**
 * On the caller's "forget me": starts clearing their record and returns the
 * note for Ferni's reply: a promise to clear it until the tombstone is
 * stored, a confirmation after. '' on any other turn or session.
 */
export function returningCallerForgetNote(
  sessionId: string | undefined,
  callerWords: string,
  store: ReturningCallerStore = firestoreReturningCallerStore
): string {
  const entry = sessionId ? bySession.get(sessionId) : undefined;
  if (!entry || !asksToBeForgotten(callerWords)) return '';
  if (!entry.forgotten) log.info({ sessionId }, 'RETURNING_CALLER forgotten on request');
  entry.forgotten = true;
  void eraseOnce(entry, store);
  return entry.erased ? FORGOTTEN_NOTE : FORGETTING_NOTE;
}

/**
 * Per turn (turn-request.ts): the "forget me" note, else, once the caller
 * confirms they're the record's name, the note with the one-line topic hint.
 * `nameIn` is the name they gave for themselves on this turn, if any.
 */
export function returningCallerTurnNote(
  sessionId: string | undefined,
  callerWords: string,
  agentLast: string,
  nameIn: (words: string, agentLast: string) => string | null,
  store: ReturningCallerStore = firestoreReturningCallerStore
): string {
  const forget = returningCallerForgetNote(sessionId, callerWords, store);
  const entry = sessionId ? bySession.get(sessionId) : undefined;
  const name = nameToCheck(sessionId);
  if (forget || !entry?.record || !name) return forget;
  const answer = nameConfirmation(name, nameIn(callerWords, agentLast));
  if (answer === 'denied') {
    entry.confirmed = false; // a different name, even after a match: not them
    entry.denied = true;
    return '';
  }
  if (answer === 'confirmed') entry.confirmed = true;
  return entry.confirmed ? confirmedNote(name, entry.record.summary) : '';
}

/** Whether a session's caller may be a minor (MINOR_CARE). Null: none registered yet. */
let minorCheck: ((sessionId: string) => boolean) | null = null;
let warnedNoMinorCheck = false;

/** Registers the minor-signal check; without one, recordReturningCall writes nothing. */
export function registerMinorSignal(check: ((sessionId: string) => boolean) | null): void {
  minorCheck = check;
}

/** Fails closed: no registered check, or a check that throws, counts as a possible minor. */
function mayBeMinor(sessionId: string): boolean {
  if (!minorCheck) {
    if (!warnedNoMinorCheck)
      log.warn('Returning caller not saved: no minor-signal check registered');
    warnedNoMinorCheck = true;
    return true;
  }
  try {
    return minorCheck(sessionId);
  } catch {
    return true;
  }
}

/** A forgotten caller is never written again; one more try at the tombstone if it hasn't landed. */
async function settleForgotten(entry: SessionEntry, store: ReturningCallerStore): Promise<void> {
  const stored = entry.erasing ? await entry.erasing : entry.erased === true;
  if (!stored) await eraseOnce(entry, store);
}

/** A record is refreshed only by the person it names: they stated that name, and no other since. */
function isThem(entry: SessionEntry, given: string | undefined): boolean {
  const name = entry.record?.firstName?.toLowerCase();
  if (!name || entry.denied) return false;
  if (given) return given.toLowerCase() === name; // the last name they gave decides
  return entry.confirmed === true;
}

/**
 * End of call: write (or refresh) this caller's record. Nothing for a
 * session that isn't an attested unverified phone call, that said "forget
 * me", whose read failed, that didn't confirm being the record's person, or
 * whose caller may be a minor (or with no minor-signal check).
 */
export async function recordReturningCall(
  input: {
    sessionId: string;
    firstName?: string;
    topics?: readonly unknown[];
    callerLines?: readonly string[];
  },
  store: ReturningCallerStore = firestoreReturningCallerStore,
  env: Env = process.env,
  now: Date = new Date()
): Promise<boolean> {
  const entry = bySession.get(input.sessionId);
  bySession.delete(input.sessionId);
  if (!entry) return false;
  if (entry.forgotten) {
    await settleForgotten(entry, store);
    return false;
  }
  if (entry.noWrite || !returningCallerEnabled(env)) return false;
  if ((forgottenHere.get(entry.hash) ?? 0) > now.getTime()) return false; // forgotten here
  if (entry.record && !isThem(entry, input.firstName)) return false;
  if (mayBeMinor(input.sessionId)) return false;
  const firstName = safeFirstName(input.firstName) ?? entry.record?.firstName;
  const summary = safeSummary(input.topics, input.callerLines) ?? entry.record?.summary;
  const record = toStoredRecord({
    firstName,
    summary,
    lastCallAt: now,
    callCount: (entry.record?.callCount ?? 0) + 1,
    expireAt: new Date(now.getTime() + TTL_MS),
  });
  // A "forget me" stored since the call started (another call) wins.
  if (!(await store.setUnlessForgotten(entry.hash, record, now))) {
    log.info({ sessionId: input.sessionId }, 'RETURNING_CALLER not saved: forgotten');
    return false;
  }
  log.info(
    { sessionId: input.sessionId, named: !!firstName, summary: !!summary },
    'RETURNING_CALLER saved'
  );
  return true;
}

/** For tests. */
export function clearReturningCallers(): void {
  bySession.clear();
  forgottenHere.clear();
  warnedNoSecret = false;
  minorCheck = null;
  warnedNoMinorCheck = false;
}
