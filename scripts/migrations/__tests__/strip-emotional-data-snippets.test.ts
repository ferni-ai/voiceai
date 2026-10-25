/**
 * The one-off emotional_data/{uid}/points cleanup, against an in-memory store of
 * synthetic points. A dry run writes nothing and prints counts only; --apply
 * (with the project confirmed) rewrites each point to its label, intensity and
 * times, deletes a point it can't keep, leaves clean points alone, and a second
 * run writes nothing. The emulator twin is strip-emotional-data-snippets.emulator.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, strip, type PointsDb } from '../strip-emotional-data-snippets.js';
import { leakedPieces, PARTIALS, SENTINEL } from '../../../src/tests/helpers/snippet-leak.js';

const T = '2026-09-01T10:00:00.000Z';
const clean = (emotion: string) => ({ timestamp: T, emotion, intensity: 0.6, createdAt: T });

/** emotional_data/{uid}/points over a Map keyed by path, with transactions. */
function fakeDb(docs: Map<string, Record<string, unknown>>) {
  const writes: string[] = [];
  const people = () => [...new Set([...docs.keys()].map((p) => p.split('/')[1]))].sort();
  const query = (uid: string, after?: string, n = Infinity) => ({
    orderBy: () => query(uid, after, n),
    startAfter: (d: { ref: unknown }) => query(uid, d.ref as string, n),
    limit: (k: number) => query(uid, after, k),
    get: async () => ({
      docs: [...docs.keys()]
        .filter((p) => p.startsWith(`emotional_data/${uid}/points/`))
        .sort()
        .filter((p) => after === undefined || p > after)
        .slice(0, n)
        .map((p) => ({ ref: p, data: () => structuredClone(docs.get(p)) })),
    }),
  });
  const db: PointsDb = {
    collection: (name) => {
      expect(name).toBe('emotional_data');
      return {
        listDocuments: async () => people().map((uid) => ({ collection: () => query(uid) })),
      };
    },
    runTransaction: async (fn) => {
      const ops: Array<() => void> = [];
      const out = await fn({
        get: async (ref) => ({
          exists: docs.has(ref as string),
          data: () => structuredClone(docs.get(ref as string)),
        }),
        set: (ref, data) => void ops.push(() => docs.set(ref as string, structuredClone(data))),
        delete: (ref) => void ops.push(() => docs.delete(ref as string)),
      });
      for (const op of ops) op();
      writes.push(`tx:${ops.length}`);
      return out;
    },
  };
  return { db, writes };
}

function seed() {
  const docs = new Map<string, Record<string, unknown>>();
  const put = (uid: string, id: string, data: Record<string, unknown>) =>
    docs.set(`emotional_data/${uid}/points/${id}`, data);
  put('u1', 'p1', { ...clean('anxious'), topics: ['work'], context: SENTINEL.slice(0, 100) });
  put('u1', 'p2', { ...clean('sad'), context: PARTIALS[1] });
  put('u1', 'p3', clean('calm')); // already clean
  put('u2', 'p1', { ...clean('lonely'), meta: { snippet: PARTIALS[0] } });
  put('u2', 'p2', { ...clean('tired'), timestamp: 'last week', context: PARTIALS[2] }); // bad time
  put('u2', 'p3', { ...clean('ok'), emotion: PARTIALS[0] }); // a sentence as the label
  put('u3', 'p1', clean('happy'));
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

describe('strip-emotional-data-snippets', () => {
  it('dry run (no flags) writes nothing and prints counts, never ids or content', async () => {
    const docs = seed();
    const before = structuredClone([...docs]);
    const { db, writes } = fakeDb(docs);
    await main(['node', 'script.ts'], db);

    expect(writes).toEqual([]);
    expect([...docs]).toEqual(before);
    const printed = out.join('\n');
    expect(printed).toContain('scanned 7 points for 3 people');
    expect(printed).toContain('DRY RUN: would rewrite 3 points and delete 2');
    expect(leakedPieces(printed)).toEqual([]);
    for (const id of ['u1', 'u2', 'u3', 'p1']) expect(printed).not.toContain(id);
  });

  it('--apply without --confirm-project refuses and writes nothing', async () => {
    const { db, writes } = fakeDb(seed());
    await main(['node', 'script.ts', '--apply'], db);
    expect(process.exitCode).toBe(1);
    expect(writes).toEqual([]);
  });

  it('--apply keeps labels and times, deletes what it cannot keep, and a re-run writes 0', async () => {
    const docs = seed();
    expect(leakedPieces([...docs]).length).toBeGreaterThan(0); // precondition
    const { db } = fakeDb(docs);
    const c = await strip(db, true, 2); // 2 per page: more than one page per person

    expect(c).toEqual({
      people: 3,
      scanned: 7,
      toRewrite: 3,
      toDelete: 2,
      rewritten: 3,
      deleted: 2,
    });
    expect(leakedPieces([...docs])).toEqual([]);
    expect(docs.get('emotional_data/u1/points/p1')).toEqual(clean('anxious'));
    expect(docs.get('emotional_data/u2/points/p1')).toEqual(clean('lonely'));
    expect(docs.has('emotional_data/u2/points/p2')).toBe(false);
    expect(docs.has('emotional_data/u2/points/p3')).toBe(false);
    expect(docs.get('emotional_data/u3/points/p1')).toEqual(clean('happy'));

    const again = await strip(db, true, 2);
    expect(again).toMatchObject({
      scanned: 5,
      toRewrite: 0,
      toDelete: 0,
      rewritten: 0,
      deleted: 0,
    });
  });
});
