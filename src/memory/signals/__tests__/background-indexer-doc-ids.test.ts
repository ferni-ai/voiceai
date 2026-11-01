/**
 * The background indexer walks every directory under personas/bundles,
 * including `__tests__`. Firestore rejects `__x__` and dot document ids, so
 * writing index status for those dirs failed with INVALID_ARGUMENT on every
 * start (~32 prod and ~1,000 dev errors a day). Only real bundle names are
 * written to vector_index_status.
 */
import { describe, expect, it, vi } from 'vitest';

const writtenIds = vi.hoisted(() => [] as string[]);

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        get: async () => ({ docs: [] }),
        doc: (id: string) => ({
          set: async () => {
            writtenIds.push(id);
          },
        }),
      };
    }
  },
}));
vi.mock('../../../config/environment.js', () => ({
  getGCPProjectId: () => 'test-project',
  getFirestoreDatabase: () => '(default)',
}));
vi.mock('../../semantic-rag.js', () => ({ indexPersonaContent: vi.fn(async () => undefined) }));
vi.mock('fs/promises', () => ({
  readdir: vi.fn(async (_path: string, opts?: { withFileTypes?: boolean }) =>
    opts?.withFileTypes
      ? ['ferni', '__tests__', '_shared', '.cache', 'maya-santos'].map((name) => ({
          name,
          isDirectory: () => true,
        }))
      : []
  ),
  readFile: vi.fn(async () => ''),
}));

const { startBackgroundIndexing, waitForIndexing, resetIndexingState } =
  await import('../background-indexer.js');

describe('background indexer status writes', () => {
  it('skip directories whose names start with _ or . and still write real bundles', async () => {
    resetIndexingState();
    await startBackgroundIndexing({} as never, { startDelayMs: 0 });
    await waitForIndexing();

    expect(writtenIds.sort()).toEqual(['ferni', 'maya-santos']);
  });
});
