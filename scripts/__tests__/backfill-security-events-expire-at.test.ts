import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRACE_MS,
  backfill,
  main,
  type EventsDb,
} from '../migrations/backfill-security-events-expire-at.js';
import { SECURITY_EVENT_RETENTION_MS } from '../../src/services/platform/security-event-expiry.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-22T00:00:00Z');
const ts = (ms: number) => ({ toMillis: () => ms });

/** security_events as id → fields, with just the query surface the backfill uses. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(seed));
  const query = (after?: string, limit = Infinity): ReturnType<EventsDb['collection']> => ({
    orderBy: () => query(after, limit),
    select: () => query(after, limit),
    limit: (k) => query(after, k),
    startAfter: (d) => query(d.ref as string, limit),
    get: async () => ({
      docs: [...docs.keys()]
        .sort()
        .filter((id) => after === undefined || id > after)
        .slice(0, limit)
        .map((id) => ({ ref: id, get: (f: string) => docs.get(id)?.[f] })),
    }),
  });
  const updates: Array<[string, Record<string, unknown>]> = [];
  const db: EventsDb = {
    collection: () => query(),
    batch: () => {
      const pending: Array<[string, { expireAt: Date }]> = [];
      return {
        update: (ref, data) => pending.push([ref as string, data]),
        commit: async () => {
          for (const [id, data] of pending) {
            updates.push([id, data]);
            docs.set(id, { ...docs.get(id), ...data });
          }
        },
      };
    },
  };
  return { db, docs, updates };
}

const seed = () => ({
  recent: { timestamp: ts(NOW - 10 * DAY), severity: 'low' },
  old: { timestamp: ts(NOW - 200 * DAY), severity: 'critical' },
  stamped: { timestamp: ts(NOW - 1 * DAY), expireAt: ts(NOW + 89 * DAY) },
  broken: { severity: 'low' },
});

beforeEach(() => {
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('backfill-security-events-expire-at', () => {
  it('dry run counts each kind and writes nothing', async () => {
    const { db, updates } = fakeDb(seed());
    expect(await backfill(db, false, NOW)).toEqual({
      scanned: 4,
      alreadyStamped: 1,
      noTimestamp: 1,
      stamped: 1,
      stampedAtGrace: 1,
      written: 0,
    });
    expect(updates).toEqual([]);
  });

  it('apply writes only expireAt: timestamp + 90 d, or run time + grace when already past', async () => {
    const { db, docs, updates } = fakeDb(seed());
    const c = await backfill(db, true, NOW);
    expect(c.written).toBe(2);
    expect(updates.map(([id, data]) => [id, Object.keys(data)])).toEqual([
      ['old', ['expireAt']],
      ['recent', ['expireAt']],
    ]);
    expect((docs.get('recent')?.expireAt as Date).getTime()).toBe(
      NOW - 10 * DAY + SECURITY_EVENT_RETENTION_MS
    );
    expect((docs.get('old')?.expireAt as Date).getTime()).toBe(NOW + GRACE_MS);
    expect(docs.get('old')?.severity).toBe('critical');
    expect(docs.has('broken') && docs.get('broken')?.expireAt).toBeFalsy();
  });

  it('pages past 400 documents', async () => {
    const many: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 901; i++) many[`e${String(i).padStart(4, '0')}`] = { timestamp: ts(NOW) };
    const { db } = fakeDb(many);
    expect((await backfill(db, true, NOW)).written).toBe(901);
  });

  it('refuses --apply without the matching --confirm-project', async () => {
    const { db, updates } = fakeDb(seed());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['node', 'backfill', '--apply'], db);
    expect(updates).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  it('with --apply --confirm-project writes', async () => {
    const { db, updates } = fakeDb(seed());
    await main(['node', 'backfill', '--apply', '--confirm-project=johnb-2025'], db);
    expect(updates).toHaveLength(2);
  });
});
