/**
 * How many replies one person may report in a day.
 *
 * The API runs on several Cloud Run instances, so an in-memory counter would
 * let one person file N× the limit. The count lives in Firestore
 * (reply_report_quota/{uid}: { day, count }) and is taken in a transaction, so
 * every instance sees the same number. A new UTC day starts the count over.
 *
 * @module api/reply-reports/reply-report-quota
 */
import type { Firestore } from '@google-cloud/firestore';

export const REPLY_REPORTS_PER_DAY = 20;
export const QUOTA_COLLECTION = 'reply_report_quota';

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Take one report from `uid`'s daily allowance; false when it's used up. */
export async function takeReplyReportQuota(
  db: Firestore,
  uid: string,
  now: number = Date.now(),
  limit: number = REPLY_REPORTS_PER_DAY
): Promise<boolean> {
  const ref = db.collection(QUOTA_COLLECTION).doc(uid);
  const day = utcDay(now);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const used = data?.day === day && typeof data.count === 'number' ? data.count : 0;
    if (used >= limit) return false;
    tx.set(ref, { day, count: used + 1, updatedAt: new Date(now) });
    return true;
  });
}
