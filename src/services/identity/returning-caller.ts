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
 * - expireAt is a Firestore TTL field; reads also ignore an expired record.
 *
 * So far this is the end-of-call write and the call-start read; nothing in
 * the call uses the record yet (the greeting and "forget me" come next).
 *
 * @module services/identity/returning-caller
 */
import { createHmac } from 'node:crypto';
import { flagOn, type Env } from '../../config/env-flag.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'returning-caller' });

export const RETURNING_CALLERS = 'returning_callers';
/** Domain separation: this key is only ever used to name returning-caller records. */
const HASH_PURPOSE = 'returning-caller/phone/v1';
export const TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SUMMARY_CHARS = 280;
/** Bounds the call-start read: the greeting must not wait on Firestore. */
const LOOKUP_TIMEOUT_MS = 1200;

/** The only fields a record may hold. */
export const RETURNING_CALLER_FIELDS = [
  'firstName',
  'summary',
  'lastCallAt',
  'callCount',
  'expireAt',
] as const;

export interface StoredReturningCaller {
  firstName?: string;
  summary?: string;
  lastCallAt: Date;
  callCount: number;
  expireAt: Date;
}

export interface ReturningCallerStore {
  get: (hash: string) => Promise<Record<string, unknown> | null>;
  set: (hash: string, data: StoredReturningCaller) => Promise<void>;
}

export const firestoreReturningCallerStore: ReturningCallerStore = {
  async get(hash) {
    const snap = await getFirestoreDb()?.collection(RETURNING_CALLERS).doc(hash).get();
    return snap?.exists ? (snap.data() ?? null) : null;
  },
  async set(hash, data) {
    await getFirestoreDb()?.collection(RETURNING_CALLERS).doc(hash).set(data);
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

const NAME = /^\p{Lu}\p{Ll}{1,29}(?:-\p{Lu}\p{Ll}{1,29})?$/u;
export const safeFirstName = (name: string | undefined): string | undefined =>
  name && NAME.test(name) ? name : undefined;

/** Stems that can make a topic sensitive (health, faith, place, age, money, law); any ending. */
const SENSITIVE_STEMS =
  'surger diagnos therap medic medicat pregnan depress suicid injur addict alcohol prescription ' +
  'diabet autis bipolar funeral relig synagogue christian muslim catholic buddhis atheis apartment ' +
  'neighborhood neighbourhood hometown birthday teen lesbian sexual politic democrat republican ' +
  'immigra lawyer arrest bankrupt mortgage salar';
/** Whole words (and their plurals) that can make a topic sensitive, or carry contact details. */
const SENSITIVE_WORDS =
  'health doctor hospital sick ill illness cancer mental disorder disease pain rehab drunk drinking ' +
  'drug pill clinic covid adhd anxiety anxious panic grief died death dead church god pray prayer ' +
  'praying faith mosque temple bible quran koran jesus allah jewish hindu mormon live lives living ' +
  'lived moved moving move address street city town state country near zip age aged year years old ' +
  'turning kid school grade gay trans sex vote election visa court police prison jail debt bank ' +
  'loan money rent phone number email self-harm';
const SENSITIVE = new RegExp(
  String.raw`\b(?:(?:${SENSITIVE_STEMS.split(' ').join('|')})\w*|(?:${SENSITIVE_WORDS.split(' ').join('|')})s?)\b|\b(?:call|text) me\b`,
  'i'
);
/** The summarizer calls the caller USER (caller-assertions.ts SPEAKER_RULE). */
const SPEAKER = /^(?:the\s+)?user(?:['’]s)?$/i;

/** Words the caller said capitalised mid-sentence: names and places, by how they were spoken. */
export function properNounsIn(callerLines: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const line of callerLines) {
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const words = sentence.trim().split(/\s+/).slice(1);
      for (const w of words) {
        const bare = w.replace(/[^\p{L}'’-]/gu, '').replace(/['’]s$/, '');
        if (/^\p{Lu}\p{Ll}/u.test(bare) && bare !== 'I') found.add(bare.toLowerCase());
      }
    }
  }
  return found;
}

/** A topic kept only if nothing in it could be an age, place, number, name or sensitive detail. */
function safeTopic(topic: string, properNouns: Set<string>): string | null {
  const one = topic.replace(/\s+/g, ' ').trim();
  if (!one || /[\d@/:#]|https?/i.test(one) || SENSITIVE.test(one)) return null;
  const words = one.split(' ').filter((w) => !SPEAKER.test(w));
  if (words.length === 0) return null;
  for (const [i, raw] of words.entries()) {
    const bare = raw.replace(/[^\p{L}'’-]/gu, '').replace(/['’]s$/, '');
    if (!bare || properNouns.has(bare.toLowerCase())) return null;
    if (i > 0 && /^\p{Lu}/u.test(bare)) return null; // a name or a place
    if (/['’]s$/.test(raw.replace(/[^\p{L}'’]/gu, ''))) return null; // "Sam's wedding"
  }
  const line = words.join(' ').replace(/[.;,]+$/, '');
  return line.charAt(0).toLowerCase() + line.slice(1);
}

/**
 * One short line from the call summary's topics, or undefined when no topic
 * is clearly safe. `callerLines` are the caller's own words, to spot proper nouns.
 */
export function safeSummary(
  topics: readonly unknown[] | undefined,
  callerLines: readonly string[] = []
): string | undefined {
  const nouns = properNounsIn(callerLines);
  const kept = (topics ?? [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => safeTopic(t, nouns))
    .filter((t): t is string => !!t)
    .slice(0, 2);
  const line = kept.join(' and ').slice(0, MAX_SUMMARY_CHARS).trim();
  return line || undefined;
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
}

const bySession = new Map<string, SessionEntry>();
const MAX_SESSIONS = 500;

function remember(sessionId: string, entry: SessionEntry): void {
  bySession.set(sessionId, entry);
  if (bySession.size > MAX_SESSIONS) bySession.delete(bySession.keys().next().value as string);
}

function asView(data: Record<string, unknown> | null, now: Date): SessionEntry['record'] {
  if (!data) return undefined;
  const expire = data.expireAt as { toDate?: () => Date } | Date | undefined;
  const at = expire instanceof Date ? expire : expire?.toDate?.();
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol('timed out');
  const timeout = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(() => resolve(timedOut), LOOKUP_TIMEOUT_MS);
  });
  try {
    const data = await Promise.race([store.get(hash), timeout]);
    if (data === timedOut) throw new Error('timed out');
    entry.record = asView(data, now);
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
  return entry?.record;
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

/**
 * End of call: write (or refresh) this caller's record. Nothing for a
 * session that isn't an attested unverified phone call, or whose caller may
 * be a minor (or when no minor-signal check is registered).
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
  if (!entry || entry.noWrite || !returningCallerEnabled(env)) return false;
  if (mayBeMinor(input.sessionId)) return false;
  const firstName = safeFirstName(input.firstName) ?? entry.record?.firstName;
  const summary = safeSummary(input.topics, input.callerLines) ?? entry.record?.summary;
  await store.set(
    entry.hash,
    toStoredRecord({
      firstName,
      summary,
      lastCallAt: now,
      callCount: (entry.record?.callCount ?? 0) + 1,
      expireAt: new Date(now.getTime() + TTL_MS),
    })
  );
  log.info(
    { sessionId: input.sessionId, named: !!firstName, summary: !!summary },
    'RETURNING_CALLER saved'
  );
  return true;
}

/** For tests. */
export function clearReturningCallers(): void {
  bySession.clear();
  warnedNoSecret = false;
  minorCheck = null;
  warnedNoMinorCheck = false;
}
