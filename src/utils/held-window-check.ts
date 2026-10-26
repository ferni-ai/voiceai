/**
 * MINOR_CARE: was this made during a purged held call? For stores in any layer.
 *
 * The windows live in services/trust-systems/held-window.ts. minor-care-purge.ts sets the check
 * when it loads, so a store here never imports the trust stores. Answers false until then.
 *
 * @module utils/held-window-check
 */

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
