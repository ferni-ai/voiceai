/**
 * The mark account erasure sets on a user record (bogle_users/{uid}, and each linked phone
 * profile's) before it deletes anything (services/platform/erase-user-record.ts markErasing).
 * The record itself is deleted last, because a retry reads the erasure's keys from it.
 *
 * A writer that must not write for an erased person reads the record, in the same
 * transaction as its write, and stops when isErasedOrErasing says so. Here, in the shared
 * kernel, so a capability (cross-persona's insight store) can use it without importing
 * the platform layer.
 *
 * @module utils/erasing-mark
 */

/** The fields markErasing merges into the record */
export function erasingMark(at: Date = new Date()): { erasing: true; erasingAt: string } {
  return { erasing: true, erasingAt: at.toISOString() };
}

/** True when the record is gone (erased) or marked by an erasure still running (or failed, to be retried) */
export function isErasedOrErasing(record: { exists: boolean; data: () => unknown }): boolean {
  if (!record.exists) return true;
  const data = record.data() as { erasing?: unknown } | undefined;
  return data?.erasing === true;
}

/** Accounts erased (or being erased) by this process, newest last; bounded */
const erasedHere = new Set<string>();
const MAX_ERASED_HERE = 10_000;

/**
 * Account erasure (markErasing) and account deletion (deleteFirebaseUser) note the uid:
 * from then on this process writes nothing for it, even once its record is gone. A uid
 * is never reissued. Other processes see only the record's mark, until it is deleted
 * (an erasure tombstone is a follow-up).
 */
export function noteErasedHere(uid: string): void {
  erasedHere.delete(uid);
  erasedHere.add(uid);
  if (erasedHere.size > MAX_ERASED_HERE) erasedHere.delete(erasedHere.values().next().value as string);
}

/**
 * The rule the engagement and user-record writers share: a write for `uid` is blocked
 * only by an explicit erasure, the record's `erasing` mark or this process having erased
 * the account. A missing record is a new user, never an erased one.
 */
export function writeBlockedFor(uid: string, record: { exists: boolean; data: () => unknown }): boolean {
  return (record.exists && isErasedOrErasing(record)) || erasedHere.has(uid);
}
