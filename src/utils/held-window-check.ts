/**
 * MINOR_CARE: was this made during a purged held call? For stores in any layer.
 *
 * The windows live in services/trust-systems/held-window.ts, which sets the check when it loads,
 * so a store here never imports the trust stores.
 *
 * @module utils/held-window-check
 */
import { withTimeout } from './async.js';

let check: (userId: string, at: number) => boolean = () => false;
export function setHeldWindowCheck(next: (userId: string, at: number) => boolean): void {
  check = next;
}

/** A stored time in ms: epoch ms, an ISO string, a Date or a Firestore Timestamp; else NaN. */
function msOf(at: unknown): number {
  if (typeof at === 'number') return at;
  if (typeof at === 'string') return Date.parse(at);
  if (at instanceof Date) return at.getTime();
  const toMillis = (at as { toMillis?: () => number } | null | undefined)?.toMillis;
  return typeof toMillis === 'function' ? toMillis.call(at) : NaN;
}

export const madeWhileHeld = (userId: string, at: unknown): boolean => check(userId, msOf(at));

/** These items minus the ones made during a purged held call. */
export function withoutHeldAt<T>(userId: string, items: T[], at: (item: T) => unknown): T[] {
  return items.filter((item) => !madeWhileHeld(userId, at(item)));
}

/** How long a request waits for the stored windows; past it, the reader serves nothing. */
export const HELD_READ_TIMEOUT_MS = 2000;

/**
 * withoutHeldAt, after `load` (loadHeldWindows) read the user's stored windows on this request, so
 * a process that never saw the purge, an API server, applies a window another process stored a
 * moment ago. Never cached: a cached "none" served a held item until it expired (#2906 verifier,
 * point 5), and no signal reaches every process when a window is stored. One doc read per request.
 * Rejects when the windows can't be read in HELD_READ_TIMEOUT_MS (the callers serve nothing).
 */
export async function withoutHeldStored<T>(
  userId: string,
  items: T[],
  at: (item: T) => unknown,
  load: (userId: string) => Promise<unknown>
): Promise<T[]> {
  await withTimeout(load(userId), HELD_READ_TIMEOUT_MS, 'MINOR_CARE held windows read');
  return withoutHeldAt(userId, items, at);
}
