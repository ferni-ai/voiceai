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

/**
 * `source` on a dynamic_facts row holding what someone else said on a call
 * Ferni made for the owner (services/outreach/call-memory.ts). Their words are
 * untrusted: only a reader that frames them as reported speech
 * (session-recall.ts formatRecall, outreach/caller-text.ts) may show them.
 */
export const REPORTED_CALL_SOURCE = 'on_behalf_call';

function isReportedCallRow(row: Record<string, unknown>): boolean {
  return row.source === REPORTED_CALL_SOURCE;
}

/**
 * A row a plain dynamic_facts reader may use: not expired and not a reported
 * call row. For readers that put fact values into a prompt or an index
 * without the reported-speech frame.
 */
export function isPlainFactRow(row: Record<string, unknown>, now: number = Date.now()): boolean {
  return !isExpired(row.expireAt, now) && !isReportedCallRow(row);
}

/** The query docs a plain dynamic_facts reader may use (isPlainFactRow). */
export function plainFactDocs<D extends { data(): Record<string, unknown> }>(docs: D[]): D[] {
  return docs.filter((d) => isPlainFactRow(d.data()));
}
