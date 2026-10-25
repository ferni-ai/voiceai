/**
 * Daily caps on email the waitlist routes trigger, one bucket per kind of sender.
 *
 * Signing up needs no account, and the per-IP rate limit (waitlist-rate-limits.ts)
 * does not stop someone with many IPs. Every app email shares one Workspace
 * mailbox (about 2,000 sends a day), so unbounded waitlist mail could use it up
 * and block report-backs and other transactional mail. The buckets are separate
 * so signup spam can't starve the admin's notices or an approved person's
 * welcome, and the other way round:
 *
 *   public       mail a signup triggers for the signer (newsletter welcome)
 *                WAITLIST_EMAIL_DAILY_LIMIT recipients a day (default 200)
 *   adminNotice  notices to the admins (signup, welcome call), and the welcome
 *                after a one-click email-link approval (that link is a bearer
 *                token, valid ~48 h and not single-use, so it is not treated as
 *                an admin action) - WAITLIST_ADMIN_NOTICE_DAILY_LIMIT (default 100)
 *   approved     the welcome after an admin approves in the admin API
 *                (requireAdmin): counted, never capped
 *
 * The count is per UTC day across all Cloud Run instances, so it lives in
 * Firestore (ops_email_quota/{yyyy-mm-dd}: { public, adminNotice, approved }) and
 * is taken in a transaction. Server only: firestore.rules denies clients.
 *
 * @module api/waitlist-email-quota
 */
import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'waitlist-email-quota' });

export const EMAIL_QUOTA_COLLECTION = 'ops_email_quota';
export type WaitlistEmailBucket = 'public' | 'adminNotice' | 'approved';
export const DEFAULT_WAITLIST_EMAIL_DAILY_LIMIT = 200;
export const DEFAULT_WAITLIST_ADMIN_NOTICE_DAILY_LIMIT = 100;

function positiveIntOr(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Recipients a bucket may send to in a UTC day (Infinity: counted, not capped). */
export function waitlistEmailDailyLimit(bucket: WaitlistEmailBucket): number {
  if (bucket === 'approved') return Number.POSITIVE_INFINITY;
  if (bucket === 'adminNotice') {
    return positiveIntOr(process.env.WAITLIST_ADMIN_NOTICE_DAILY_LIMIT, DEFAULT_WAITLIST_ADMIN_NOTICE_DAILY_LIMIT); // prettier-ignore
  }
  return positiveIntOr(process.env.WAITLIST_EMAIL_DAILY_LIMIT, DEFAULT_WAITLIST_EMAIL_DAILY_LIMIT);
}

export interface QuotaTake {
  ok: boolean;
  /** Recipients already counted in this bucket today, before this take. */
  used: number;
  limit: number;
}

/** Count `recipients` against the bucket's cap today; `ok: false` (nothing counted) when they don't fit. */
export async function takeWaitlistEmailQuota(
  db: Firestore,
  bucket: WaitlistEmailBucket,
  recipients: number,
  now: number = Date.now()
): Promise<QuotaTake> {
  const limit = waitlistEmailDailyLimit(bucket);
  const ref = db.collection(EMAIL_QUOTA_COLLECTION).doc(new Date(now).toISOString().slice(0, 10));
  return db.runTransaction(async (tx) => {
    const raw: unknown = (await tx.get(ref)).data()?.[bucket];
    const used = typeof raw === 'number' ? raw : 0;
    if (used + recipients > limit) return { ok: false, used, limit };
    tx.set(ref, { [bucket]: used + recipients, updatedAt: new Date(now) }, { merge: true });
    return { ok: true, used, limit };
  });
}

/**
 * True when a waitlist email to `recipients` people may go out today. Over a
 * capped bucket's limit, or when its counter can't be read (fail closed), it
 * logs why and says no. The uncapped 'approved' bucket always says yes.
 */
export async function waitlistEmailAllowed(
  getDb: () => Firestore,
  what: string,
  bucket: WaitlistEmailBucket,
  recipients: number
): Promise<boolean> {
  try {
    const take = await takeWaitlistEmailQuota(getDb(), bucket, recipients);
    if (!take.ok) log.warn({ what, bucket, used: take.used, limit: take.limit }, 'Waitlist email daily cap reached; not sent'); // prettier-ignore
    return take.ok;
  } catch (error) {
    if (bucket === 'approved') {
      log.warn({ what, bucket, error: String(error) }, 'Waitlist email counter unavailable; uncapped, sending'); // prettier-ignore
      return true;
    }
    log.error({ what, bucket, error: String(error) }, 'Waitlist email quota unavailable; not sent');
    return false;
  }
}
