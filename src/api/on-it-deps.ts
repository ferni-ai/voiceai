/**
 * The real reads behind GET /api/on-it: the follow-through store (live and
 * changed lately), the errand store's open errands while ERRANDS is on, and
 * the topics the person asked Ferni to forget, matched the way the follow-up
 * job does (via firestoreHoldingDeps). Kept apart from the route so tests can
 * swap the stores and still run the real route.
 *
 * @module api/on-it-deps
 */
import { errandsEnabled } from '../config/errands-flag.js';
import type { Errand } from '../services/errands/index.js';
import type { FollowUp } from '../services/follow-through/index.js';
import { firestoreHoldingDeps } from './follow-through-upcoming-deps.js';

export interface OnItDeps {
  /** Open or surfaced follow-ups. Throws when the store can't be read. */
  live: (userId: string) => Promise<FollowUp[]>;
  /** Follow-ups updated in [from, to). Throws when the store can't be read. */
  changed: (userId: string, from: Date, to: Date) => Promise<FollowUp[]>;
  /** Open errands, or null while errands are off. Throws when the store can't be read. */
  openErrands: (userId: string) => Promise<Errand[] | null>;
  /** True for text about a forgotten topic. Throws when the list can't be read. */
  forgottenMatcher: (userId: string) => Promise<(text: string) => boolean>;
}

export async function firestoreOnItDeps(): Promise<OnItDeps> {
  const [holding, { firestoreFollowUpStore }, { firestoreErrandStore }] = await Promise.all([
    firestoreHoldingDeps(),
    import('../services/stores/follow-through-store.js'),
    import('../services/stores/errand-store.js'),
  ]);
  const store = firestoreFollowUpStore();
  if (!store) throw new Error('Follow-through store unavailable');
  return {
    live: holding.live,
    forgottenMatcher: holding.forgottenMatcher,
    changed: async (userId, from, to) => store.changedBetween(userId, from, to),
    openErrands: async (userId) => {
      if (!errandsEnabled()) return null;
      // On but unreachable is a failed read, not "no errands"
      const errands = firestoreErrandStore();
      if (!errands) throw new Error('Errand store unavailable');
      return errands.open(userId);
    },
  };
}
