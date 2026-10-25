/**
 * How long a raw web experiment event is kept. Each event doc under
 * web_experiments/{id}/events carries `expireAt`, and a Firestore TTL policy on
 * that field (collection group `events`) deletes it. The variant's metrics
 * counters are separate docs and stay. The policy is an infra step: until it is
 * enabled, `expireAt` is only a field.
 *
 * @module services/experiments/event-retention
 */

/** 180 days: long enough to analyse an experiment, short enough not to keep visitor ids forever. */
export const EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

/** When an event written now expires. */
export function eventExpireAt(now: number = Date.now()): Date {
  return new Date(now + EVENT_RETENTION_MS);
}
