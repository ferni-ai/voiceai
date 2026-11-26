/**
 * GET /api/v1/admin/soul/stats (#4069): the sum of the last 24 hourly docs, read by
 * id, and { measured: false, reason } (never zeros) when SOUL_STATS is off or
 * Firestore can't be read. requireAdmin is replaced so the router test can choose
 * the admin; the store and the handler are real, with Firestore faked in memory.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock('../../../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../auth-middleware.js')>()),
  requireAdmin: auth.requireAdmin,
}));

import { handleAdminRoutes } from '../index.js';
import { SOUL_COUNT_KEYS } from '../../../soul-stats/soul-stats-input.js';
import { handleAdminSoulStatsRoutes, type AdminSoulStatsDeps } from '../soul-stats.js';

const NOW = Date.UTC(2026, 11, 1, 0, 30); // just after midnight: the window crosses a day
const HOUR = 3_600_000;
const PATH = '/api/v1/admin/soul/stats';
type Doc = Record<string, unknown>;

/** Docs by path; getAll answers each ref in order, as Firestore does. */
function memoryDb(docs: Record<string, Doc>, opts: { fail?: Error } = {}) {
  const asked: string[] = [];
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    getAll: async (...refs: { path: string }[]) => {
      if (opts.fail) throw opts.fail;
      asked.push(...refs.map((r) => r.path));
      return refs.map((r) => ({ data: () => docs[r.path] }));
    },
  };
  return { db: db as never, asked };
}

const hourDoc = (hoursAgo: number, d: Doc): [string, Doc] => [
  `soul_stats_hourly/${new Date(NOW - hoursAgo * HOUR).toISOString().slice(0, 13)}`,
  { updatedAt: new Date(NOW - hoursAgo * HOUR), ...d },
];

const deps = (over: Partial<AdminSoulStatsDeps>): AdminSoulStatsDeps => ({
  enabled: () => true,
  getDb: () => null,
  now: () => NOW,
  ...over,
});

/** What the handler answers a GET with, through the real handler. */
async function readAdminSoulStats(d: AdminSoulStatsDeps): Promise<unknown> {
  const r = request('GET', PATH);
  expect(await handleAdminSoulStatsRoutes(r.req, r.res, PATH, d)).toBe(true);
  expect(r.out().status).toBe(200);
  return JSON.parse(r.out().body) as unknown;
}

describe('GET soul stats, by what the store holds', () => {
  it('SOUL_STATS off: measured false with the reason, without reading Firestore', async () => {
    const getDb = vi.fn(() => null);
    expect(await readAdminSoulStats(deps({ enabled: () => false, getDb }))).toEqual({
      measured: false,
      reason: 'SOUL_STATS is off',
    });
    expect(getDb).not.toHaveBeenCalled();
  });

  it('sums each of the eleven keys over the last 24 hourly docs and ignores the 25th', async () => {
    const { db, asked } = memoryDb(
      Object.fromEntries([
        hourDoc(0, { micro_expression: 5, comfort_pulse: 1, warmth_bloom: 2, crisis_hold: 1 }),
        hourDoc(1, { micro_expression: 2, protective_mode: 1, name_lift_brighten: 3 }),
        hourDoc(12, { celebrate_growth: 2, cameo_arrival: 1, name_lift_attentive: 1 }),
        hourDoc(23, {
          micro_expression: 10,
          memory_spark: 4,
          warmth_bloom: 5,
          name_lift_comfort: 6,
        }),
        hourDoc(24, Object.fromEntries(SOUL_COUNT_KEYS.map((k) => [k, 1000]))),
      ])
    );
    expect(await readAdminSoulStats(deps({ getDb: () => db }))).toEqual({
      measured: true,
      windowHours: 24,
      counts: {
        micro_expression: 17,
        protective_mode: 1,
        comfort_pulse: 1,
        memory_spark: 4,
        warmth_bloom: 7,
        celebrate_growth: 2,
        cameo_arrival: 1,
        crisis_hold: 1,
        name_lift_brighten: 3,
        name_lift_attentive: 1,
        name_lift_comfort: 6,
      },
      lastUpdated: new Date(NOW).toISOString(),
    });
    expect(asked).toHaveLength(24);
    expect(asked[0]).toBe('soul_stats_hourly/2026-12-01T00');
    expect(asked[23]).toBe('soul_stats_hourly/2026-11-30T01');
  });

  it('an old doc written before the new keys reads 0 for them (they were not counted then)', async () => {
    const { db } = memoryDb(
      Object.fromEntries([hourDoc(2, { micro_expression: 3, memory_spark: 1 })])
    );
    const stats = (await readAdminSoulStats(deps({ getDb: () => db }))) as {
      counts: Record<string, number>;
    };
    expect(Object.keys(stats.counts)).toEqual([...SOUL_COUNT_KEYS]);
    expect(stats.counts).toMatchObject({ micro_expression: 3, memory_spark: 1, warmth_bloom: 0 });
    expect(stats.counts.name_lift_comfort).toBe(0);
  });

  it('a measured 0: docs exist with nothing in them, or no doc at all', async () => {
    const zeros = Object.fromEntries(SOUL_COUNT_KEYS.map((k) => [k, 0]));
    const empty = memoryDb(Object.fromEntries([hourDoc(3, {})]));
    const zero = await readAdminSoulStats(deps({ getDb: () => empty.db }));
    expect(zero).toMatchObject({ measured: true, counts: zeros });
    expect(zero).toMatchObject({ lastUpdated: new Date(NOW - 3 * HOUR).toISOString() });
    const none = await readAdminSoulStats(deps({ getDb: () => memoryDb({}).db }));
    expect(none).toEqual({ measured: true, windowHours: 24, counts: zeros, lastUpdated: null });
  });

  it('Firestore unavailable or failing: measured false with a reason, never zeros', async () => {
    expect(await readAdminSoulStats(deps({ getDb: () => null }))).toEqual({
      measured: false,
      reason: 'Firestore is unavailable',
    });
    const denied = Object.assign(new Error('7 PERMISSION_DENIED'), { code: 7 });
    const failing = memoryDb({}, { fail: denied }).db;
    expect(await readAdminSoulStats(deps({ getDb: () => failing }))).toEqual({
      measured: false,
      reason: 'Could not read soul_stats_hourly (Error, code 7)',
    });
  });

  it('Firestore that never answers: measured false after 5 s, not a hung request', async () => {
    const hung = {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll: () => new Promise(() => {}),
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const answer = readAdminSoulStats(deps({ getDb: () => hung as never }));
      const settled = () => Promise.race([answer, Promise.resolve('pending')]);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(await settled()).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      expect(await settled()).toEqual({
        measured: false,
        reason: 'Firestore did not answer within 5s',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function request(method: string, path: string) {
  const req = Object.assign(new EventEmitter(), {
    method,
    url: path,
    headers: { host: 'localhost' },
    socket: { remoteAddress: '203.0.113.8' },
  });
  let status = 0;
  let body = '';
  const res = {
    headersSent: false,
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: (b?: string) => void (body = b ?? ''),
  };
  return { req: req as never, res: res as never, out: () => ({ status, body }) };
}

describe('GET /api/v1/admin/soul/stats', () => {
  beforeEach(() => {
    auth.requireAdmin.mockReset();
    vi.stubEnv('SOUL_STATS', ''); // the default, as the walk runs it
  });
  afterEach(() => vi.unstubAllEnvs());

  it('answers 200 with measured false when the flag is at its default (off)', async () => {
    auth.requireAdmin.mockResolvedValue({ userId: 'uid-fictional-admin', isAdmin: true });
    const r = request('GET', '/api/v1/admin/soul/stats');
    const url = new URL('http://localhost/api/v1/admin/soul/stats');
    expect(await handleAdminRoutes(r.req, r.res, url.pathname, url)).toBe(true);
    expect(r.out().status).toBe(200);
    expect(JSON.parse(r.out().body)).toEqual({ measured: false, reason: 'SOUL_STATS is off' });
  });

  it('is behind admin auth: no admin, no handler', async () => {
    auth.requireAdmin.mockResolvedValue(null); // requireAdmin has sent 401/403
    const r = request('GET', '/api/v1/admin/soul/stats');
    const url = new URL('http://localhost/api/v1/admin/soul/stats');
    expect(await handleAdminRoutes(r.req, r.res, url.pathname, url)).toBe(true);
    expect(r.out()).toEqual({ status: 0, body: '' }); // the handler never ran
  });

  it('only takes GET, and leaves other paths alone', async () => {
    const r = request('POST', '/api/v1/admin/soul/stats');
    expect(await handleAdminSoulStatsRoutes(r.req, r.res, '/api/v1/admin/soul/stats')).toBe(true);
    expect(r.out().status).toBe(405);
    const other = request('GET', '/api/v1/admin/soul/other');
    expect(await handleAdminSoulStatsRoutes(other.req, other.res, '/api/v1/admin/soul/x')).toBe(
      false
    );
  });
});
