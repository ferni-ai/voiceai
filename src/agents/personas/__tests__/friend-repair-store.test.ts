/**
 * The Firestore side of FRIEND_REPAIR: a fact the caller corrected is retired in one
 * write, and its stored vector (RECALL_VECTOR_INDEX) goes with it.
 */
import { FieldValue } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';

const updates = vi.hoisted(() => [] as Array<{ path: string; data: Record<string, unknown> }>);
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (root: string) => ({
      doc: (uid: string) => ({
        collection: (name: string) => ({
          doc: (id: string) => ({ path: `${root}/${uid}/${name}/${id}` }),
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

const { firestoreRepairStore } = await import('../friend-repair-store.js');

describe('firestoreRepairStore.retire', () => {
  it('marks the corrected fact and deletes its stored vector in the same write', async () => {
    await firestoreRepairStore.retire('u1', ['f1'], 'c1', '2026-10-21T10:00:00.000Z');
    expect(updates).toEqual([
      {
        path: 'bogle_users/u1/dynamic_facts/f1',
        data: {
          supersededAt: '2026-10-21T10:00:00.000Z',
          supersededBy: 'c1',
          correctedAt: '2026-10-21T10:00:00.000Z',
          embedding: FieldValue.delete(),
        },
      },
    ]);
  });
});
