/**
 * At most one check-in per commitment every 3 days (PROACTIVE_COOLDOWN, off by default).
 *
 * The session-start prompt told Ferni to "gently check in" on every overdue
 * commitment on every call, and nothing remembered that it already had, so the
 * same follow-up came up call after call. With the flag on, a check-in offered
 * to the model is recorded per user under
 * bogle_users/{uid}/commitment_checkins/{key}, where key is a hash of the user
 * id and the commitment's normalized text (so duplicate records of one
 * commitment share it). The record outlives the process, so a new call on a
 * new instance still sees it. `expireAt` is for a Firestore TTL policy.
 *
 * Read or write failures fall back to the old behaviour (every check-in
 * offered) and are logged. Flag off: nothing is read or written.
 *
 * @module services/superhuman/commitment-checkin-cooldown
 */

import type { CollectionReference } from '@google-cloud/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import { getFirestoreDb } from './firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { commitmentKey, normalizeCommitmentText } from '../../utils/commitment-filters.js';
import type { Commitment, CommitmentFollowUp } from './commitment-keeper.js';

const log = createLogger({ module: 'commitment-checkin-cooldown' });

const DAY_MS = 24 * 60 * 60 * 1000;
export const CHECK_IN_COOLDOWN_MS = 3 * DAY_MS;
/** How long a record is kept: past the cooldown, so it has nothing left to do. */
const KEEP_MS = 14 * DAY_MS;
const MEMO_MAX = 5000;

export function proactiveCooldownOn(env: Env = process.env): boolean {
  return flagOn('PROACTIVE_COOLDOWN', env);
}

export { normalizeCommitmentText };
export const checkInKey = commitmentKey;

/** Check-ins this process recorded or read, so a later turn need not read them again. */
const memo = new Map<string, number>();

/** Forget what this process remembers, as a restart would (tests). */
export function forgetCheckInMemo(): void {
  memo.clear();
}

function checkins(userId: string): CollectionReference | undefined {
  return getFirestoreDb()?.collection('bogle_users').doc(userId).collection('commitment_checkins');
}

/** When each key was last asked, from any instance; never-asked keys are absent. Throws on a failed read. */
export async function lastAsked(userId: string, keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unread = keys.filter((k) => {
    const at = memo.get(`${userId}/${k}`);
    if (at !== undefined) out.set(k, at);
    return at === undefined;
  });
  const col = checkins(userId);
  if (!col || unread.length === 0) return out;
  const snaps = await Promise.all(unread.map(async (k) => col.doc(k).get()));
  snaps.forEach((snap, i) => {
    const at = Number((snap.data() as { lastAskedAt?: unknown } | undefined)?.lastAskedAt);
    if (!snap.exists || !Number.isFinite(at)) return; // never asked: not memoized, another instance may ask
    out.set(unread[i], at);
    memo.set(`${userId}/${unread[i]}`, at);
  });
  return out;
}

/** Records the keys as asked at `now`, for this and every other instance. */
export async function recordCheckIns(userId: string, keys: string[], now: number): Promise<void> {
  if (memo.size > MEMO_MAX) memo.clear();
  for (const k of keys) memo.set(`${userId}/${k}`, now);
  const col = checkins(userId);
  if (!col) return;
  const expireAt = new Date(now + KEEP_MS);
  await Promise.all(
    keys.map(async (k) => col.doc(k).set({ lastAskedAt: now, expireAt }, { merge: true }))
  );
}

/**
 * The items whose commitment has not been checked in on in the last 3 days, one
 * per commitment text. With `record`, those are marked as checked in now: pass
 * it only where the check-in actually goes into the prompt. Flag off: `items`.
 */
export async function checkInsDue<T>(
  userId: string,
  items: T[],
  textOf: (item: T) => string | undefined,
  opts: { record: boolean },
  now: number = Date.now()
): Promise<T[]> {
  if (!proactiveCooldownOn() || items.length === 0) return items;
  try {
    const seen = new Set<string>();
    const keyed = items
      .map((item) => ({ item, key: checkInKey(userId, textOf(item) ?? '') }))
      .filter(({ key }) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const asked = await lastAsked(
      userId,
      keyed.map((k) => k.key)
    );
    const due = keyed.filter(({ key }) => now - (asked.get(key) ?? 0) >= CHECK_IN_COOLDOWN_MS);
    if (opts.record && due.length > 0) {
      await recordCheckIns(
        userId,
        due.map((d) => d.key),
        now
      ).catch((err: unknown) => log.warn({ err }, 'PROACTIVE_COOLDOWN: check-in not recorded'));
    }
    return due.map((d) => d.item);
  } catch (err) {
    log.warn({ err }, 'PROACTIVE_COOLDOWN: could not read check-ins, offering all');
    return items;
  }
}

/**
 * buildCommitmentContext's follow-ups, less those on cooldown. Read-only: that
 * function also runs as a session warm-up whose text is thrown away, so it
 * must not use up a check-in.
 */
export async function followUpsDue(
  userId: string,
  followUps: CommitmentFollowUp[],
  commitments: Commitment[]
): Promise<CommitmentFollowUp[]> {
  const textOf = (f: CommitmentFollowUp): string | undefined =>
    commitments.find((c) => c.id === f.commitmentId)?.summary;
  return checkInsDue(userId, followUps, textOf, { record: false });
}
