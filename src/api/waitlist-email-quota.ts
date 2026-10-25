/**
 * A global daily cap on email the waitlist routes trigger.
 *
 * Signing up needs no account, and the per-IP rate limit (waitlist-rate-limits.ts)
 * does not stop someone with many IPs. Every app email shares one Workspace
 * mailbox (about 2,000 sends a day), so unbounded waitlist mail could use it up
 * and block report-backs and other transactional mail. The count is per UTC day
 * across all Cloud Run instances, so it lives in Firestore
 * (ops_email_quota/{yyyy-mm-dd}: { waitlist }) and is taken in a transaction.
 * Server only: firestore.rules denies clients.
 *
 *   WAITLIST_EMAIL_DAILY_LIMIT  recipients per UTC day (default 200)
 *
 * @module api/waitlist-email-quota
 */
import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'waitlist-email-quota' });

export const EMAIL_QUOTA_COLLECTION = 'ops_email_quota';
export const DEFAULT_WAITLIST_EMAIL_DAILY_LIMIT = 200;

export function waitlistEmailDailyLimit(): number {
  const n = Number.parseInt(process.env.WAITLIST_EMAIL_DAILY_LIMIT ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WAITLIST_EMAIL_DAILY_LIMIT;
}

export interface QuotaTake {
  ok: boolean;
  /** Recipients already counted today, before this take. */
  used: number;
  limit: number;
}

/** Count `recipients` against today's cap; `ok: false` (nothing counted) when they don't fit. */
export async function takeWaitlistEmailQuota(
  db: Firestore,
  recipients: number,
  now: number = Date.now()
): Promise<QuotaTake> {
  const limit = waitlistEmailDailyLimit();
  const ref = db.collection(EMAIL_QUOTA_COLLECTION).doc(new Date(now).toISOString().slice(0, 10));
  return db.runTransaction(async (tx) => {
    const raw: unknown = (await tx.get(ref)).data()?.waitlist;
    const used = typeof raw === 'number' ? raw : 0;
    if (used + recipients > limit) return { ok: false, used, limit };
    tx.set(ref, { waitlist: used + recipients, updatedAt: new Date(now) }, { merge: true });
    return { ok: true, used, limit };
  });
}

/**
 * True when a waitlist email to `recipients` people may go out today. Over the
 * cap, or when the counter can't be read (fail closed), it logs why and says no.
 */
export async function waitlistEmailAllowed(
  getDb: () => Firestore,
  what: string,
  recipients: number
): Promise<boolean> {
  try {
    const take = await takeWaitlistEmailQuota(getDb(), recipients);
    if (!take.ok) log.warn({ what, used: take.used, limit: take.limit }, 'Waitlist email daily cap reached; not sent'); // prettier-ignore
    return take.ok;
  } catch (error) {
    log.error({ what, error: String(error) }, 'Waitlist email quota unavailable; not sent');
    return false;
  }
}
