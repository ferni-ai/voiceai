/**
 * The Firestore side of revived intelligence reads the caller's latest summaries
 * and leaves out any item they said was wrong (dispute.ts disputedItems), as
 * recall's own summary readers do.
 */
import { describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  asked: [] as string[],
}));
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ({
        collection: (sub: string) => {
          docs.asked.push(`${c}/${id}/${sub}`);
          const q = {
            orderBy: () => q,
            limit: () => q,
            get: async () => ({ docs: docs.rows.map((r) => ({ data: () => r })) }),
          };
          return q;
        },
      }),
    }),
  }),
}));

const { firestoreRevivedStore } = await import('../revived-store.js');

describe('firestoreRevivedStore', () => {
  it("reads the caller's summaries without the items they disputed", async () => {
    docs.rows = [
      {
        sessionId: 's1',
        keyPoints: ['Sam lives in Boston', 'Sam started a new job'],
        disputedItems: ['Sam lives in Boston'],
      },
    ];
    const [summary] = await firestoreRevivedStore.summaries('u-1');
    expect(docs.asked).toEqual(['bogle_users/u-1/summaries']);
    expect(summary?.keyPoints).toEqual(['Sam started a new job']);
    expect(JSON.stringify(summary)).not.toContain('Boston');
  });
});
