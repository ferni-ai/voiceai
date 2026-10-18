/**
 * bq-erasure: an erased account's hash is queued (never its uid), and after the streaming
 * buffer has had time to drain its rows are deleted from every table that has user_hash.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { bqHash } from '../bq-events.js';
import { ERASABLE_TABLES, HOLD_MS, queueBqErasure, runBqErasure } from '../bq-erasure.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const NOW = new Date('2026-10-18T12:00:00Z');

/** Just enough Firestore for one collection: set, delete, where('queuedAt','<=').limit().get(). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const db = {
    collection: () => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => void docs.set(id, data),
        delete: async () => void docs.delete(id),
      }),
      where: (_f: string, _op: string, cutoff: string) => ({
        limit: () => ({
          get: async () => ({
            docs: [...docs]
              .filter(([, d]) => String(d.queuedAt) <= cutoff)
              .map(([id, d]) => ({ id, data: () => d })),
          }),
        }),
      }),
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, docs };
}

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
  it('waits out the streaming buffer, then deletes from every user_hash table and dequeues', async () => {
    const { db, docs } = fakeDb();
    await queueBqErasure(db, ['uid-old'], ENV, new Date(NOW.getTime() - HOLD_MS - 1));
    await queueBqErasure(db, ['uid-new'], ENV, new Date(NOW.getTime() - 60_000));
    const run = vi.fn(async () => undefined);

    const result = await runBqErasure(db, { run, now: NOW });

    const old = bqHash('user', 'uid-old', ENV);
    expect(result).toEqual({ due: 1, erased: 1, failedTables: [] });
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
      [old]
    );
    expect([...docs.keys()]).toEqual([bqHash('user', 'uid-new', ENV)]);
  });

  it('keeps every hash queued when any table fails, for the next run', async () => {
    const { db, docs } = fakeDb();
    await queueBqErasure(db, ['uid-old'], ENV, new Date(NOW.getTime() - HOLD_MS - 1));
    const run = vi.fn(async (sql: string) => {
      if (sql.includes('outreach_events')) throw new Error('streaming buffer');
    });

    const result = await runBqErasure(db, { run, now: NOW });

    expect(result).toEqual({ due: 1, erased: 0, failedTables: ['outreach_events'] });
    expect(docs.size).toBe(1);
  });

  it('does nothing when nothing is due', async () => {
    const { db } = fakeDb();
    const run = vi.fn();
    expect(await runBqErasure(db, { run, now: NOW })).toEqual({
      due: 0,
      erased: 0,
      failedTables: [],
    });
    expect(run).not.toHaveBeenCalled();
  });
});
