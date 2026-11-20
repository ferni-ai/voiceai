/**
 * A calendar read that failed is not a clear calendar (CALENDAR_LOAD_FAIL_HONEST).
 *
 * The unified store loads a person's events and provider links from Firestore
 * once per process. When that load threw, it cached an empty calendar and marked
 * the person loaded, so for the rest of the process every read said "Your
 * calendar is clear" (or "none connected"), and nothing ever retried.
 *
 * With the flag on, a failed load caches nothing, so the next read tries again,
 * and the person is marked unread. A calendar tool's read that hit a failed load
 * says CALENDAR_UNCHECKED instead of what an empty calendar would say. The read
 * itself still returns the same empty result, so other callers (briefings,
 * context builders) behave as before for that one read. Off, the failure is
 * logged and cached exactly as before.
 *
 * @module calendar/calendar-load-state
 */
import { flagOn } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import { CALENDAR_UNCHECKED } from './not-connected-copy.js';

/** People whose calendar load failed since a tool's read began. */
const unread = new Set<string>();

function calendarLoadFailHonestOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('CALENDAR_LOAD_FAIL_HONEST', env);
}

/**
 * The store's load threw. Logs it, and returns true (flag on) when the store must
 * cache nothing and mark nobody loaded; false keeps the old empty cache.
 */
export function calendarLoadFailed(userId: string, error: unknown): boolean {
  getLogger().error({ error: String(error), userId }, 'Failed to load user calendar data');
  if (!calendarLoadFailHonestOn()) return false;
  unread.add(userId);
  return true;
}

/**
 * A calendar tool's read: what `run` says, or CALENDAR_UNCHECKED when a calendar
 * load failed while it ran (flag on). Off, `run` alone.
 */
export async function readOrUnchecked<T>(
  userId: string,
  run: () => Promise<T>
): Promise<T | string> {
  if (!calendarLoadFailHonestOn()) return run();
  unread.delete(userId);
  const out = await run();
  if (!unread.delete(userId)) return out;
  getLogger().warn({ userId }, 'CALENDAR_UNREAD: a calendar read hit a failed load');
  return CALENDAR_UNCHECKED;
}
