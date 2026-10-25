/**
 * The Firestore side of forget and dispute closes the caller's world facts
 * (bogle_users/{uid}/world_facts), where the dated follow-ups are read from:
 * before 2026-10-25 neither touched them, so a forgotten or disputed topic
 * could still be raised as "how did it go?".
 */
import { describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as Array<{ path: string; patch: Record<string, unknown> }>);
vi.mock('../../../utils/firestore-utils.js', () => {
  const ref = (path: string) => ({
    path,
    doc: (id: string) => ref(`${path}/${id}`),
    collection: (name: string) => ref(`${path}/${name}`),
  });
  return {
    getFirestoreDb: () => ({
      collection: (name: string) => ref(name),
      batch: () => {
        const pending: typeof writes = [];
        return {
          update: (r: { path: string }, patch: Record<string, unknown>) =>
            pending.push({ path: r.path, patch }),
          commit: async () => void writes.push(...pending),
        };
      },
    }),
  };
});

const { firestoreDisputeStore } = await import('../dispute-store.js');
const { closeWorldFacts, firestoreForgetStore } = await import('../../recall/forget.js');

describe('world facts in the Firestore forget and dispute stores', () => {
  it('forget closes them as forgotten; dispute also marks them wrong', async () => {
    const at = '2026-10-24T12:00:00.000Z';
    expect(firestoreForgetStore.markWorldFacts).toBe(closeWorldFacts);
    expect(firestoreDisputeStore.markWorldFacts).toBe(closeWorldFacts);
    await closeWorldFacts('u1', ['wf_1'], at);
    await closeWorldFacts('u1', ['wf_2'], at, true);
    expect(writes).toEqual([
      {
        path: 'bogle_users/u1/world_facts/wf_1',
        patch: { validTo: at, forgottenAt: at },
      },
      {
        path: 'bogle_users/u1/world_facts/wf_2',
        patch: { validTo: at, forgottenAt: at, wrong: true, disputedAt: at },
      },
    ]);
  });
});
