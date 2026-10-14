import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import type { FollowUp, NewFollowUp } from '../../follow-through/index.js';
import { createFollowUpStore, followUpId, toFollowUp } from '../follow-through-store.js';

// A Firestore fake with only the calls the store makes: documents by path,
// where (in, >=, <, <=), orderBy, limit, collectionGroup and transactions.
type Cond = [string, string, unknown];
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const snapOf = (path: string) => ({
    id: path.split('/').pop() ?? '',
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => coll(`${path}/${name}`),
    get: async () => snapOf(path),
  });
  const matches = (data: Record<string, unknown>, [f, op, v]: Cond): boolean => {
    const x = data[f];
    if (op === 'in') return (v as unknown[]).includes(x);
    if (typeof x !== 'string') return false;
    if (op === '>=') return x >= String(v);
    if (op === '<') return x < String(v);
    if (op === '<=') return x <= String(v);
    throw new Error(`op ${op} not faked`);
  };
  const query = (
    pick: (path: string) => boolean,
    conds: Cond[] = [],
    order?: string,
    max?: number
  ): Record<string, unknown> => ({
    where: (f: string, op: string, v: unknown) => query(pick, [...conds, [f, op, v]], order, max),
    orderBy: (f: string) => query(pick, conds, f, max),
    limit: (n: number) => query(pick, conds, order, n),
    get: async () => {
      let hits = [...docs.entries()].filter(
        ([p, d]) => pick(p) && conds.every((c) => matches(d, c))
      );
      if (order) hits = hits.sort((a, b) => String(a[1][order]).localeCompare(String(b[1][order])));
      if (max !== undefined) hits = hits.slice(0, max);
      return { docs: hits.map(([p]) => snapOf(p)) };
    },
  });
  const coll = (path: string): Record<string, unknown> => ({
    ...query((p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1),
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  const db = {
    collection: (name: string) => coll(name),
    collectionGroup: (name: string) => query((p) => p.split('/').slice(-2, -1)[0] === name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (ref: { path: string }) => snapOf(ref.path),
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          void docs.set(ref.path, { ...data }),
      }),
  };
  return { db: db as unknown as Firestore, docs };
}

const NOW = new Date('2026-10-12T15:00:00.000Z');
const newFollowUp = (over: Partial<NewFollowUp> = {}): NewFollowUp => ({
  userId: 'u1',
  kind: 'reminder',
  text: 'call mom',
  dueAt: '2026-10-13T16:00:00.000Z',
  zone: 'America/New_York',
  repeat: null,
  source: { store: 'reminders', ref: 'r1' },
  ...over,
});

describe('follow-through store', () => {
  it('opens a follow-up as open, with no surfacings, at bogle_users/{uid}/follow_through', async () => {
    const { db, docs } = fakeFirestore();
    const f = await createFollowUpStore(db).open(newFollowUp(), NOW);
    expect(f).toMatchObject({
      status: 'open',
      surfaced: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect([...docs.keys()]).toEqual([`bogle_users/u1/follow_through/${followUpId(f.source)}`]);
  });

  it('opening the same source twice returns the first one instead of making a second', async () => {
    const { db, docs } = fakeFirestore();
    const store = createFollowUpStore(db);
    const first = await store.open(newFollowUp(), NOW);
    const again = await store.open(
      newFollowUp({ text: 'call mom (again)' }),
      new Date('2026-10-12T16:00:00Z')
    );
    expect(docs.size).toBe(1);
    expect(again.text).toBe('call mom');
    expect(again.createdAt).toBe(first.createdAt);
  });

  it('save writes only when nobody changed it since it was read', async () => {
    const { db } = fakeFirestore();
    const store = createFollowUpStore(db);
    const f = await store.open(newFollowUp(), NOW);
    const surfaced: FollowUp = {
      ...f,
      status: 'surfaced',
      updatedAt: '2026-10-13T16:01:00.000Z',
      surfaced: [{ at: '2026-10-13T16:01:00.000Z', via: 'text' }],
    };
    expect(await store.save(surfaced, f.updatedAt)).toBe(true);
    // a second writer still holding the old copy loses
    const stale: FollowUp = { ...f, status: 'released', updatedAt: '2026-10-13T16:02:00.000Z' };
    expect(await store.save(stale, f.updatedAt)).toBe(false);
    expect((await store.live('u1'))[0].status).toBe('surfaced');
  });

  it('live returns only open and surfaced follow-ups for that person', async () => {
    const { db } = fakeFirestore();
    const store = createFollowUpStore(db);
    const a = await store.open(newFollowUp({ source: { store: 'reminders', ref: 'a' } }), NOW);
    await store.open(newFollowUp({ source: { store: 'reminders', ref: 'b' } }), NOW);
    await store.open(newFollowUp({ userId: 'u2', source: { store: 'reminders', ref: 'c' } }), NOW);
    await store.save(
      { ...a, status: 'done', closedAt: NOW.toISOString(), updatedAt: '2026-10-12T15:30:00.000Z' },
      a.updatedAt
    );
    expect((await store.live('u1')).map((f) => f.source.ref)).toEqual(['b']);
  });

  it('due finds live follow-ups across everyone whose time has come, soonest first, up to the limit', async () => {
    const { db } = fakeFirestore();
    const store = createFollowUpStore(db);
    await store.open(
      newFollowUp({
        userId: 'u1',
        dueAt: '2026-10-13T16:00:00.000Z',
        source: { store: 'r', ref: '1' },
      }),
      NOW
    );
    await store.open(
      newFollowUp({
        userId: 'u2',
        dueAt: '2026-10-13T12:00:00.000Z',
        source: { store: 'r', ref: '2' },
      }),
      NOW
    );
    await store.open(
      newFollowUp({
        userId: 'u3',
        dueAt: '2026-10-20T12:00:00.000Z',
        source: { store: 'r', ref: '3' },
      }),
      NOW
    );
    await store.open(
      newFollowUp({ userId: 'u4', dueAt: null, source: { store: 'r', ref: '4' } }),
      NOW
    );
    const due = await store.due(new Date('2026-10-14T00:00:00.000Z'), 10);
    expect(due.map((f) => f.userId)).toEqual(['u2', 'u1']);
    expect((await store.due(new Date('2026-10-14T00:00:00.000Z'), 1)).map((f) => f.userId)).toEqual(
      ['u2']
    );
  });

  it('changedBetween returns what changed in the window, for "what Ferni did" and the weekly look back', async () => {
    const { db } = fakeFirestore();
    const store = createFollowUpStore(db);
    const f = await store.open(newFollowUp(), NOW);
    await store.save(
      {
        ...f,
        status: 'done',
        closedAt: '2026-10-14T10:00:00.000Z',
        updatedAt: '2026-10-14T10:00:00.000Z',
      },
      f.updatedAt
    );
    expect(
      await store.changedBetween(
        'u1',
        new Date('2026-10-14T00:00:00Z'),
        new Date('2026-10-15T00:00:00Z')
      )
    ).toHaveLength(1);
    expect(
      await store.changedBetween(
        'u1',
        new Date('2026-10-15T00:00:00Z'),
        new Date('2026-10-16T00:00:00Z')
      )
    ).toHaveLength(0);
  });
});

describe('toFollowUp', () => {
  it('drops a document that is not a follow-up rather than handing half a record to the rules', () => {
    expect(toFollowUp('x', { userId: 'u1', kind: 'mystery', text: 't' })).toBeNull();
    expect(toFollowUp('x', null)).toBeNull();
  });

  it('keeps a valid repeat and drops a malformed one', () => {
    const base = {
      userId: 'u1',
      kind: 'dose',
      text: 'pills',
      zone: 'UTC',
      status: 'open',
      createdAt: 'a',
      updatedAt: 'a',
      source: { store: 's', ref: 'r' },
    };
    expect(toFollowUp('x', { ...base, repeat: { every: 'day', at: '08:00' } })?.repeat).toEqual({
      every: 'day',
      at: '08:00',
    });
    expect(toFollowUp('x', { ...base, repeat: { every: 'hourly', at: '8' } })?.repeat).toBeNull();
  });
});
