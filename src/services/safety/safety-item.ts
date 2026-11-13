/**
 * Safety items (a 988 follow-up, a check-in after a crisis, minor care) are
 * never dropped from a text or closed by the freshness and close rules: a
 * stale safety reminder costs a line, a missing one can cost far more. Matched
 * by type, in whatever field the item's store keeps one. It lives with the
 * safety kernel so the safety-kind words have one owner (crisis readers ratchet).
 *
 * @module services/safety/safety-item
 */

const SAFETY_KIND = /crisis|988|minor[-_ ]?care|safety/i;

export function isSafetyItem(kind: string | undefined): boolean {
  return kind !== undefined && SAFETY_KIND.test(kind);
}
