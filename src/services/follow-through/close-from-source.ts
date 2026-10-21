/**
 * Close a person's live follow-up that was made from one source item, when that
 * item is closed elsewhere: a commitment marked done in the app closes its
 * follow-up as done; one dismissed releases it, so it is never texted about.
 *
 * Saves through the store's compare-and-set. If a call or the delivery job
 * changed the follow-up a moment earlier, it is read again and closed once
 * more; a store failure throws, so the caller can say the close didn't land.
 *
 * @module services/follow-through/close-from-source
 */

import { apply, isClosed } from './follow-up.js';
import type { FollowUpStore } from './ports.js';

/** Closes `userId`'s live follow-ups from `source`; how many it closed. */
export async function closeFromSource(
  store: Pick<FollowUpStore, 'live' | 'save'>,
  userId: string,
  source: { store: string; ref: string },
  how: 'done' | 'release',
  now: Date
): Promise<number> {
  let closed = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const mine = (await store.live(userId)).filter(
      (f) => f.source.store === source.store && f.source.ref === source.ref && !isClosed(f)
    );
    if (mine.length === 0) return closed;
    for (const f of mine) {
      const next = apply(f, { type: how }, now);
      if (next.success && (await store.save(next.data, f.updatedAt))) closed++;
    }
  }
  return closed;
}
