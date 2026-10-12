/**
 * The graph sync never leaves a forgotten fact in the graph store or its
 * semantic index, never reports a removal it didn't make, and never lets
 * failing removals hold up live facts. These drive the REAL sync, mark,
 * insert and delete code; only the infrastructure is faked: Spanner, the
 * Firestore docs, and the vector index (whose writes can be delayed, and
 * which can be in fallback mode).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Spanner: a facts table -----------------------------------------------
const graph = new Map<string, string>(); // fact_id -> user_id
let spannerFails = false;
vi.mock('@google-cloud/spanner', () => {
  const database = {
    run: async () => [[{ ok: 1 }]],
    runTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => {
      if (spannerFails) throw new Error('spanner down');
      await fn({
        runUpdate: async ({ sql, params }: { sql: string; params: Record<string, string> }) => {
          if (/^\s*INSERT INTO facts/i.test(sql)) graph.set(params.factId!, params.userId!);
          if (/^\s*DELETE FROM facts/i.test(sql)) graph.delete(params.factId!);
        },
        commit: async () => undefined,
      });
    },
  };
  class Spanner {
    instance() {
      return { database: () => database };
    }
  }
  return { Spanner };
});

// --- the semantic index: writes can land late; fallback can be switched on --
const vectors = new Map<string, string>();
let indexDelayMs = 0;
let store: unknown;
const fakeStore = {
  isInitialized: true,
  initialize: async () => undefined,
  addDocument: async (d: { id: string; text: string }) => {
    await new Promise((r) => setTimeout(r, indexDelayMs));
    vectors.set(d.id, d.text);
  },
  removeDocument: async (id: string) => (vectors.delete(id), true),
};
vi.mock('../../firestore-vector-store/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../firestore-vector-store/index.js')>()),
  getFirestoreVectorStore: () => store,
}));

// --- Firestore: dynamic_facts docs ------------------------------------------
const docs = new Map<string, Record<string, unknown>>();
const ref = (path: string) => ({
  path,
  update: async (data: Record<string, unknown>) => {
    docs.set(path, { ...(docs.get(path) ?? {}), ...data });
  },
});
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => {
    const at = (path: string): unknown => ({
      doc: (id: string) => ({
        ...ref(`${path}/${id}`),
        collection: (c: string) => at(`${path}/${id}/${c}`),
      }),
    });
    return {
      collection: (c: string) => at(c),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: async (r: { path: string }) => {
            const d = docs.get(r.path);
            return { exists: !!d, get: (k: string) => d?.[k] };
          },
          update: (r: { path: string }, data: Record<string, unknown>) => {
            docs.set(r.path, { ...(docs.get(r.path) ?? {}), ...data });
          },
        }),
    };
  },
}));

const { initializeSpanner } = await import('../../spanner-graph/client.js');
const { syncFactDocs, firestoreFactSyncOps, retryDue, retryAfter } =
  await import('../firestore-spanner-sync.js');

const path = (id: string) => `bogle_users/u1/dynamic_facts/${id}`;
const live = { entityName: 'User', key: 'job', value: 'nurse', extractedAt: '2026-01-05' };
const asRead = (id: string, data: Record<string, unknown> = live) => ({ id, path: path(id), data });
const settle = () => new Promise((r) => setTimeout(r, indexDelayMs + 20));

beforeEach(async () => {
  graph.clear();
  vectors.clear();
  docs.clear();
  indexDelayMs = 0;
  spannerFails = false;
  store = fakeStore;
  await initializeSpanner();
});
afterEach(() => vi.useRealTimers());

describe('the graph sync and forgetting', () => {
  it('a fact forgotten between the read and the write leaves no copy, even when the index write is slow', async () => {
    indexDelayMs = 30;
    docs.set(path('f1'), { ...live, syncedToSpanner: false, forgottenAt: '2026-01-07' }); // forgotten after the read
    const out = await syncFactDocs([asRead('f1')], firestoreFactSyncOps());
    await settle(); // let any late index write land
    expect(graph.has('fact_u1_f1')).toBe(false);
    expect(vectors.has('fact_fact_u1_f1')).toBe(false);
    expect(out.removed).toBe(1);
    expect(docs.get(path('f1'))?.syncedToSpanner).toBe(true);
  });

  it('a live fact is copied, indexed, and marked synced', async () => {
    docs.set(path('f2'), { ...live, syncedToSpanner: false });
    const out = await syncFactDocs([asRead('f2')], firestoreFactSyncOps());
    expect(graph.has('fact_u1_f2')).toBe(true);
    expect(vectors.has('fact_fact_u1_f2')).toBe(true);
    expect(out.synced).toBe(1);
    expect(docs.get(path('f2'))?.syncedToSpanner).toBe(true);
  });

  it('never reports a removal the index did not confirm (fallback mode), and defers it', async () => {
    const { FirestoreVectorStore } = await vi.importActual<
      typeof import('../../firestore-vector-store/index.js')
    >('../../firestore-vector-store/index.js');
    const fallback = new FirestoreVectorStore();
    await fallback.initialize(); // no Firestore in tests: fallback mode
    expect(fallback.getHealth().usingFallback).toBe(true);
    store = fallback;
    const forgotten = { ...live, forgottenAt: '2026-01-07', syncedToSpanner: false };
    docs.set(path('f3'), forgotten);
    const out = await syncFactDocs([asRead('f3', forgotten)], firestoreFactSyncOps());
    expect(out).toMatchObject({ removed: 0, deleteFailures: 1 });
    expect(docs.get(path('f3'))).toMatchObject({ syncedToSpanner: 'retry', syncRetryCount: 1 });
  });

  it('failing removals go to their own retry queue, so live facts behind them still sync', async () => {
    store = { ...fakeStore, removeDocument: async () => false };
    const forgotten = { ...live, forgottenAt: '2026-01-07', syncedToSpanner: false };
    for (const id of ['g1', 'g2', 'g3']) docs.set(path(id), { ...forgotten });
    docs.set(path('f4'), { ...live, syncedToSpanner: false });
    const out = await syncFactDocs(
      [asRead('g1', forgotten), asRead('g2', forgotten), asRead('g3', forgotten), asRead('f4')],
      firestoreFactSyncOps()
    );
    expect(out.synced).toBe(1);
    for (const id of ['g1', 'g2', 'g3']) {
      // Out of the main queue (syncedToSpanner == false), not marked done.
      expect(docs.get(path(id))?.syncedToSpanner).toBe('retry');
    }
    const now = Date.parse('2026-01-10T00:00:00Z');
    expect(retryDue({ syncRetryAfter: retryAfter(1, now) }, now)).toBe(false);
    expect(retryDue({ syncRetryAfter: retryAfter(1, now) }, now + 61_000)).toBe(true);
    expect(Date.parse(retryAfter(30, now)) - now).toBe(24 * 3_600_000); // capped at a day
  });

  it('a failed graph insert is not marked synced', async () => {
    spannerFails = true;
    docs.set(path('f5'), { ...live, syncedToSpanner: false });
    const out = await syncFactDocs([asRead('f5')], firestoreFactSyncOps());
    expect(out.failed).toBe(1);
    expect(docs.get(path('f5'))?.syncedToSpanner).toBe(false);
  });
});
