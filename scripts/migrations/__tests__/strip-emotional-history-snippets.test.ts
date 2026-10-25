/**
 * The one-off emotional_history cleanup, against an in-memory store of synthetic
 * documents. A dry run writes nothing and prints counts only; --apply (with the
 * project confirmed) rewrites dataPoints to the kept fields in batches, leaves
 * clean documents and other fields alone, never overwrites a document that
 * changed after it was read, and a second run writes nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, strip, type HistoryDb } from '../strip-emotional-history-snippets.js';
import { leakedPieces, PARTIALS, SENTINEL as LONG } from '../../../src/tests/helpers/snippet-leak.js';

const SENTINEL = 'my sister Dolores has stage-three lupus';
const PARTIAL = SENTINEL.slice(3, 22);

const point = (emotion: string, extra: Record<string, unknown> = {}) => ({
  timestamp: '2026-09-01T10:00:00.000Z',
  emotion,
  intensity: 0.6,
  valence: -0.3,
  source: 'text',
  ...extra,
});

interface Stored {
  data: Record<string, unknown>;
  version: number;
}

/** Firestore's query/batch surface over a Map, with update-time preconditions. */
function fakeDb(docs: Map<string, Stored>) {
  const commits: number[] = [];
  /** Called after a page is read and before its batch commits. */
  let beforeCommit: () => void = () => undefined;
  const snapshot = (id: string) => ({
    id,
    ref: id,
    updateTime: docs.get(id)!.version,
    get: (field: string) => structuredClone(docs.get(id)!.data[field]),
  });
  const query = (after?: string, limit = Infinity) => ({
    orderBy: () => query(after, limit),
    select: () => query(after, limit),
    limit: (n: number) => query(after, n),
    startAfter: (doc: { ref: unknown }) => query(doc.ref as string, limit),
    get: async () => ({
      docs: [...docs.keys()]
        .sort()
        .filter((id) => after === undefined || id > after)
        .slice(0, limit)
        .map(snapshot),
    }),
  });
  const db: HistoryDb = {
    collection: (name: string) => {
      expect(name).toBe('emotional_history');
      return query();
    },
    batch: () => {
      const ops: Array<[string, { dataPoints: unknown[] }, number]> = [];
      return {
        update: (ref, data, pre) =>
          void ops.push([ref as string, data, pre.lastUpdateTime as number]),
        commit: async () => {
          beforeCommit();
          if (ops.some(([id, , v]) => docs.get(id)!.version !== v)) {
            throw Object.assign(new Error('FAILED_PRECONDITION'), { code: 9 });
          }
          for (const [id, data] of ops) {
            const d = docs.get(id)!;
            docs.set(id, { data: { ...d.data, ...data }, version: d.version + 1 });
          }
          commits.push(ops.length);
        },
      };
    },
  };
  return { db, commits, onCommit: (fn: () => void) => void (beforeCommit = fn) };
}

function seed(): Map<string, Stored> {
  const docs = new Map<string, Stored>();
  const put = (id: string, dataPoints: unknown[]) =>
    docs.set(id, { data: { userId: id, dataPoints, lastUpdated: 'x' }, version: 1 });
  put('u1', [point('anxious', { context: SENTINEL }), point('calm')]);
  put('u2', [point('sad', { context: PARTIAL })]);
  put('u3', [point('happy'), point('calm')]); // already clean
  put('u4', [point('lonely', { meta: { snippet: SENTINEL } }), point('sad', { text: PARTIAL })]);
  put('u5', [SENTINEL, point('tired')]);
  return docs;
}

let out: string[];
beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  process.exitCode = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('strip-emotional-history-snippets', () => {
  it('dry run (no flags) writes nothing and prints counts, never ids or content', async () => {
    const docs = seed();
    const before = structuredClone([...docs]);
    const { db, commits } = fakeDb(docs);
    await main(['node', 'script.ts'], db);

    expect(commits).toEqual([]);
    expect([...docs]).toEqual(before);
    const printed = out.join('\n');
    expect(printed).toContain('scanned 5 documents');
    expect(printed).toContain('DRY RUN: would strip 4 documents (5 data points)');
    for (const leak of ['Dolores', PARTIAL, 'u1', 'u2', 'u4', 'u5']) {
      expect(printed).not.toContain(leak);
    }
  });

  it('--apply without --confirm-project refuses and writes nothing', async () => {
    const docs = seed();
    const { db, commits } = fakeDb(docs);
    await main(['node', 'script.ts', '--apply'], db);
    expect(process.exitCode).toBe(1);
    expect(commits).toEqual([]);
  });

  it('--apply strips every caller-word field in batches and keeps labels and scores', async () => {
    const docs = seed();
    const { db, commits } = fakeDb(docs);
    const c = await strip(db, true, 2); // 2 per page: three pages

    expect(c).toEqual({
      scanned: 5,
      toChange: 4,
      pointsStripped: 5,
      written: 4,
      changedDuringRun: 0,
    });
    expect(commits).toEqual([2, 1, 1]); // u1+u2, u4 (u3 clean), u5
    expect(JSON.stringify([...docs])).not.toContain('Dolores');
    expect(JSON.stringify([...docs])).not.toContain(PARTIAL);
    expect(docs.get('u1')!.data).toEqual({
      userId: 'u1',
      dataPoints: [point('anxious'), point('calm')],
      lastUpdated: 'x',
    });
    expect(docs.get('u4')!.data.dataPoints).toEqual([point('lonely'), point('sad')]);
    expect(docs.get('u5')!.data.dataPoints).toEqual([point('tired')]);
    expect(docs.get('u3')!.version).toBe(1); // clean: not written

    const again = await strip(db, true, 2);
    expect(again).toMatchObject({ scanned: 5, toChange: 0, written: 0 });
  });

  it('leaves a batch whose document changed after it was read, and a re-run finishes it', async () => {
    const docs = seed();
    const { db, onCommit } = fakeDb(docs);
    let raced = false;
    onCommit(() => {
      if (raced) return;
      raced = true; // the live app saves u1 between the read and the write
      const d = docs.get('u1')!;
      docs.set('u1', { data: { ...d.data, dataPoints: [point('hopeful')] }, version: 2 });
    });

    const first = await strip(db, true, 2);
    expect(first).toMatchObject({ written: 2, changedDuringRun: 2 });
    expect(docs.get('u1')!.data.dataPoints).toEqual([point('hopeful')]); // not overwritten
    expect(JSON.stringify(docs.get('u2'))).toContain(PARTIAL); // same batch, left

    const second = await strip(db, true, 2);
    expect(second).toMatchObject({ toChange: 1, written: 1, changedDuringRun: 0 });
    expect(JSON.stringify([...docs])).not.toContain(PARTIAL);
  });
  it('drops points with a bad time or text under a kept key, and leaves no slice of it', async () => {
    const docs = new Map<string, Stored>();
    docs.set('v1', {
      data: {
        userId: 'v1',
        dataPoints: [
          point('anxious', { timestamp: 'yesterday-ish' }),
          point(PARTIALS[1]),
          point('sad', { intensity: PARTIALS[0] }),
          point('calm', { source: PARTIALS[2] }),
          { context: LONG },
          point('tired', { context: PARTIALS[0] }),
        ],
        lastUpdated: 'x',
      },
      version: 1,
    });
    expect(leakedPieces([...docs]).length).toBeGreaterThan(0); // precondition
    const { db } = fakeDb(docs);
    const c = await strip(db, true);
    expect(c).toMatchObject({ toChange: 1, pointsStripped: 6, written: 1 });
    expect(docs.get('v1')!.data.dataPoints).toEqual([point('tired')]);
    expect(leakedPieces([...docs])).toEqual([]);
  });
});
