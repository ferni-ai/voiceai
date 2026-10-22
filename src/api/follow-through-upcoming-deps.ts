/**
 * The real reads behind GET /api/follow-through/upcoming: the follow-through
 * store FOLLOW_THROUGH_OPENER and the follow-up job read
 * (bogle_users/{uid}/follow_through, live()), and the topics the person asked
 * Ferni to forget, read and matched the way the follow-up job does
 * (forgottenTopicsOrNull + isForgotten). Kept apart from the route so tests
 * can swap the stores and still run the real route.
 *
 * @module api/follow-through-upcoming-deps
 */
import type { FollowUp } from '../services/follow-through/index.js';

export interface HoldingDeps {
  /** The person's open or surfaced follow-ups. Throws when the store can't be read. */
  live: (userId: string) => Promise<FollowUp[]>;
  /** True for text about a topic they asked Ferni to forget. Throws when the list can't be read. */
  forgottenMatcher: (userId: string) => Promise<(text: string) => boolean>;
}

export async function firestoreHoldingDeps(): Promise<HoldingDeps> {
  const [{ firestoreFollowUpStore }, { forgottenTopicsOrNull }, { isForgotten }] =
    await Promise.all([
      import('../services/stores/follow-through-store.js'),
      import('../memory/recall/forget.js'),
      import('../memory/recall/session-recall.js'),
    ]);
  const store = firestoreFollowUpStore();
  if (!store) throw new Error('Follow-through store unavailable');
  return {
    live: async (userId) => store.live(userId),
    forgottenMatcher: async (userId) => {
      // Unreadable is not "nothing forgotten": fail closed, as the follow-up job does
      const topics = await forgottenTopicsOrNull(userId);
      if (topics === null) throw new Error('Forgotten topics unreadable');
      return (text) => isForgotten(text, topics);
    },
  };
}
