/**
 * A stored memory past its `expireAt` (a Firestore Timestamp, a Date or an ISO
 * string) is left out by every reader, before a Firestore TTL policy on the
 * field gets round to deleting it. Rows without the field never expire.
 * Written by services/outreach/call-memory.ts (180 days).
 *
 * @module memory/recall/expired
 */

/** True when `expireAt` is a readable time at or before `now`. */
export function isExpired(expireAt: unknown, now: number = Date.now()): boolean {
  let at = NaN;
  if (expireAt instanceof Date) at = expireAt.getTime();
  else if (typeof expireAt === 'string') at = Date.parse(expireAt);
  else if (
    typeof expireAt === 'object' &&
    expireAt !== null &&
    typeof (expireAt as { toMillis?: unknown }).toMillis === 'function'
  ) {
    at = (expireAt as { toMillis: () => number }).toMillis();
  }
  return !Number.isNaN(at) && at <= now;
}
