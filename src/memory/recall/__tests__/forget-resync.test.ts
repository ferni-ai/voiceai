import { FieldValue } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';

const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (c1: string) => ({
      doc: (uid: string) => ({
        collection: (c2: string) => ({
          doc: (id: string) => ({ path: `${c1}/${uid}/${c2}/${id}` }),
        }),
      }),
    }),
    batch: () => ({
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        updates.push({ path: ref.path, data }),
      commit: async () => undefined,
    }),
  }),
}));

const { firestoreForgetStore } = await import('../forget.js');

describe('marking facts forgotten', () => {
  it('sends a dynamic fact back through the graph sync, so a copy made earlier is removed', async () => {
    await firestoreForgetStore.markForgotten(
      'u1',
      [
        { collection: 'dynamic_facts', id: 'f1', data: {} },
        { collection: 'extracted_facts', id: 'e1', data: {} },
      ],
      '2026-01-07T00:00:00Z'
    );
    expect(updates).toEqual([
      {
        path: 'bogle_users/u1/dynamic_facts/f1',
        // Its stored vector goes in the same write (RECALL_VECTOR_INDEX).
        data: {
          forgottenAt: '2026-01-07T00:00:00Z',
          syncedToSpanner: false,
          embedding: FieldValue.delete(),
        },
      },
      { path: 'bogle_users/u1/extracted_facts/e1', data: { forgottenAt: '2026-01-07T00:00:00Z' } },
    ]);
  });

  it('keeps when a fact was first forgotten when it goes through again', async () => {
    updates.length = 0;
    await firestoreForgetStore.markForgotten(
      'u1',
      [{ collection: 'dynamic_facts', id: 'f2', data: { forgottenAt: '2026-01-01T00:00:00Z' } }],
      '2026-01-07T00:00:00Z'
    );
    expect(updates[0]?.data).toEqual({
      forgottenAt: '2026-01-01T00:00:00Z',
      syncedToSpanner: false,
      embedding: FieldValue.delete(),
    });
  });
});
