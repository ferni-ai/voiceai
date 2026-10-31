/**
 * One counted line per scheduled-job run, so a run that sends nothing always
 * says why: `<JOB>_RUN {considered, eligible, sent, skippedBy}`, as
 * PROACTIVE_TICK_RUN, MORNING_BRIEF_RUN, FOLLOW_THROUGH_RUN and PONDERING_RUN.
 * Before these, the proactive run logged only its sends, so a week of runs
 * that each found nothing left zero lines and no reason (2026-10-30 audit).
 *
 * Counts and fixed reason strings only: never ids, numbers or message text.
 *
 * @module utils/job-run
 */

import type { FallbackLogger } from './safe-logger.js';

export interface JobRunCounts {
  /** People the run looked at. */
  considered: number;
  /** Of those, people it had something to send. */
  eligible: number;
  sent: number;
  /** Everyone not sent to, by a fixed reason. */
  skippedBy: Record<string, number>;
}

export function countReason(into: Record<string, number>, reason: string): void {
  into[reason] = (into[reason] ?? 0) + 1;
}

/** `job` is the marker's stem: 'PROACTIVE_TICK' logs PROACTIVE_TICK_RUN. */
export function logJobRun(
  log: FallbackLogger,
  job: string,
  counts: JobRunCounts,
  extra: Record<string, unknown> = {}
): void {
  log.info({ ...extra, ...counts }, `${job}_RUN`);
}
