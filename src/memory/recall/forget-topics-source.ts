/**
 * The caller's forgotten topics for the readers outside recall
 * (forget-every-reader.ts, FORGET_EVERY_READER=on): one read per caller.
 *
 * Every reader, the call-start recall snapshot included, shares one
 * in-flight Firestore read and its result (fresh for 15 s, and at once stale
 * after a forget in this process). A failed read is remembered and retried
 * only after a backoff (1 s doubling to 60 s), so interim transcripts can't
 * flood Firestore. A reader that can't wait for the read (READ_TIMEOUT_MS)
 * uses the last topics read for the caller, by any reader in this process,
 * but only if they were read in the last LAST_KNOWN_MAX_AGE_MS or during
 * this call (markCallStart, trusted for CALL_MARK_MAX_MS): older ones may
 * miss a forget made since in another process, so without a recent source it
 * fails closed. Timeouts, fallbacks and
 * fail-closed answers are logged and counted (forgetReadStats).
 *
 * @module memory/recall/forget-topics-source
 */
import { createLogger } from '../../utils/safe-logger.js';
import { forgetGeneration, forgottenTopicsOrNull } from './forget.js';

const log = createLogger({ module: 'forget-topics' });

/** Topics change rarely; a short cache keeps each turn from paying a read. */
export const TOPICS_TTL_MS = 15_000;
/** A reader waits this long for a read, then falls back. */
export const READ_TIMEOUT_MS = 300;
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
/** Last-known topics older than this, and not read during this call, are not a source. */
export const LAST_KNOWN_MAX_AGE_MS = 60_000;
/** A call mark older than this is an old call's, not this one's (no call runs this long). */
export const CALL_MARK_MAX_MS = 2 * 3600_000;

interface Entry {
  inflight?: Promise<string[] | null>;
  /** The last successful read: any age, for fallback; fresh while within the TTL and generation. */
  topics?: string[];
  at?: number;
  gen?: number;
  failedAt?: number;
  backoffMs?: number;
}
const entries = new Map<string, Entry>();
const callStarts = new Map<string, number>();
/** Names of the people and pets in the caller's memory, kept whole by the matcher. */
const names = new Map<string, ReadonlySet<string>>();
const stats = { reads: 0, failures: 0, timeouts: 0, fallbacks: 0, failClosed: 0 };

/** Counts since start (or the last reset), for logs and tests. */
export function forgetReadStats(): Readonly<typeof stats> {
  return { ...stats };
}

/** For tests. */
export function resetForgetTopicsSource(): void {
  entries.clear();
  callStarts.clear();
  names.clear();
  for (const k of Object.keys(stats) as Array<keyof typeof stats>) stats[k] = 0;
}

function entryFor(userId: string): Entry {
  let e = entries.get(userId);
  if (!e) entries.set(userId, (e = {}));
  return e;
}

function fresh(e: Entry, userId: string, now: number): boolean {
  return (
    e.topics !== undefined &&
    e.gen === forgetGeneration(userId) &&
    now - (e.at ?? 0) < TOPICS_TTL_MS
  );
}

/**
 * The shared read: the cached topics while fresh, else the read in flight,
 * else a new read. During a backoff after a failure, null without reading,
 * unless `force` (the recall snapshot, which must try once per call).
 */
export function readTopics(userId: string, force = false): Promise<string[] | null> {
  const e = entryFor(userId);
  const now = Date.now();
  if (fresh(e, userId, now)) return Promise.resolve(e.topics!);
  if (e.inflight) return e.inflight;
  if (!force && e.failedAt !== undefined && now - e.failedAt < (e.backoffMs ?? 0)) {
    return Promise.resolve(null);
  }
  const gen = forgetGeneration(userId);
  stats.reads++;
  const read = forgottenTopicsOrNull(userId).then((topics) => {
    if (topics) {
      Object.assign(e, { topics, at: Date.now(), gen, failedAt: undefined, backoffMs: undefined });
    } else {
      stats.failures++;
      e.failedAt = Date.now();
      e.backoffMs = Math.min(Math.max((e.backoffMs ?? 0) * 2, BACKOFF_MIN_MS), BACKOFF_MAX_MS);
      log.warn({ backoffMs: e.backoffMs, failures: stats.failures }, 'Forgotten topics not read');
    }
    return topics;
  });
  const tracked: Promise<string[] | null> = read.finally(() => {
    if (e.inflight === tracked) e.inflight = undefined;
  });
  e.inflight = tracked;
  return tracked;
}

/** A call for the caller starts now (agent setup): topics read from here on stay a source. */
export function markCallStart(userId: string, now = Date.now()): void {
  callStarts.set(userId, now);
}

/** The call is over (its persona's teardown): its reads are no longer this call's. */
export function endCallMark(userId: string, started?: number): void {
  if (started === undefined || callStarts.get(userId) === started) callStarts.delete(userId);
}

/** The caller's known names (lower case): people and pets in their memory; replaces the last set. */
export function rememberNames(userId: string, known: Iterable<string>): void {
  names.set(userId, new Set([...known].map((n) => n.toLowerCase())));
}

export function knownNames(userId: string): ReadonlySet<string> {
  return names.get(userId) ?? new Set();
}

/**
 * The last topics read for the caller if still a source: read in the last
 * LAST_KNOWN_MAX_AGE_MS or during this call; undefined otherwise.
 */
export function lastKnownTopics(userId: string, now = Date.now()): string[] | undefined {
  const e = entries.get(userId);
  if (!e?.topics || e.at === undefined) return undefined;
  const start = callStarts.get(userId) ?? Infinity;
  const thisCall = e.at >= start && now - start < CALL_MARK_MAX_MS;
  return thisCall || now - e.at < LAST_KNOWN_MAX_AGE_MS ? e.topics : undefined;
}

/**
 * The topics for a reader that can wait READ_TIMEOUT_MS: the shared read,
 * else (late or failed) the last known topics, else null (fail closed).
 */
export async function topicsWithin(userId: string, reader: string): Promise<string[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), READ_TIMEOUT_MS);
  });
  const got = await Promise.race([readTopics(userId), late]);
  clearTimeout(timer);
  if (Array.isArray(got)) return got;
  if (got === 'late') stats.timeouts++;
  return fallback(userId, reader, got === 'late' ? 'timeout' : 'failed');
}

/** The topics without waiting: fresh or last known, else null (fail closed). Starts a read if due. */
export function topicsNow(userId: string, reader: string): string[] | null {
  void readTopics(userId);
  const known = lastKnownTopics(userId);
  // Quiet: this runs on every interim transcript; the count still moves.
  return known ?? fallback(userId, reader, 'not-read-yet', true);
}

function fallback(userId: string, reader: string, why: string, quiet = false): string[] | null {
  const known = lastKnownTopics(userId);
  if (known) {
    stats.fallbacks++;
    log.info({ reader, why, fallbacks: stats.fallbacks }, 'Forgotten topics: last known used');
    return known;
  }
  stats.failClosed++;
  const detail = { reader, why, failClosed: stats.failClosed, timeouts: stats.timeouts };
  if (quiet) log.debug(detail, 'Forgotten topics: no source, failing closed');
  else log.warn(detail, 'Forgotten topics: no source, failing closed');
  return null;
}
