/**
 * Fewest calls before the call quality monitor may alert on a rate or the
 * quality score.
 *
 * Each worker rates only its own calls, so one dropped call out of one read as
 * "100% of calls ending in disconnection" and paged critical. Prod, the day to
 * 2026-10-18: 17 "Disconnect Rate Critical" and 17 "Call Quality Score Low"
 * pages from metrics like { totalCalls: 1, connectionAttempts: 1 }.
 * CALL_QUALITY_ALERT_MIN_CALLS (a whole number) overrides the default.
 */

export const DEFAULT_ALERT_MIN_CALLS = 5;

export function alertMinCalls(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.CALL_QUALITY_ALERT_MIN_CALLS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_ALERT_MIN_CALLS;
}

/** Whether there are enough connection attempts / ended calls to rate. */
export function enoughCallsToRate(
  metrics: { connectionAttempts: number; totalCalls: number },
  minCalls: number = alertMinCalls()
): { attempts: boolean; ended: boolean } {
  return {
    attempts: metrics.connectionAttempts >= minCalls,
    ended: metrics.totalCalls >= minCalls,
  };
}
