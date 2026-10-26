/**
 * The real reads behind GET /api/on-it (follow-ups, open errands while ERRANDS
 * is on, forgotten topics via firestoreHoldingDeps), apart from the route so
 * tests can swap the stores and still run the real route.
 *
 * @module api/on-it-deps
 */
import { errandsEnabled } from '../config/errands-flag.js';
import type { Errand } from '../services/errands/index.js';
import type { FollowUp } from '../services/follow-through/index.js';
import { firestoreHoldingDeps } from './follow-through-upcoming-deps.js';

/** Each read throws when its store can't be read; openErrands is null while errands are off. */
export interface OnItDeps {
  live: (userId: string) => Promise<FollowUp[]>;
  changed: (userId: string, from: Date, to: Date) => Promise<FollowUp[]>;
  openErrands: (userId: string) => Promise<Errand[] | null>;
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
