/**
 * Session-start embedding prewarm reads only stores that hold data in prod.
 */
import { describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => vi.fn<(collection: string) => void>());
vi.mock('firebase-admin/firestore', () => {
  const query = (name: string) => {
    const chain = {
      orderBy: () => chain,
      limit: () => chain,
      get: async () => {
        read(name);
        return { docs: [{ data: () => ({ fact: 'walks the dog every morning at six' }) }] };
      },
    };
    return chain;
  };
  return {
    getFirestore: () => ({
      collection: () => ({ doc: () => ({ collection: (name: string) => query(name) }) }),
    }),
  };
});
vi.mock('../../../../memory/embedding-cache.js', () => ({
  embedBatchCached: vi.fn(async (texts: string[]) => texts.map(() => [0])),
}));

import { prewarmUserEmbeddings } from '../session-optimizations.js';

describe('prewarmUserEmbeddings reads', () => {
  it('never queries conversation_summaries (empty in prod, no live writer)', async () => {
    const result = await prewarmUserEmbeddings('u1');
    expect(read.mock.calls.map(([name]) => name)).toEqual(['extracted_facts']);
    expect(result.warmedCount).toBe(1);
  });
});
