/**
 * Close a person's open follow-ups about something they asked Ferni to forget.
 *
 * The match is the caller's (memory decides what a forgotten topic covers), so
 * this context never reads forgotten topics itself. Each follow-up is released
 * with reason `forgotten` through the store's compare-and-set, so a call or the
 * delivery job that changed it a moment earlier wins and it is left for the
 * delivery job's own forgotten check.
 *
 * @module services/follow-through/release-forgotten
 */

import { apply } from './follow-up.js';
import type { FollowUpStore } from './ports.js';

/** Releases `userId`'s live follow-ups whose text `about` matches; how many it closed. */
export async function releaseForgotten(
  store: Pick<FollowUpStore, 'live' | 'save'>,
  userId: string,
  about: (text: string) => boolean,
  now: Date
): Promise<number> {
  let closed = 0;
  for (const f of await store.live(userId)) {
    if (!about(f.text)) continue;
    const next = apply(f, { type: 'release', reason: 'forgotten' }, now);
    if (next.success && (await store.save(next.data, f.updatedAt))) closed++;
  }
  return closed;
}
