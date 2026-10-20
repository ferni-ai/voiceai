import { beforeEach, describe, expect, it, vi } from 'vitest';
import { main, purgePending, type QueueDb } from '../migrations/purge-intelligence-queue.js';

/** intelligence_queue as id → fields, with just the query surface the purge uses. */
function fakeDb(n: { pending: number; done: number }) {
  const docs = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < n.pending; i++)
    docs.set(`p${String(i).padStart(5, '0')}`, {
      status: 'pending',
      type: i % 2 ? 'key_moment' : 'tool_usage',
    });
  for (let i = 0; i < n.done; i++) docs.set(`d${i}`, { status: 'processed', type: 'key_moment' });
  const query = (
    status?: string,
    after?: string,
    limit = Infinity
  ): ReturnType<QueueDb['collection']> => ({
    where: (_f, _op, v) => query(v, after, limit),
    select: () => query(status, after, limit),
    limit: (k) => query(status, after, k),
    startAfter: (d) => query(status, d.ref as string, limit),
    get: async () => ({
      docs: [...docs.keys()]
        .sort()
        .filter((id) => docs.get(id)?.status === status && (after === undefined || id > after))
        .slice(0, limit)
        .map((id) => ({ ref: id, get: (f: string) => docs.get(id)?.[f] })),
    }),
  });
  const db: QueueDb = {
    collection: () => query(),
    batch: () => {
      const ids: string[] = [];
      return {
        delete: (ref) => ids.push(ref as string),
        commit: async () => ids.forEach((id) => docs.delete(id)),
      };
    },
  };
  return { db, docs };
}

beforeEach(() => {
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('purge-intelligence-queue', () => {
  it('dry run counts every pending doc by type across pages and deletes nothing', async () => {
    const { db, docs } = fakeDb({ pending: 901, done: 5 });
    expect(await purgePending(db, false)).toEqual({ key_moment: 450, tool_usage: 451 });
    expect(docs.size).toBe(906);
  });

  it('refuses --execute without the matching --confirm-project', async () => {
    const { db, docs } = fakeDb({ pending: 3, done: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['node', 'purge', '--execute'], db);
    expect(docs.size).toBe(4);
    expect(process.exitCode).toBe(1);
  });

  it('with --execute --confirm-project deletes the pending docs only', async () => {
    const { db, docs } = fakeDb({ pending: 901, done: 5 });
    await main(['node', 'purge', '--execute', '--confirm-project=johnb-2025'], db);
    expect([...docs.values()].every((d) => d.status === 'processed')).toBe(true);
    expect(docs.size).toBe(5);
  });
});
