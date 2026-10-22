/**
 * The knowledge graph (Spanner knowledge_graph) is prod's. A process on a
 * non-prod Firestore database (dev) skips every graph write unless
 * GRAPH_WRITES_ON_DEV_DB=on. Only Spanner and the semantic index are faked;
 * the real write functions run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const runTransactionAsync = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    await fn({ runUpdate: async () => [1], commit: async () => undefined });
  })
);
vi.mock('@google-cloud/spanner', () => {
  const database = { run: async () => [[{ ok: 1 }]], runTransactionAsync };
  return {
    Spanner: class {
      instance() {
        return { database: () => database };
      }
    },
  };
});
vi.mock('../../retrieval/semantic-memory-search.js', () => ({ indexMemory: vi.fn() }));

const graph = await import('../client.js');
const { insertSyncedFact, deleteFact } = await import('../fact-sync-writes.js');
await graph.initializeSpanner();

const at = new Date('2026-10-01T00:00:00Z');
const row = {
  userId: 'u1',
  entityId: 'e1',
  factId: 'f1',
  key: 'job',
  value: 'nurse',
  extractedAt: at,
  firstMentioned: at,
  lastMentioned: at,
  lastUpdated: at,
} as never;

/** Every graph write, the sync's included; returns how many reached Spanner. */
async function writeEverything(): Promise<number> {
  runTransactionAsync.mockClear();
  await graph.upsertEntity(row);
  await graph.insertFact(row);
  await graph.insertRelationship(row);
  await graph.linkFactToEntity('u1', 'e1', 'f1');
  await graph.upsertMemoryThread(row);
  await graph.insertMemoryAnchor(row);
  await graph.markAnchorRecalled('u1', 'a1');
  await insertSyncedFact(row);
  return runTransactionAsync.mock.calls.length;
}

afterEach(() => vi.unstubAllEnvs());

describe('graph writes on a non-prod Firestore database', () => {
  it("on prod's database, every write reaches the graph", async () => {
    expect(graph.isSpannerReady()).toBe(true);
    expect(await writeEverything()).toBe(8);
  });

  it('on ferni-dev, no write reaches it and a removal refuses', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    expect(await writeEverything()).toBe(0);
    await expect(deleteFact('u1', 'f1')).rejects.toThrow();
    expect(runTransactionAsync).not.toHaveBeenCalled();
  });

  it('on ferni-dev with GRAPH_WRITES_ON_DEV_DB=on, writes go through', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    vi.stubEnv('GRAPH_WRITES_ON_DEV_DB', 'on');
    expect(await writeEverything()).toBe(8);
  });
});
