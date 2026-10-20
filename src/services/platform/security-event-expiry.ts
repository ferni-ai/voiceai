/**
 * security_events documents carry expireAt so a Firestore TTL policy deletes
 * them after the retention below (the audit had no expiry at all, 2026-10-18).
 * Kept out of security-events.ts, which is over the 500-line ratchet.
 *
 * @module services/platform/security-event-expiry
 */

/** How long an audit event is kept: a TTL policy on expireAt deletes it after this. */
export const SECURITY_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** The event with expireAt, a Date (stored as a Firestore Timestamp, which TTL reads). */
export function withExpiry<T extends { timestamp: Date }>(event: T): T & { expireAt: Date } {
  return { ...event, expireAt: new Date(event.timestamp.getTime() + SECURITY_EVENT_RETENTION_MS) };
}
