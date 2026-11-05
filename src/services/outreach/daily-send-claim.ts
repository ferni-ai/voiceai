/**
 * The daily outreach run's one send per person per day (automated-scheduler.ts).
 *
 * Every merge to main redeploys the service, which can cut the daily run off
 * partway. Cloud Scheduler then runs it again, and Cloud Run can resume the cut-off
 * run beside the retry (job-lock-store.ts). So before it delivers, the run creates
 * daily_outreach_locks/{userId}_{YYYY-MM-DD, UTC}. A second run that day finds the
 * doc and skips that person ('Already sent today'). A failed delivery deletes it,
 * so a retry still reaches them. The UTC day matches the proactive daily check-in's
 * own log entry (daily-checkin.ts, `daily:{YYYY-MM-DD}`).
 *
 * Each claim names the person (userId), so account deletion erases it with the rest of
 * their stores (user-stores.ts), and carries expireAt, two days on, for a Firestore TTL
 * policy on daily_outreach_locks.expireAt to remove it once the day is past.
 *
 * Create-only through createOnce (checkin-replies.ts), the claim the guarded
 * sender's text locks use. Fails closed: an error is a skip, never a send. Logs
 * carry the error code only, no user id.
 *
 * @module services/outreach/daily-send-claim
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { createOnce } from './checkin-replies.js';

const log = createLogger({ module: 'daily-send-claim' });

const DAILY_LOCKS = 'daily_outreach_locks';

export type DailyClaim = 'claimed' | 'Already sent today' | 'Send claim failed';

const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

function lockOf(userId: string, now: Date): FirebaseFirestore.DocumentReference {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  return db.collection(DAILY_LOCKS).doc(`${userId}_${now.toISOString().slice(0, 10)}`);
}

/** A claim's expireAt: past the UTC day it guards */
const KEEP_MS = 2 * 24 * 3600_000;

/** Claim today's daily send for this person, before anything is delivered. */
export async function claimDailySend(userId: string, now: Date): Promise<DailyClaim> {
  try {
    // userId: account deletion finds the person's claims by it (user-stores.ts)
    const made = await createOnce(lockOf(userId, now), {
      at: now.toISOString(),
      userId,
      expireAt: new Date(now.getTime() + KEEP_MS),
    });
    return made ? 'claimed' : 'Already sent today';
  } catch (error) {
    log.warn({ code: codeOf(error) }, 'Daily send claim failed; skipped');
    return 'Send claim failed';
  }
}

/** Nothing went out: give the day back. If this fails, they are reached tomorrow. */
export async function releaseDailySend(userId: string, now: Date): Promise<void> {
  try {
    await lockOf(userId, now).delete();
  } catch (error) {
    log.warn({ code: codeOf(error) }, 'Daily send claim not released');
  }
}
