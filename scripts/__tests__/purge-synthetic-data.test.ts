import { beforeEach, describe, expect, it, vi } from 'vitest';
import { main, planPurge, type PurgeDb } from '../migrations/purge-synthetic-data.js';

/** A path-keyed fake Firestore: just what the purge calls. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(seed));
  const groupPages: string[] = [];
  const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
  const get = (data: Record<string, unknown>, field: string): unknown =>
    field
      .split('.')
      .reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], data);

  const ref = (path: string) => ({
    id: path.split('/').at(-1) as string,
    path,
    async listCollections() {
      const subs = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(`${path}/`))
          subs.add(key.slice(path.length + 1).split('/')[0] as string);
      }
      return [...subs].map((id) => ({
        id,
        count: () => ({
          get: async () => ({
            data: () => ({
              count: [...store.keys()].filter((k) => parentOf(k) === `${path}/${id}`).length,
            }),
          }),
        }),
      }));
    },
  });

  const db: PurgeDb = {
    collection: (path) => ({
      async listDocuments() {
        const ids = new Set<string>();
        for (const key of store.keys()) {
          if (key.startsWith(`${path}/`))
            ids.add(key.slice(path.length + 1).split('/')[0] as string);
        }
        return [...ids].map((id) => ref(`${path}/${id}`));
      },
    }),
    collectionGroup: (name) => {
      const query = (
        limit: number,
        after?: string
      ): ReturnType<ReturnType<PurgeDb['collectionGroup']>['select']> => ({
        limit: (n) => query(n, after),
        startAfter: (d) => query(limit, d.ref.path),
        get: async () => {
          groupPages.push(name);
          return {
            docs: [...store.entries()]
              .filter(([key]) => parentOf(key).split('/').at(-1) === name)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .filter(([key]) => after === undefined || key > after)
              .slice(0, limit)
              .map(([key, data]) => ({
                id: ref(key).id,
                ref: ref(key),
                get: (f: string) => get(data, f),
              })),
          };
        },
      });
      return { select: () => query(Infinity) };
    },
    async recursiveDelete(r) {
      for (const key of [...store.keys()]) {
        if (key === r.path || key.startsWith(`${r.path}/`)) store.delete(key);
      }
    },
    batch() {
      const refs: string[] = [];
      return {
        delete: (r) => refs.push(r.path),
        commit: async () => refs.forEach((p) => store.delete(p)),
      };
    },
  };
  return { db, store, groupPages };
}

const REAL = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
const KEPT = {
  [`bogle_users/${REAL}`]: {},
  [`bogle_users/${REAL}/memories/m1`]: {},
  'bogle_users/anon:1/memories/m1': {},
  [`users/${REAL}/calendar_events/c1`]: {},
  'vectors/v2': { metadata: { userId: REAL } },
  'vectors/v3': { metadata: { userId: 'anon:1' } },
  'concierge_requests/r2': { userId: REAL },
  'phone_mappings/+14155550100': { phone: '+14155550100', userId: REAL },
  'trust/t2': { userId: 'anon:2' },
};
const PURGED = {
  'bogle_users/voice-eval-story-20261018120000-abcd': {},
  'bogle_users/voice-eval-story-20261018120000-abcd/memories/m1': {},
  'bogle_users/voice-eval-story-20261018120000-abcd/memories/m2': {},
  'bogle_users/test-user-123/alarms/a1': { userId: 'test-user-123' }, // counted once, with its record
  'bogle_users/test-user-123/future_self_letters/l1': {},
  'users/e2e-1/calendar_events/c1': {},
  'users/flow-test-1/shared_memories/s1': {},
  'entity_store/ctx-e2e-1/entities/e1': {},
  'engagement_profiles/device:cli-1': {},
  'vectors/v1': { metadata: { userId: 'test-user-1' } },
  'concierge_requests/r1': { userId: 'test-user-123' },
  'phone_mappings/+15551234567': { phone: '+15551234567', userId: REAL },
  'phone_mappings/+14155550101': { phone: '+14155550101', userId: 'e2e-9' },
  'trust/t1': { userId: 'e2e-2' },
  'team_insights/i1': { userId: 'voice-eval-x' },
};

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.exitCode = undefined;
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('purge-synthetic-data', () => {
  it('reads collection groups a page at a time', async () => {
    const vectors = Object.fromEntries(
      Array.from({ length: 2500 }, (_, i) => [
        `vectors/v${String(i).padStart(4, '0')}`,
        { metadata: { userId: i % 2 ? REAL : 'test-user-1' } },
      ])
    );
    const { db, groupPages } = fakeDb(vectors);
    const plan = await planPurge(db);
    expect(plan.counts.vectors).toBe(1250);
    expect(groupPages.filter((g) => g === 'vectors')).toHaveLength(3);
  });

  it('counts harness documents per collection, and only those', async () => {
    const { db } = fakeDb({ ...KEPT, ...PURGED });
    const plan = await planPurge(db);
    expect(plan.counts).toEqual({
      bogle_users: 2,
      'bogle_users/{owner}/memories': 2,
      'bogle_users/{owner}/alarms': 1,
      'bogle_users/{owner}/future_self_letters': 1,
      users: 2,
      'users/{owner}/calendar_events': 1,
      'users/{owner}/shared_memories': 1,
      entity_store: 1,
      'entity_store/{owner}/entities': 1,
      engagement_profiles: 1,
      vectors: 1,
      concierge_requests: 1,
      trust: 1,
      team_insights: 1,
      phone_mappings: 2,
    });
  });

  it('is a dry run by default: prints counts, deletes nothing', async () => {
    const { db, store } = fakeDb({ ...KEPT, ...PURGED });
    await main(['node', 'purge'], db);
    expect(store.size).toBe(Object.keys({ ...KEPT, ...PURGED }).length);
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('DRY RUN');
    expect(out).toMatch(/bogle_users\/\{owner\}\/memories\s+2/);
    // then the owner ids (all harness ids), never a real or anon: id
    for (const id of [
      'voice-eval-story-20261018120000-abcd',
      'test-user-123',
      'e2e-9',
      '+15551234567',
    ])
      expect(out).toContain(id);
    expect(out).not.toContain(REAL);
    expect(out).not.toContain('anon:');
  });

  it('refuses --apply without the matching --confirm-project', async () => {
    const { db, store } = fakeDb({ ...KEPT, ...PURGED });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['node', 'purge', '--apply'], db);
    await main(['node', 'purge', '--apply', '--confirm-project=ferni-prod'], db);
    expect(store.size).toBe(Object.keys({ ...KEPT, ...PURGED }).length);
    expect(process.exitCode).toBe(1);
  });

  it('with --apply --confirm-project deletes every harness document and nothing else', async () => {
    const { db, store } = fakeDb({ ...KEPT, ...PURGED });
    await main(['node', 'purge', '--apply', '--confirm-project=johnb-2025'], db);
    expect([...store.keys()].sort()).toEqual(Object.keys(KEPT).sort());
  });
});
