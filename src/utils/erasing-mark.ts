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
