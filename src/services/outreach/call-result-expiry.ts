/**
 * How long the result of a call Ferni placed for a member is kept (owner, 2026-11-01).
 *
 * The result doc, bogle_users/{uid}/on_behalf_calls/{callId}, carries expireAt.
 * A Firestore TTL policy on on_behalf_calls.expireAt deletes it, late (a day or
 * more), so readers skip a result past it too. Results written before this
 * have no expireAt and are kept as they are until a one-off cleanup.
 *
 * @module services/outreach/call-result-expiry
 */

import { isMomentExpired } from '../../utils/shared-moment-retention.js';

/** A call result is deleted this many days after it is captured. */
export const CALL_RESULT_TTL_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a result captured at `now` expires (a Date: Firestore stores it as a Timestamp). */
export function callResultExpireAt(now: number = Date.now()): Date {
  return new Date(now + CALL_RESULT_TTL_DAYS * DAY_MS);
}

/** Past its expireAt; a result with none (written before the policy) never expires here. */
export function isCallResultExpired(
  doc: { expireAt?: unknown },
  now: number = Date.now()
): boolean {
  return isMomentExpired(doc, now);
}
