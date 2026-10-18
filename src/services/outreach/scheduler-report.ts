/**
 * What one daily outreach run did, in a shape safe to log: counts, and why
 * the skipped users were skipped, aggregated by reason.
 *
 * A run that sends nothing used to log only "processed 100, sent 0, skipped
 * 100, errors 0", which reads as healthy. With grounded check-ins on (the
 * default since #1170) every generic check-in is skipped on purpose, and the
 * report now says so instead of leaving it to be guessed.
 *
 * Reasons are counted by their text only when it is a plain phrase. Anything
 * else (a delivery error carrying a number, an address or an exception) is
 * counted as "other", so the log line never carries contact details.
 *
 * @module services/outreach/scheduler-report
 */

export interface SchedulerResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  /** Skipped users counted by reason; no user IDs. */
  skipReasons: Record<string, number>;
  /** True when OUTREACH_GROUNDED_CHECKINS blocks every generic check-in this run. */
  genericCheckInsBlocked: boolean;
  details: Array<{
    userId: string;
    status: 'sent' | 'skipped' | 'error';
    channel?: string;
    outreachType?: string;
    reason?: string;
  }>;
}

/** A reason written in code: letters, spaces and light punctuation, short. */
const PLAIN_PHRASE = /^[A-Za-z][A-Za-z ,'-]{0,79}$/;
export const OTHER_REASON = 'other';

/** Skipped details counted by reason, with free-form reasons bucketed as "other". */
export function skipReasonCounts(details: SchedulerResult['details']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of details) {
    if (d.status !== 'skipped') continue;
    const key = d.reason && PLAIN_PHRASE.test(d.reason) ? d.reason : OTHER_REASON;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
