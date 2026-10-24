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
 * - A number can be shared and a first name guessed, so what Ferni says or is
 *   told before confirmation never depends on whether a record exists. Only
 *   the first name the caller states, matching the record, confirms them;
 *   then the model gets the one-line topic hint (returning-caller-talk.ts).
 *   Any other stated name ends it and sets deniedUntil (7 days), during which
 *   nothing is surfaced or refreshed, and counts against the number in that
 *   transaction: after MAX_NAME_GUESSES, never again. A cooldown that can't be
 *   stored holds the number in this process instead (fail closed). Only the
 *   confirmed person refreshes it.
 * - "Forget me" overwrites the record with a tombstone (no name or summary)
 *   that keeps the number forgotten until expiry, retried with backoff; if it
 *   can't be stored, a pending-erase marker is (returning_caller_erasures, also
 *   TTL), and call start refuses the number and retries while it exists. Ferni
 *   says it's done only once a tombstone write finished after this call's own
 *   request, so the reply never shows whether one was stored before. A read
 *   that failed, or a tombstone or marker found at write time, means no record
 *   is written.
 * - expireAt is a Firestore TTL field; reads also ignore an expired record.
 *
 * @module services/identity/returning-caller
 */
import { createHmac } from 'node:crypto';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { safeFirstName, safeSummary } from './returning-caller-summary.js';
import {
  deniedNow,
  expiryOf,
  firestoreReturningCallerStore,
  guessesSpent,
  isLiveTombstone,
  tombstone,
  toStoredRecord,
  TTL_MS,
  type ReturningCallerStore,
} from './returning-caller-store.js';
import {
  asksToBeForgotten,
  confirmedNote,
  FORGETTING_NOTE,
  FORGOTTEN_NOTE,
  nameConfirmation,
  UNKNOWN_CALLER_GREETING,
  UNKNOWN_CALLER_NOTE,
} from './returning-caller-talk.js';

export { asksToBeForgotten, FORGETTING_NOTE, FORGOTTEN_NOTE } from './returning-caller-talk.js';
export {
  firestoreReturningCallerStore,
  RETURNING_CALLER_FIELDS,
  toStoredRecord,
  type ReturningCallerStore,
  type StoredReturningCaller,
} from './returning-caller-store.js';

const log = createLogger({ module: 'returning-caller' });

/** Domain separation: this key is only ever used to name returning-caller records. */
const HASH_PURPOSE = 'returning-caller/phone/v1';
/** A stated name that isn't the record's holds the record this long: names can be guessed. */
export const DENY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Bounds the call-start read: the greeting must not wait on Firestore. */
const LOOKUP_TIMEOUT_MS = 1200;

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
  /** A tombstone is known to be stored (read at call start, or written). */
  tombstoned?: boolean;
  /** They said "forget me" on this call. */
  asked?: boolean;
  /** A tombstone write finished after they asked: only then may Ferni say it's done. */
  erasedThisCall?: boolean;
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
/** Hashes denied in this process whose cooldown could not be stored, until it would end. */
const deniedHere = new Map<string, number>();

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
  if ((deniedHere.get(hash) ?? 0) > now.getTime()) {
    entry.noWrite = true; // a cooldown that never landed: still held here
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
    // Never "already cleared" from a read: that would tell them a record existed.
    if (isLiveTombstone(data, now)) entry.forgotten = entry.tombstoned = true;
    else if (pending) {
      entry.forgotten = true; // a "forget me" whose tombstone never landed: try again now
      void eraseOnce(entry, store);
    } else if (deniedNow(data, now) || guessesSpent(data))
      entry.noWrite = true; // cooldown, or too many wrong names: surface and refresh nothing
    else entry.record = asView(data, now);
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

/**
 * Whether this call looked a number up (an attested unverified phone call,
 * flag on). Everything said or noted before confirmation hangs on this, never
 * on whether a record exists.
 */
export function inReturningCallerFlow(sessionId: string | undefined): boolean {
  return !!sessionId && bySession.has(sessionId);
}

/** The model's call-start note, the same with or without a record. */
export function returningCallerAwareness(sessionId: string): string | null {
  return inReturningCallerFlow(sessionId) ? UNKNOWN_CALLER_NOTE : null;
}

/** A caller with no past conversations: new, or maybe one who called before (RETURNING_CALLER). */
export function firstTalkNote(sessionId: string): string {
  return (
    returningCallerAwareness(sessionId) ??
    'This is your first conversation with them - be welcoming but not overwhelming.'
  );
}

/** The greeting's direction, the same with or without a record. */
export function returningCallerGreeting(sessionId: string): string | null {
  return inReturningCallerFlow(sessionId) ? UNKNOWN_CALLER_GREETING : null;
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
      entry.tombstoned = true;
      if (entry.asked) entry.erasedThisCall = true;
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

/**
 * Starts the erase once per session, or again after one that failed. Once
 * they ask, a tombstone stored before the request doesn't count: one more is
 * written, so the reply is the same whether or not a record existed.
 */
async function eraseOnce(entry: SessionEntry, store: ReturningCallerStore): Promise<boolean> {
  if (entry.asked ? entry.erasedThisCall : entry.tombstoned) return true;
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
  entry.forgotten = entry.asked = true;
  void eraseOnce(entry, store);
  return entry.erasedThisCall ? FORGOTTEN_NOTE : FORGETTING_NOTE;
}

/** Ends this call's chance to confirm, and holds the record for DENY_COOLDOWN_MS. */
function deny(entry: SessionEntry, store: ReturningCallerStore, now = new Date()): Promise<void> {
  entry.confirmed = false;
  if (entry.denied) return Promise.resolve();
  entry.denied = true;
  const until = new Date(now.getTime() + DENY_COOLDOWN_MS);
  return store.markDenied(entry.hash, until, now).catch(() => {
    // Fail closed: nothing more from the record on this call, nor here until it would end.
    entry.record = undefined;
    entry.noWrite = true;
    deniedHere.set(entry.hash, until.getTime());
    log.warn('Returning caller denial cooldown not stored: held in this process');
  });
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
    void deny(entry, store); // any other name, even after a match: not them, and a cooldown
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
  const stored = entry.erasing ? await entry.erasing : entry.tombstoned === true;
  if (!stored) await eraseOnce(entry, store);
}

/**
 * A record is refreshed only by the person it names: every name they stated
 * is the record's (so the first one decides; a guess after a miss can't
 * win), or they confirmed in the call and stated nothing else. A mismatch
 * found only now still starts the cooldown.
 */
async function isThem(
  entry: SessionEntry,
  stated: readonly string[],
  store: ReturningCallerStore
): Promise<boolean> {
  const name = entry.record?.firstName?.toLowerCase();
  if (!name || entry.denied) return false;
  if (stated.length === 0) return entry.confirmed === true;
  if (stated.every((n) => n.toLowerCase() === name)) return true;
  await deny(entry, store);
  return false;
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
    /** Every name the caller stated for themselves on the call, in order. */
    statedNames?: readonly string[];
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
  if (entry.record && !(await isThem(entry, input.statedNames ?? [], store))) return false;
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
  deniedHere.clear();
  warnedNoSecret = false;
  minorCheck = null;
  warnedNoMinorCheck = false;
}
