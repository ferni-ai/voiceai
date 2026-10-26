/**
 * "Take your story" carries the router's turn events, which are kept one partition per day
 * (semantic_router_events/{YYYY-MM-DD}/events, day documents never written): every day
 * holding the person's events is read, under one label, and no one else's.
 */
import { describe, expect, it, vi } from 'vitest';
import { countUserRecords, exportUserRecords } from '../user-records-export.js';

// The shared setup fakes firestore; the value cleaner checks its real Timestamp class
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
// No proven phone profiles: the linked lookup (erasure-keys.ts) has its own tests
vi.mock('../erasure-keys.js', () => ({ gatherErasureKeys: async () => ({ linkedUserIds: [] }) }));

type Data = Record<string, unknown>;

/** Documents by full path; collections filter by ==, count, and list their (phantom) docs */
function storedDb(docs: Record<string, Data>): FirebaseFirestore.Firestore {
  const snap = (path: string) => ({
    id: path.split('/').pop() ?? '',
    exists: path in docs,
    data: () => (path in docs ? structuredClone(docs[path]) : undefined),
  });
  const depth = (path: string) => path.split('/').length;
  const query = (path: string, filters: Array<(d: Data) => boolean> = []): unknown => {
    const matching = () =>
      Object.keys(docs)
        .filter((p) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1)
        .filter((p) => filters.every((f) => f(docs[p] ?? {})))
        .sort();
    return {
      where: (field: string, _op: '==', value: unknown) =>
        query(path, [...filters, (d) => d[field] === value]),
      orderBy: () => query(path, filters),
      startAfter: () => query(path, [() => false]),
      limit: () => query(path, filters),
      get: async () => ({ docs: matching().map(snap) }),
      count: () => ({ get: async () => ({ data: () => ({ count: matching().length }) }) }),
      listDocuments: async () =>
        [
          ...new Set(
            Object.keys(docs)
              .filter((p) => p.startsWith(`${path}/`))
              .map((p) => p.split('/')[depth(path)])
          ),
        ].map((id) => ({ id })),
    };
  };
  return { doc: (path: string) => ({ get: async () => snap(path) }), collection: query } as never;
}

const LABEL = 'semantic_router_events/*/events';
const db = () =>
  storedDb({
    'semantic_router_events/2026-03-01/events/e1': { userId: 'u-1', toolId: 'weather' },
    'semantic_router_events/2026-03-01/events/e2': { userId: 'u-2', toolId: 'music' },
    'semantic_router_events/2026-10-24/events/e3': { userId: 'u-1', toolId: 'timer' },
    'semantic_router_events/2026-10-23/events/e4': { userId: 'u-2', toolId: 'music' },
  });

describe("the export carries the router's turn events", () => {
  it("reads every day holding the person's events, under one label, and no one else's", async () => {
    const out = await exportUserRecords('u-1', undefined, db());
    expect(out[LABEL]).toEqual([
      { id: 'e1', userId: 'u-1', toolId: 'weather' },
      { id: 'e3', userId: 'u-1', toolId: 'timer' },
    ]);
    expect(JSON.stringify(out)).not.toContain('music');
  });

  it('counts them for the category list', async () => {
    expect(await countUserRecords('u-1', undefined, db())).toBe(2);
    expect(await countUserRecords('u-3', undefined, db())).toBe(0);
  });
});
