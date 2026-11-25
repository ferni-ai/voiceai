/**
 * An expired loop's vector copy holds only labels ("Open loop (intention) expired. Context:
 * Status: expired."), so vector search's forget filter must read no caller words in it
 * (forget-filter.ts openLoopWords), or a topic like "expired passport" would hold it. This builds
 * the copy through the real expiry path and the real coaching hook, so a wording change in
 * either breaks here rather than in the filter. Names are fictional.
 */
import { describe, expect, it, vi } from 'vitest';

import type { StoreChangeEvent } from '../../../data-layer/types.js';

const events: StoreChangeEvent[] = [];
vi.mock('../../../data-layer/store-hooks.js', () => ({
  onStoreChange: (e: StoreChangeEvent) => void events.push(e),
}));
vi.mock('../../firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({ doc: () => ({ update: async () => undefined }) }),
      }),
    }),
  }),
}));

const { expireStoredLoop } = await import('../open-loop-expiry.js');
const { onCoachingInsightChange } = await import('../../../data-layer/hooks/coaching-hooks.js');
const { openLoopWords } =
  await import('../../../../memory/firestore-vector-store/forget-filter.js');

describe("an expired loop's vector copy", () => {
  it.each([['intention'], ['life_event'], [undefined]])(
    'type %s: the filter reads no caller words in it',
    async (type) => {
      events.length = 0;
      await expireStoredLoop('u-fiction', { id: 'loop_1_ab12cd', type }, onCoachingInsightChange);
      expect(events).toHaveLength(1);
      const e = events[0]!;
      const id = `${e.storeType}_${e.entityType}_${e.entityId}`; // store-hooks.ts's doc id
      expect(id).toBe('coaching_coaching_insight_open_loop_loop_1_ab12cd');
      expect(openLoopWords({ id, text: e.content })).toBe('');
    }
  );
});
