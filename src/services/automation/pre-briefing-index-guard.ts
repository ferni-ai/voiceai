/**
 * Missing-index guard for the pre-briefing lookup.
 *
 * getPreBriefing() runs on every handoff. Its query needs a composite index
 * on pre_briefings (see firestore.indexes.json). Until that index exists,
 * Firestore rejects the query with FAILED_PRECONDITION, and dev logged one
 * ERROR per handoff. This guard turns that into one warning per process and
 * skips the query for a cooldown, so a handoff does not pay a failing round
 * trip. After the cooldown it tries again, so creating the index heals the
 * path without a redeploy.
 *
 * @module services/automation/pre-briefing-index-guard
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'predictive-handoff' });

/** How long to skip the query after it failed for a missing index. */
export const INDEX_RETRY_MS = 10 * 60 * 1000;

let skipUntil = 0;
let warned = false;

/** True for Firestore's "the query requires an index" rejection (gRPC code 9). */
export function isMissingIndexError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  const text = String(e?.message ?? error);
  const preconditionFailed = e?.code === 9 || text.includes('FAILED_PRECONDITION');
  return preconditionFailed && /requires an index|index configuration/i.test(text);
}

/** True while a recent missing-index failure says the query cannot succeed. */
export function preBriefingIndexUnavailable(now: number = Date.now()): boolean {
  return now < skipUntil;
}

/**
 * Log a pre-briefing lookup failure. A missing index logs one warning per
 * process and starts the cooldown; any other failure logs an error as before.
 */
export function reportPreBriefingError(
  error: unknown,
  fields: Record<string, unknown>,
  now: number = Date.now()
): void {
  if (!isMissingIndexError(error)) {
    log.error({ error: String(error), ...fields }, 'Failed to get pre-briefing');
    return;
  }
  skipUntil = now + INDEX_RETRY_MS;
  if (warned) return;
  warned = true;
  log.warn(
    { error: String(error).slice(0, 400), retryMs: INDEX_RETRY_MS },
    'pre_briefings composite index missing; skipping pre-briefing until it exists (logged once)'
  );
}

/** Test-only: clear the latch and cooldown. */
export function resetPreBriefingIndexGuardForTests(): void {
  skipUntil = 0;
  warned = false;
}
