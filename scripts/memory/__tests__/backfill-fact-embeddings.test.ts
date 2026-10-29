import { describe, expect, it, vi } from 'vitest';
import {
  backfill,
  databaseRefusal,
  WRITTEN_FIELDS,
  type BackfillDeps,
  type BackfillOptions,
  type FactSource,
} from '../backfill-fact-embeddings.js';
import { vectorOf } from '../../../src/memory/recall/stored-fact-vectors.js';

const MODEL = 'text-embedding-005';

/** dynamic_facts in memory, in path order, recording every update. */
function fakeStore(n: number) {
  const docs = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < n; i++) {
    const path = `bogle_users/voice-eval-backfill-${i % 2}/dynamic_facts/f${String(i).padStart(3, '0')}`;
    docs.set(path, { entityName: 'speaker', key: `k${i}`, value: `v${i}`, confidence: 0.8 });
  }
  const updates: Array<{ path: string; fields: Record<string, unknown> }> = [];
  const source: FactSource = {
    async page(after, size) {
      const paths = [...docs.keys()].sort().filter((p) => after === undefined || p > after);
      return paths.slice(0, size).map((path) => ({ path, data: { ...docs.get(path) } }));
    },
    async update(path, fields) {
      const doc = docs.get(path);
      if (!doc) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
      updates.push({ path, fields });
      docs.set(path, { ...doc, ...fields });
    },
  };
  return { docs, updates, source };
}

function harness(n: number, opts: Partial<BackfillOptions> = {}) {
  const store = fakeStore(n);
  let saved: string | undefined;
  let clock = 0;
  const sleeps: number[] = [];
  const embed = vi.fn(async (texts: string[]) => texts.map(() => new Array(768).fill(0.01)));
  const cursor = { read: vi.fn(() => saved), write: vi.fn((a: string) => void (saved = a)) };
  const deps: BackfillDeps = {
    source: store.source,
    embed,
    model: MODEL,
    cursor,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
  const options: BackfillOptions = {
    database: 'ferni-dev',
    dryRun: false,
    rate: 5,
    batch: 2,
    ...opts,
  };
  return {
    ...store,
    embed,
    cursor,
    sleeps,
    deps,
    options,
    run: (o: Partial<BackfillOptions> = {}) => backfill({ ...options, ...o }, deps),
  };
}

describe('backfill-fact-embeddings', () => {
  it('dry run embeds nothing, writes nothing and leaves the cursor alone', async () => {
    const h = harness(5, { dryRun: true });
    const c = await h.run();
    expect(c).toMatchObject({ scanned: 5, toEmbed: 5, embedded: 0, requests: 0 });
    expect(c.chars).toBeGreaterThan(0);
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(0);
    expect(h.cursor.write).not.toHaveBeenCalled();
  });

  it('writes only the vector fields, as the live writer stores them', async () => {
    const h = harness(3);
    const before = new Map([...h.docs].map(([p, d]) => [p, { ...d }]));
    const c = await h.run();
    expect(c).toMatchObject({ embedded: 3, failed: 0, gone: 0 });
    expect(h.embed).toHaveBeenCalledWith(['they k0: v0', 'they k2: v2'], 'document');
    for (const { path, fields } of h.updates) {
      expect(Object.keys(fields).sort()).toEqual([...WRITTEN_FIELDS].sort());
      expect(fields).toMatchObject({ embeddingModel: MODEL, embeddingTask: 'RETRIEVAL_DOCUMENT' });
      expect(vectorOf(fields.embedding)).toHaveLength(768);
      const { embedding, embeddingModel, embeddingTask, embeddedAt, ...rest } = h.docs.get(path)!;
      void [embedding, embeddingModel, embeddingTask, embeddedAt];
      expect(rest).toEqual(before.get(path));
    }
  });

  it('is idempotent: a second full run embeds nothing', async () => {
    const h = harness(4);
    await h.run();
    h.cursor.read.mockReturnValue(undefined); // --restart
    h.embed.mockClear();
    const c = await h.run();
    expect(c).toMatchObject({ scanned: 4, alreadyEmbedded: 4, toEmbed: 0, embedded: 0 });
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(4);
  });

  it('re-embeds a vector from another model', async () => {
    const h = harness(1);
    const [path] = [...h.docs.keys()];
    h.docs.set(path, {
      ...h.docs.get(path),
      embedding: new Array(768).fill(1),
      embeddingModel: 'old',
      embeddingTask: 'RETRIEVAL_DOCUMENT',
    });
    expect(await h.run()).toMatchObject({ alreadyEmbedded: 0, embedded: 1 });
  });

  it('resumes after the cursor and embeds each fact once', async () => {
    const h = harness(7);
    const first = await h.run({ limit: 3 });
    expect(first).toMatchObject({ scanned: 3, embedded: 3 });
    expect(h.cursor.write).toHaveBeenLastCalledWith([...h.docs.keys()].sort()[2]);
    const second = await h.run();
    expect(second).toMatchObject({ scanned: 4, alreadyEmbedded: 0, embedded: 4 });
    const paths = h.updates.map((u) => u.path);
    expect(new Set(paths).size).toBe(7);
    expect(paths).toHaveLength(7);
  });

  it('never recreates a fact deleted mid-run', async () => {
    const h = harness(2);
    const page = h.source.page;
    h.source.page = async (after, size) => {
      const docs = await page(after, size);
      h.docs.delete(docs[0]?.path ?? '');
      return docs;
    };
    expect(await h.run()).toMatchObject({ embedded: 1, gone: 1 });
    expect(h.docs.size).toBe(1);
  });

  it('stops before writing when the embedder is not the index size', async () => {
    const h = harness(2);
    h.embed.mockImplementation(async (texts: string[]) => texts.map(() => new Array(1536).fill(0)));
    await expect(h.run()).rejects.toThrow(/768-d/);
    expect(h.updates).toHaveLength(0);
  });

  it('spaces embedding requests to --rate per second', async () => {
    const h = harness(4, { rate: 5, batch: 1 });
    expect(await h.run()).toMatchObject({ requests: 4 });
    expect(h.sleeps).toEqual([200, 200, 200]);
  });

  it('only touches the owners named by --owner', async () => {
    const h = harness(4);
    expect(await h.run({ owner: 'voice-eval-backfill-1' })).toMatchObject({ embedded: 2 });
    expect(h.updates.every((u) => u.path.includes('voice-eval-backfill-1/'))).toBe(true);
  });
});

describe('databaseRefusal', () => {
  it('refuses prod without --confirm-prod, or with FIRESTORE_DATABASE set', () => {
    expect(databaseRefusal('(default)', [], {})).toMatch(/confirm-prod/);
    expect(
      databaseRefusal('(default)', ['--confirm-prod'], { FIRESTORE_DATABASE: 'ferni-dev' })
    ).toMatch(/FIRESTORE_DATABASE/);
    expect(databaseRefusal('(default)', ['--confirm-prod'], {})).toBeUndefined();
  });

  it('needs a database, and lets ferni-dev through', () => {
    expect(databaseRefusal(undefined, [], {})).toMatch(/--database/);
    expect(databaseRefusal('ferni-dev', [], {})).toBeUndefined();
  });
});
