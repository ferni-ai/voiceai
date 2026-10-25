/**
 * reindex-mismatched-embeddings: a dry run by default that only counts, and
 * measures vectors stored as Firestore VectorValues (not only arrays).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { docs, update, del } = vi.hoisted(() => {
  const vector = (n: number) => ({ toArray: () => new Array<number>(n).fill(0) });
  return {
    docs: [
      { id: 'ok', data: () => ({ text: 'a', embedding: vector(768) }) },
      { id: 'old-vector', data: () => ({ text: 'b', embedding: vector(384) }) },
      { id: 'old-array', data: () => ({ text: 'c', embedding: new Array<number>(384).fill(0) }) },
      { id: 'none', data: () => ({ text: 'd' }) },
    ],
    update: vi.fn(async () => undefined),
    del: vi.fn(async () => undefined),
  };
});
vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { vector: (v: number[]) => v },
  getFirestore: () => ({
    collection: () => ({
      get: async () => ({ size: docs.length, docs }),
      doc: () => ({ update, delete: del }),
    }),
  }),
}));

const { dimensionOf, main } = await import('../reindex-mismatched-embeddings.js');

let log: ReturnType<typeof vi.spyOn>;
const fetchSpy = vi.fn();
beforeEach(() => {
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'johnb-2025');
  // With a key set, any re-embed would reach fetch: the dry run must not
  vi.stubEnv('GOOGLE_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchSpy);
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  process.exitCode = undefined;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('reindex-mismatched-embeddings', () => {
  it('measures arrays and Firestore vectors', () => {
    expect(dimensionOf([1, 2, 3])).toBe(3);
    expect(dimensionOf({ toArray: () => [1, 2] })).toBe(2);
    expect(dimensionOf(undefined)).toBeNull();
  });

  it('by default only counts: no embedding calls, no ids, no writes', async () => {
    await main(['node', 'reindex']);
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('Found 2 documents with wrong dimensions');
    expect(out).toContain('384 dimensions: 2 documents');
    expect(out).not.toContain('old-vector');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('refuses to write without the matching --confirm-project', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['node', 'reindex', '--delete', '--execute']);
    expect(process.exitCode).toBe(1);
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes the mismatched documents only with --execute --confirm-project', async () => {
    await main(['node', 'reindex', '--delete', '--execute', '--confirm-project=johnb-2025']);
    expect(del).toHaveBeenCalledTimes(2);
  });
});
