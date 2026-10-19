/**
 * Revoking Google OAuth tokens, and the queue of revokes that must not be lost.
 *
 * Account erasure deletes every token we hold. If Google is down at that
 * moment, the grant would stay live at Google with nothing left on our side to
 * revoke it. So erasure queues the token here (encrypted, with no user id) and
 * goes on; the retry-pending-revocations job revokes it later, with backoff,
 * and gives up after 14 days.
 *
 * Ordinary disconnects don't queue: a user who reconnects soon after would
 * lose the new connection when the old token's revoke finally lands (revoking
 * any token ends every scope the user granted the project).
 *
 * @module services/identity/google-revocations
 */

import { randomUUID } from 'node:crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { encryptData, decryptData } from '../../utils/token-encryption.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GoogleRevocations' });

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const PENDING_REVOCATIONS = 'pending_revocations';
const REVOKE_TIMEOUT_MS = 5_000;
const GIVE_UP_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const FIRST_RETRY_MS = 5 * 60 * 1000;
const MAX_RETRY_MS = 6 * 60 * 60 * 1000;
const BATCH = 200;

/**
 * revoked: Google ended the grant. refused: Google said definitively that the
 * token is already dead (400 with error=invalid_token, or invalid_request for
 * a token it doesn't know): nothing left to revoke. unreachable: anything else
 * (408, 429, 5xx, another status, timeout, no network); the grant may still be
 * live, so it is worth trying again.
 */
export type RevokeOutcome = 'revoked' | 'refused' | 'unreachable';

const DEAD_TOKEN_ERRORS = new Set(['invalid_token', 'invalid_request']);

async function isDeadTokenAnswer(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  try {
    const body = JSON.parse(await response.text()) as { error?: unknown };
    return typeof body.error === 'string' && DEAD_TOKEN_ERRORS.has(body.error);
  } catch {
    return false;
  }
}

export async function revokeGoogleToken(token: string): Promise<RevokeOutcome> {
  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (response.ok) return 'revoked';
    log.warn({ status: response.status }, 'Google token revoke not accepted');
    return (await isDeadTokenAnswer(response)) ? 'refused' : 'unreachable';
  } catch (err) {
    log.warn({ error: (err as Error)?.name }, 'Google token revoke failed');
    return 'unreachable';
  }
}

interface PendingRevocation {
  /** encryptData({ token }) */
  encrypted: string;
  provider: 'google';
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}

/**
 * Queue a token whose revoke couldn't reach Google. Throws when it can't be
 * written: the caller (erasure) must not delete the only other copy then.
 */
export async function queueGoogleRevocation(token: string, now = Date.now()): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable: revocation not queued');
  const entry: PendingRevocation = {
    encrypted: encryptData({ token }),
    provider: 'google',
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
  };
  await db.collection(PENDING_REVOCATIONS).doc(randomUUID()).set(entry);
}

export interface RetryReport {
  due: number;
  revoked: number;
  /** Google refused the token (already invalid): nothing left to do. */
  refused: number;
  /** Still unreachable: kept, next attempt pushed back. */
  retrying: number;
  /** Older than 14 days (or unreadable): dropped. */
  gaveUp: number;
}

const backoffMs = (attempts: number): number =>
  Math.min(FIRST_RETRY_MS * 2 ** attempts, MAX_RETRY_MS);

/** Retry every due pending revocation. Logs counts only. */
export async function retryPendingRevocations(now = Date.now()): Promise<RetryReport> {
  const report: RetryReport = { due: 0, revoked: 0, refused: 0, retrying: 0, gaveUp: 0 };
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const snap = await db
    .collection(PENDING_REVOCATIONS)
    .where('nextAttemptAt', '<=', now)
    .limit(BATCH)
    .get();

  for (const doc of snap.docs) {
    report.due++;
    const entry = doc.data() as PendingRevocation;
    const token = decryptData<{ token?: string }>(entry.encrypted)?.token;
    if (!token || now - entry.createdAt > GIVE_UP_AFTER_MS) {
      report.gaveUp++;
      await doc.ref.delete();
      continue;
    }
    const outcome = await revokeGoogleToken(token);
    if (outcome === 'unreachable') {
      report.retrying++;
      const attempts = (entry.attempts ?? 0) + 1;
      await doc.ref.update({ attempts, nextAttemptAt: now + backoffMs(attempts) });
      continue;
    }
    report[outcome]++;
    await doc.ref.delete();
  }

  if (report.due > 0) log.info({ ...report }, 'Pending Google revocations retried');
  if (report.gaveUp > 0) log.warn({ gaveUp: report.gaveUp }, 'Gave up on pending revocations');
  return report;
}
