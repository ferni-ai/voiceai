/**
 * The follow-through side of memory's forget port
 * (memory/recall/forget-follow-ups.ts): a forgotten topic releases the
 * person's open follow-ups about it in the follow-through store.
 *
 * @module services/outreach/forget-follow-ups-adapter
 */
import {
  setForgetFollowUpsPort,
  type ForgetFollowUpsPort,
} from '../../memory/recall/forget-follow-ups.js';
import { releaseForgotten } from '../follow-through/index.js';
import { firestoreFollowUpStore } from '../stores/follow-through-store.js';

export const forgetFollowUpsAdapter: ForgetFollowUpsPort = {
  closeAbout: async (userId, about, now) => {
    const store = firestoreFollowUpStore();
    if (!store) throw new Error('no follow-through store');
    return releaseForgotten(store, userId, about, now);
  },
};

/** Install the adapter; safe to call more than once. */
export function installForgetFollowUpsPort(): void {
  setForgetFollowUpsPort(forgetFollowUpsAdapter);
}
