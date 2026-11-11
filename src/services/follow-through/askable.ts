/**
 * Which follow-ups are the caller's own to be asked about, and their order: one
 * rule for the opener (opener-pick.ts) and the arbiter (arbiter.ts). Pure.
 *
 * @module services/follow-through/askable
 */
import type { FollowUp, FollowUpKind } from './follow-up.js';

/** The caller's own things. Ferni's promises and actions are told (promise ledger phase 3), not asked. */
const ASKABLE: ReadonlySet<FollowUpKind> = new Set([
  'commitment',
  'reminder',
  'thread',
  'date',
  'dose',
]);

/** The caller's own thing: not one of Ferni's promises, and not an action read back to them. */
export const isCallersOwn = (f: FollowUp): boolean => ASKABLE.has(f.kind) && !f.action;

/** Due ones first (latest due first), then undated, newest first. A sort comparator. */
export function byOpenerOrder(a: FollowUp, b: FollowUp): number {
  const key = (f: FollowUp): number[] =>
    f.dueAt ? [1, Date.parse(f.dueAt)] : [0, Date.parse(f.createdAt)];
  const [ka, kb] = [key(a), key(b)];
  return kb[0] - ka[0] || kb[1] - ka[1];
}
