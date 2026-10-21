/**
 * Sessions together: the one count of conversations Ferni and a user have had.
 *
 * Three counts used to reach the same prompt (profile 21, relationship engine
 * 17, conversation docs 30). The source of truth is the agent's own call
 * record, bogle_users/{uid}/conversations: a session counts when it ended and
 * the user said at least one thing. Everything that says "N conversations",
 * "N days", a streak or a milestone reads it here.
 *
 * @module services/stores/sessions-together
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

/** One stored call, as realtime-memory writes it. */
export interface StoredCall {
  startedAt?: unknown;
  endedAt?: unknown;
  turnCount?: unknown;
  userTurnCount?: unknown;
}

export interface SessionsTogether {
  /** Completed conversations with at least one user turn. */
  count: number;
  /** Distinct calendar days (in the user's zone) with a counted session, oldest first. */
  days: string[];
  firstAt?: Date;
  lastAt?: Date;
  /**
   * Calls still going (no end yet, started in the last 6 hours). Not sessions together:
   * only a milestone check counts them, since the call that crosses a threshold is live.
   */
  inProgress: { count: number; days: string[] };
}

/** How long a call without an end can still be the live one. */
export const IN_PROGRESS_WINDOW_MS = 6 * 60 * 60 * 1000;

function toMs(value: unknown): number | undefined {
  if (value == null) return undefined;
  const date = (value as { toDate?: () => Date }).toDate?.() ?? value;
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date));
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * The user said something in this call. Calls stored before userTurnCount
 * existed only have turnCount (user and agent turns together); the agent's
 * greeting is one turn, so a second turn means the user spoke.
 */
function userSpoke(call: StoredCall): boolean {
  if (typeof call.userTurnCount === 'number') return call.userTurnCount >= 1;
  return typeof call.turnCount === 'number' && call.turnCount >= 2;
}

/** A session that counts: it ended, and the user took part. */
export function isCountedSession(call: StoredCall): boolean {
  return toMs(call.endedAt) !== undefined && toMs(call.startedAt) !== undefined && userSpoke(call);
}

/** YYYY-MM-DD for an instant in a time zone (UTC when none or an unknown one is given). */
export function calendarDay(ms: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Started within the window and not ended: the call happening now. */
export function isInProgressCall(call: StoredCall, now = Date.now()): boolean {
  const start = toMs(call.startedAt);
  return (
    toMs(call.endedAt) === undefined && start !== undefined && now - start <= IN_PROGRESS_WINDOW_MS
  );
}

/** Pure: the summary of a user's stored calls. */
export function summarizeSessions(
  calls: StoredCall[],
  timeZone?: string,
  now = Date.now()
): SessionsTogether {
  const live = calls
    .filter((c) => isInProgressCall(c, now))
    .map((c) => toMs(c.startedAt) as number);
  const starts = calls
    .filter(isCountedSession)
    .map((c) => toMs(c.startedAt) as number)
    .sort((a, b) => a - b);
  const days = [...new Set(starts.map((ms) => calendarDay(ms, timeZone)))];
  return {
    count: starts.length,
    days,
    firstAt: starts.length ? new Date(starts[0]!) : undefined,
    lastAt: starts.length ? new Date(starts[starts.length - 1]!) : undefined,
    inProgress: {
      count: live.length,
      days: [...new Set(live.map((ms) => calendarDay(ms, timeZone)))],
    },
  };
}

/** Consecutive calendar days with a session, ending today or yesterday; 0 otherwise. */
export function currentDayStreak(days: string[], now = new Date(), timeZone?: string): number {
  const set = new Set(days);
  const dayMs = 24 * 60 * 60 * 1000;
  const today = calendarDay(now.getTime(), timeZone);
  const yesterday = calendarDay(now.getTime() - dayMs, timeZone);
  let cursor = set.has(today) ? now.getTime() : set.has(yesterday) ? now.getTime() - dayMs : null;
  let streak = 0;
  while (cursor !== null && set.has(calendarDay(cursor, timeZone))) {
    streak++;
    cursor -= dayMs;
  }
  return streak;
}

/** Most calls read for one user: the newest first. Hitting it is logged (counts cap here). */
export const MAX_CALLS_READ = 2000;
/** The oldest calls read to find the first session together. */
const FIRST_CALLS_READ = 20;
/** A display count may be this old; never across users, never for a milestone check. */
const CACHE_MS = 60_000;

const FIELDS = ['startedAt', 'endedAt', 'turnCount', 'userTurnCount'] as const;
const cache = new Map<string, { at: number; value: SessionsTogether }>();

/** Drop cached counts (tests, or after a write that must show at once). */
export function clearSessionsTogetherCache(): void {
  cache.clear();
}

/**
 * Summarize a user's stored calls with bounded reads: the newest MAX_CALLS_READ calls
 * (count, days, streak, the live call) and the oldest few (when the first session was).
 * Throws when Firestore can't be read, so a caller never mistakes a failed read for "no
 * sessions". `fresh` skips the 60s per-user cache: a milestone check must see the live call.
 */
export async function getSessionsTogether(
  userId: string,
  timeZone?: string,
  options: { fresh?: boolean } = {}
): Promise<SessionsTogether> {
  const key = `${userId}\u0000${timeZone ?? ''}`;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const calls = db.collection('bogle_users').doc(userId).collection('conversations');
  const [recent, oldest] = await Promise.all([
    calls
      .select(...FIELDS)
      .orderBy('startedAt', 'desc')
      .limit(MAX_CALLS_READ)
      .get(),
    calls
      .select(...FIELDS)
      .orderBy('startedAt', 'asc')
      .limit(FIRST_CALLS_READ)
      .get(),
  ]);
  if (recent.docs.length >= MAX_CALLS_READ) {
    getLogger().warn({ userId, max: MAX_CALLS_READ }, 'Sessions together: read cap hit');
  }
  const value = summarizeSessions(
    recent.docs.map((d) => d.data() as StoredCall),
    timeZone
  );
  // The first session together may be older than the newest MAX_CALLS_READ calls
  const first = summarizeSessions(
    oldest.docs.map((d) => d.data() as StoredCall),
    timeZone
  ).firstAt;
  if (first && (!value.firstAt || first < value.firstAt)) value.firstAt = first;
  cache.set(key, { at: Date.now(), value });
  return value;
}
