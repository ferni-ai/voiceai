/**
 * bq-erasure: hashes (never uids) are queued; due hashes are deleted per table with progress
 * saved at once, a poison hash is isolated within the run's budget, and a doc re-queued
 * mid-run is never overwritten.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logError }),
}));

import { bqHash } from '../bq-events.js';
import {
  BUDGET_STATEMENTS,
  ERASABLE_TABLES,
  HOLD_MS,
  OVERDUE_MS,
  backoffMs,
  queueBqErasure,
  runBqErasure,
  type RunDml,
} from '../bq-erasure.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const NOW = new Date('2026-10-18T12:00:00Z');
type Doc = Record<string, unknown>;

/** One Firestore collection: transactions, and where('<=').orderBy().limit() (missing fields never match). */
function fakeDb() {
  const docs = new Map<string, Doc>();
  const ref = (id: string) => ({ id });
  const tx = {
    get: async (r: { id: string }) => ({ exists: docs.has(r.id), data: () => docs.get(r.id) }),
    set: (r: { id: string }, d: Doc) => void docs.set(r.id, { ...d }),
    update: (r: { id: string }, d: Doc) => void docs.set(r.id, { ...docs.get(r.id), ...d }),
    delete: (r: { id: string }) => void docs.delete(r.id),
  };
  const db = {
    runTransaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    collection: () => ({
      doc: ref,
      where: (field: string, _op: string, cutoff: string) => ({
        orderBy: () => ({
          limit: (n: number) => ({
            get: async () => ({
              docs: [...docs]
                .filter(([, d]) => typeof d[field] === 'string' && String(d[field]) <= cutoff)
                .sort(([, a], [, b]) => String(a[field]).localeCompare(String(b[field])))
                .slice(0, n)
                .map(([id, d]) => ({ id, data: () => d })),
            }),
          }),
        }),
      }),
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, docs };
}

const h = (uid: string): string => bqHash('user', uid, ENV) ?? '';
const tableOf = (sql: string): string => /ferni_events\.(\w+)/.exec(sql)?.[1] ?? '';
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const queueDue = (db: FirebaseFirestore.Firestore, uids: string[]) =>
  queueBqErasure(db, uids, ENV, ago(HOLD_MS + 1));
const ok: RunDml = async () => undefined;

beforeEach(() => logError.mockClear());

describe('queueBqErasure', () => {
  it('writes the full shape for each hash, never the ids, and a re-erase resets it', async () => {
    const { db, docs } = fakeDb();
    expect(await queueBqErasure(db, ['uid-1', 'phone:+15551234567', 'uid-1'], ENV, NOW)).toBe(2);
    expect(docs.get(h('uid-1'))).toEqual({
      queuedAt: NOW.toISOString(),
      nextAttemptAt: new Date(NOW.getTime() + HOLD_MS).toISOString(),
      attempts: 0,
      doneTables: [],
    });
    expect(JSON.stringify([...docs])).not.toMatch(/uid-1|5551234567/);
    docs.set(h('uid-1'), { ...docs.get(h('uid-1')), attempts: 3, doneTables: ['call_events'] });
    await queueBqErasure(db, ['uid-1'], ENV, NOW);
    expect(docs.get(h('uid-1'))).toMatchObject({ attempts: 0, doneTables: [] });
  });

  it('queues nothing without LOG_HASH_SECRET (no row carries a hash then)', async () => {
    const { db, docs } = fakeDb();
    expect(await queueBqErasure(db, ['uid-1'], {}, NOW)).toBe(0);
    expect(docs.size).toBe(0);
  });
});

describe('runBqErasure', () => {
  it('waits out the streaming buffer, then one DELETE per table and the doc goes', async () => {
    const { db, docs } = fakeDb();
    await queueDue(db, ['uid-old']);
    await queueBqErasure(db, ['uid-new'], ENV, ago(60_000));
    const run = vi.fn(ok);
    expect(await runBqErasure(db, { run, now: NOW })).toMatchObject({ due: 1, erased: 1 });
    expect(run).toHaveBeenCalledTimes(ERASABLE_TABLES.length);
    expect(run.mock.calls[0]?.slice(0, 2)).toEqual([
      'DELETE FROM `johnb-2025.ferni_events.call_events` WHERE user_hash IN UNNEST(@hashes)',
      [h('uid-old')],
    ]);
    expect(ERASABLE_TABLES).not.toContain('eval_results');
    expect([...docs.keys()]).toEqual([h('uid-new')]);
  });

  it('a legacy doc without nextAttemptAt is processed (due at queuedAt + HOLD_MS)', async () => {
    const { db, docs } = fakeDb();
    docs.set(h('uid-legacy'), {
      userHash: h('uid-legacy'),
      queuedAt: ago(HOLD_MS + 1).toISOString(),
    });
    expect(await runBqErasure(db, { run: ok, now: NOW })).toMatchObject({ due: 1, erased: 1 });
    expect(docs.size).toBe(0);
  });

  it('saves each table as done right after its DELETE, and never re-runs a done table', async () => {
    const { db, docs } = fakeDb();
    await queueDue(db, ['uid-a']);
    const seen: unknown[] = [];
    const run = vi.fn(async (sql: string) => {
      seen.push(docs.get(h('uid-a'))?.doneTables);
      if (tableOf(sql) === 'outreach_events') throw new Error('x');
    });
    await runBqErasure(db, { run, now: NOW });
    expect(seen.slice(0, 2)).toEqual([[], ['call_events']]);
    expect(docs.get(h('uid-a'))).toMatchObject({
      doneTables: ERASABLE_TABLES.filter((t) => t !== 'outreach_events'),
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + backoffMs(1)).toISOString(),
    });
    const rerun = vi.fn(ok);
    await runBqErasure(db, { run: rerun, now: new Date(NOW.getTime() + backoffMs(1)) });
    expect(rerun.mock.calls.map(([sql]) => tableOf(sql))).toEqual(['outreach_events']);
    expect(docs.size).toBe(0);
  });

  it('a re-queue during the run is not clobbered by its progress, backoff or delete', async () => {
    const { db, docs } = fakeDb();
    await queueDue(db, ['uid-a']);
    const run = vi.fn(async () => {
      if (run.mock.calls.length === 1) await queueBqErasure(db, ['uid-a'], ENV, NOW);
    });
    await runBqErasure(db, { run, now: NOW });
    expect(docs.get(h('uid-a'))).toEqual({
      queuedAt: NOW.toISOString(),
      nextAttemptAt: new Date(NOW.getTime() + HOLD_MS).toISOString(),
      attempts: 0,
      doneTables: [],
    });
  });

  it('isolates a poison hash by bisection within the statement budget', async () => {
    const { db, docs } = fakeDb();
    const uids = ['p', 'b', 'c', 'd', 'e', 'f', 'g', 'i'].map((x) => `uid-${x}`);
    await queueDue(db, uids);
    const run = vi.fn(async (_sql: string, hashes: readonly string[]) => {
      if (hashes.includes(h('uid-p'))) throw new Error('bad');
    });
    await runBqErasure(db, { run, now: NOW });
    expect(run.mock.calls.length).toBeLessThanOrEqual(BUDGET_STATEMENTS);
    await runBqErasure(db, { run, now: new Date(NOW.getTime() + backoffMs(1)) });
    expect([...docs.keys()]).toEqual([h('uid-p')]);
  });

  it('stops at the statement budget, and at the time budget, and backs off the rest', async () => {
    const { db, docs } = fakeDb();
    await queueDue(
      db,
      Array.from({ length: 64 }, (_, i) => `uid-${i}`)
    );
    const down = vi.fn(async () => Promise.reject(new Error('table down')));
    expect(await runBqErasure(db, { run: down, now: NOW })).toMatchObject({
      erased: 0,
      retrying: 64,
    });
    expect(down).toHaveBeenCalledTimes(BUDGET_STATEMENTS);
    expect([...docs.values()].every((d) => d.attempts === 1)).toBe(true);

    const slow = fakeDb();
    await queueDue(slow.db, ['uid-x']);
    let t = 0;
    const timed = vi.fn(async () => void (t += 30_000));
    await runBqErasure(slow.db, { run: timed, now: NOW, clock: () => t });
    expect(timed).toHaveBeenCalledTimes(2);
  });

  it('logs BQ_ERASURE_OVERDUE at error level for a hash queued more than 7 days, never the hash', async () => {
    const { db } = fakeDb();
    await queueBqErasure(db, ['uid-stuck'], ENV, ago(OVERDUE_MS + 1));
    await queueBqErasure(db, ['uid-recent'], ENV, ago(OVERDUE_MS - 60_000));
    const fail = async () => Promise.reject(new Error('x'));
    expect((await runBqErasure(db, { run: fail, now: NOW })).overdue).toBe(1);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ overdue: 1 }),
      'BQ_ERASURE_OVERDUE'
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(h('uid-stuck'));
  });

  it('nothing due runs nothing and raises no alert', async () => {
    const { db } = fakeDb();
    const run = vi.fn(ok);
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
