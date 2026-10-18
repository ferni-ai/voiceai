/**
 * bq-erasure: an erased account's hash is queued (never its uid), and after the streaming
 * buffer has had time to drain its rows are deleted from every table that has user_hash.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logError }),
}));

import { bqHash } from '../bq-events.js';
import {
  ERASABLE_TABLES,
  HOLD_MS,
  OVERDUE_MS,
  backoffMs,
  queueBqErasure,
  runBqErasure,
} from '../bq-erasure.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const NOW = new Date('2026-10-18T12:00:00Z');

/** Just enough Firestore for one collection: set (merge), delete, where('<=').orderBy().limit().get(). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const query = (field: string, cutoff: string) => ({
    orderBy: () => ({
      limit: (n: number) => ({
        get: async () => ({
          docs: [...docs]
            .filter(([, d]) => String(d[field]) <= cutoff)
            .sort(([, a], [, b]) => String(a[field]).localeCompare(String(b[field])))
            .slice(0, n)
            .map(([id, d]) => ({ id, data: () => d })),
        }),
      }),
    }),
  });
  const db = {
    collection: () => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>, o?: { merge?: boolean }) =>
          void docs.set(id, o?.merge ? { ...docs.get(id), ...data } : data),
        delete: async () => void docs.delete(id),
      }),
      where: (field: string, _op: string, cutoff: string) => query(field, cutoff),
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, docs };
}

const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const due = (db: FirebaseFirestore.Firestore, uid: string, extraMs = 0) =>
  queueBqErasure(db, [uid], ENV, ago(HOLD_MS + 1 + extraMs));
const h = (uid: string): string => bqHash('user', uid, ENV) ?? '';
const tableOf = (sql: string): string => /ferni_events\.(\w+)/.exec(sql)?.[1] ?? '';

describe('queueBqErasure', () => {
  it('queues the hashes of the account and its linked profiles, never the ids', async () => {
    const { db, docs } = fakeDb();
    const n = await queueBqErasure(db, ['uid-1', 'phone:+15551234567', 'uid-1'], ENV, NOW);
    expect(n).toBe(2);
    expect([...docs.keys()].sort()).toEqual(
      [bqHash('user', 'uid-1', ENV), bqHash('user', 'phone:+15551234567', ENV)].sort()
    );
    expect(JSON.stringify([...docs])).not.toMatch(/uid-1|5551234567/);
  });

  it('queues nothing without LOG_HASH_SECRET (no row carries a hash then)', async () => {
    const { db, docs } = fakeDb();
    expect(await queueBqErasure(db, ['uid-1'], {}, NOW)).toBe(0);
    expect(docs.size).toBe(0);
  });
});

describe('runBqErasure', () => {
  beforeEach(() => logError.mockClear());

  it('waits out the streaming buffer, then deletes from every user_hash table and dequeues', async () => {
    const { db, docs } = fakeDb();
    await due(db, 'uid-old');
    await queueBqErasure(db, ['uid-new'], ENV, ago(60_000));
    const run = vi.fn(async () => undefined);

    const result = await runBqErasure(db, { run, now: NOW });

    expect(result).toMatchObject({ due: 1, erased: 1, retrying: 0, failedTables: [] });
    expect(ERASABLE_TABLES).toEqual(
      expect.arrayContaining([
        'call_events',
        'outreach_events',
        'turn_metrics',
        'followthrough_outcomes',
      ])
    );
    expect(ERASABLE_TABLES).not.toContain('eval_results');
    expect(run).toHaveBeenCalledTimes(ERASABLE_TABLES.length);
    expect(run).toHaveBeenCalledWith(
      'DELETE FROM `johnb-2025.ferni_events.call_events` WHERE user_hash IN UNNEST(@hashes)',
      [h('uid-old')]
    );
    expect([...docs.keys()]).toEqual([h('uid-new')]);
  });

  it('one failing table does not block the other tables, and records progress per hash', async () => {
    const { db, docs } = fakeDb();
    await due(db, 'uid-a');
    const run = vi.fn(async (sql: string) => {
      if (tableOf(sql) === 'outreach_events') throw new Error('streaming buffer');
    });

    const result = await runBqErasure(db, { run, now: NOW });

    expect(result).toMatchObject({
      due: 1,
      erased: 0,
      retrying: 1,
      failedTables: ['outreach_events'],
    });
    const doc = docs.get(h('uid-a'));
    expect(doc?.doneTables).toEqual(ERASABLE_TABLES.filter((t) => t !== 'outreach_events'));
    expect(doc?.attempts).toBe(1);
    expect(doc?.nextAttemptAt).toBe(new Date(NOW.getTime() + backoffMs(1)).toISOString());
  });

  it('a table already done for a hash is not run again; the hash goes once the rest is done', async () => {
    const { db, docs } = fakeDb();
    await due(db, 'uid-a');
    await runBqErasure(db, {
      run: async (sql) => {
        if (tableOf(sql) === 'outreach_events') throw new Error('x');
      },
      now: NOW,
    });
    const run = vi.fn(async (_sql: string, _hashes: readonly string[]) => undefined);
    const later = new Date(NOW.getTime() + backoffMs(1));

    expect(await runBqErasure(db, { run, now: later })).toMatchObject({ erased: 1, retrying: 0 });
    expect(run.mock.calls.map(([sql]) => tableOf(sql))).toEqual(['outreach_events']);
    expect(docs.size).toBe(0);
  });

  it('one poison hash fails alone: the others in its batch are cleared', async () => {
    const { db, docs } = fakeDb();
    await due(db, 'uid-poison', 2);
    await due(db, 'uid-b', 1);
    await due(db, 'uid-c');
    const run = vi.fn(async (_sql: string, hashes: readonly string[]) => {
      if (hashes.includes(h('uid-poison'))) throw new Error('bad');
    });

    const result = await runBqErasure(db, { run, now: NOW });

    expect(result).toMatchObject({ due: 3, erased: 2, retrying: 1 });
    expect([...docs.keys()]).toEqual([h('uid-poison')]);
  });

  it('a failed hash moves behind newer ones (nextAttemptAt order, not queuedAt)', async () => {
    const { db } = fakeDb();
    await due(db, 'uid-old', 10 * HOLD_MS);
    await runBqErasure(db, { run: async () => Promise.reject(new Error('x')), now: NOW });
    const later = new Date(NOW.getTime() + backoffMs(1) + HOLD_MS + 1);
    await queueBqErasure(db, ['uid-new'], ENV, new Date(NOW.getTime() + 1));
    const order: string[][] = [];
    await runBqErasure(db, {
      run: async (_sql, hashes) => void order.push([...hashes]),
      now: later,
    });
    expect(order[0]).toEqual([h('uid-new'), h('uid-old')]);
  });

  it('logs BQ_ERASURE_OVERDUE at error level for a hash queued more than 7 days', async () => {
    const { db } = fakeDb();
    await queueBqErasure(db, ['uid-stuck'], ENV, ago(OVERDUE_MS + 1));
    await queueBqErasure(db, ['uid-recent'], ENV, ago(OVERDUE_MS - 60_000));
    const result = await runBqErasure(db, {
      run: async () => Promise.reject(new Error('x')),
      now: NOW,
    });
    expect(result.overdue).toBe(1);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ overdue: 1 }),
      'BQ_ERASURE_OVERDUE'
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(h('uid-stuck'));
  });

  it('a hash erased in time raises no alert, and nothing due runs nothing', async () => {
    const { db } = fakeDb();
    const run = vi.fn();
    expect(await runBqErasure(db, { run, now: NOW })).toEqual({
      due: 0,
      erased: 0,
      retrying: 0,
      failedTables: [],
      overdue: 0,
    });
    expect(run).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});
