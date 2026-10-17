/**
 * The Firestore side of the memory view reads only under the caller's own
 * record, and refuses rather than guess when forgotten topics are unreadable.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../memory/recall/memory-control.js', () => ({ listRemembered: vi.fn() }));
vi.mock('../../memory/recall/forget.js', () => ({
  firestoreForgetStore: { topics: vi.fn() },
}));

const { createFirestoreKnownStore } = await import('../routes/known-store.js');
const { firestoreForgetStore } = await import('../../memory/recall/forget.js');

describe('createFirestoreKnownStore', () => {
  /** A Firestore that records every document path it is asked for. */
  function fakeDb() {
    const paths: string[] = [];
    const doc = (path: string): Record<string, unknown> => ({
      path,
      id: path.split('/').pop(),
      collection: (name: string) => col(`${path}/${name}`),
      get: async () => {
        paths.push(path);
        return {
          exists: false,
          id: path.split('/').pop(),
          data: () => undefined,
          get: () => undefined,
        };
      },
    });
    const col = (path: string): Record<string, unknown> => {
      const q = {
        doc: (id: string) => doc(`${path}/${id}`),
        where: () => q,
        limit: () => q,
        get: async () => {
          paths.push(path);
          return { docs: [] };
        },
      };
      return q;
    };
    const db = {
      collection: (name: string) => col(name),
      getAll: async (...refs: Array<{ path: string }>) => {
        paths.push(...refs.map((r) => r.path));
        return refs.map((r) => ({
          exists: false,
          id: r.path.split('/').pop(),
          get: () => undefined,
        }));
      },
    };
    return { db, paths };
  }

  it('reads only under bogle_users/{the caller}', async () => {
    const { db, paths } = fakeDb();
    const s = createFirestoreKnownStore(() => db as never);
    await s.worldFacts('u-1');
    await s.mindModel('u-1');
    await s.pondering('u-1');
    await s.summaryDays('u-1', ['sum-1']);
    expect(paths).toEqual([
      'bogle_users/u-1/world_facts',
      'bogle_users/u-1/mind_model/current',
      'bogle_users/u-1/predictive_intelligence/pondering',
      'bogle_users/u-1/summaries/sum-1',
    ]);
  });
});

describe('createFirestoreKnownStore forgotten', () => {
  it('throws when the forgotten topics are unreadable, so the view fails closed', async () => {
    vi.mocked(firestoreForgetStore.topics).mockResolvedValueOnce(null);
    await expect(createFirestoreKnownStore(() => null).forgotten('u-1')).rejects.toThrow();
  });

  it('returns the recorded topics when they can be read', async () => {
    vi.mocked(firestoreForgetStore.topics).mockResolvedValueOnce(['contracts']);
    await expect(createFirestoreKnownStore(() => null).forgotten('u-1')).resolves.toEqual([
      'contracts',
    ]);
  });
});
