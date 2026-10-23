/**
 * saveIndexStatus writes one vector_index_status document per bundle directory.
 *
 * Prod logged FIRESTORE_ERROR INVALID_ARGUMENT on that commit once per pod
 * start: the image ships src/personas/bundles/__tests__, and Firestore reserves
 * ids matching __.*__ (`Resource id "__tests__" is invalid because it is
 * reserved.` on the emulator). The fake db below rejects ids by the same rules
 * the emulator enforced, and stands in for the shared client, so a save that
 * builds its own client never reaches it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes: string[] = [];
const rejected: string[] = [];
let failAllWrites = false;

function firestoreRejects(id: string): boolean {
  return (
    id === '' ||
    id === '.' ||
    id === '..' ||
    id.includes('/') ||
    /^__.*__$/.test(id) ||
    Buffer.byteLength(id, 'utf8') > 1500
  );
}

const fakeDb = {
  collection: vi.fn(() => ({
    get: vi.fn(async () => ({ docs: [] })),
    doc: vi.fn((id: string) => ({
      set: vi.fn(async () => {
        if (failAllWrites) throw Object.assign(new Error('UNAVAILABLE'), { code: 14 });
        if (firestoreRejects(id)) {
          rejected.push(id);
          throw Object.assign(new Error(`3 INVALID_ARGUMENT: Resource id "${id}" is invalid`), {
            code: 3,
          });
        }
        writes.push(id);
      }),
    })),
  })),
};

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => fakeDb),
  removeUndefined: <T extends object>(obj: T): T =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T,
}));

vi.mock('../../semantic-rag.js', () => ({ indexPersonaContent: vi.fn() }));

// The directories the agent image has under dist/personas/bundles.
const BUNDLE_DIRS = ['.templates', '__tests__', 'ferni', 'maya-santos', 'shared'];

vi.mock('fs/promises', () => ({
  readdir: vi.fn(async (_path: string, opts?: { withFileTypes?: boolean }) => {
    if (opts?.withFileTypes) return BUNDLE_DIRS.map((name) => ({ name, isDirectory: () => true }));
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); // no knowledge/ dir
  }),
  readFile: vi.fn(async () => ''),
}));

async function runIndexer(): Promise<Map<string, { status: string }>> {
  const indexer = await import('../background-indexer.js');
  indexer.resetIndexingState();
  await indexer.startBackgroundIndexing({} as never, { startDelayMs: 0 });
  await indexer.waitForIndexing();
  return indexer.getIndexingStatus();
}

describe('background indexer: vector_index_status document ids', () => {
  beforeEach(() => {
    writes.length = 0;
    rejected.length = 0;
    failAllWrites = false;
  });

  it('saves every persona bundle through the shared client and never sends a reserved id', async () => {
    const status = await runIndexer();

    expect(rejected).toEqual([]);
    expect(writes).toEqual(['.templates', 'ferni', 'maya-santos', 'shared']);
    expect(status.has('__tests__')).toBe(false);
    expect(status.get('ferni')?.status).toBe('complete');
  });

  it('isStorableBundleId follows the rules Firestore enforces', async () => {
    const { isStorableBundleId } = await import('../background-indexer.js');
    for (const bad of ['__tests__', '__a__', 'a/b', '.', '..', '', 'x'.repeat(1501)]) {
      expect(isStorableBundleId(bad), bad).toBe(false);
    }
    for (const good of ['ferni', '.templates', '__foo', 'foo__', 'x'.repeat(1500)]) {
      expect(isStorableBundleId(good), good).toBe(true);
    }
  });

  it('a failing save does not throw out of the indexing run', async () => {
    failAllWrites = true;
    const status = await runIndexer();

    expect(writes).toEqual([]);
    expect(status.get('ferni')?.status).toBe('complete');
  });
});
