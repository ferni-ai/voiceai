/**
 * POST /api/soul-stats with an in-memory Firestore: SOUL_STATS off answers 404
 * and stores nothing; on, each non-zero count is one increment in this hour's
 * doc and no uid is written; who may call, the 1 KB cap and the hourly limit (#4069).
 */
import { EventEmitter } from 'node:events';
import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';
import { handleSoulStatsRoutes, type SoulStatsDeps } from '../soul-stats-routes.js';
import { SOUL_COUNT_KEYS } from '../soul-stats-input.js';
import { addSoulCounts, soulStatsOn } from '../soul-stats-store.js';

const NOW = Date.UTC(2026, 10, 19, 7, 42);
const ZEROS = Object.fromEntries(SOUL_COUNT_KEYS.map((k) => [k, 0]));
const COUNTS = {
  ...ZEROS,
  micro_expression: 3,
  comfort_pulse: 1,
  crisis_hold: 1,
  name_lift_comfort: 2,
};

/** Records every set(data, options) by doc path. */
function memoryDb() {
  const writes: { path: string; data: Record<string, unknown>; options: unknown }[] = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        set: async (data: Record<string, unknown>, options: unknown) =>
          void writes.push({ path: `${name}/${id}`, data, options }),
      }),
    }),
  };
  return { db: db as never, writes };
}

let uidSeq = 0;
function call(body: unknown, deps: Partial<SoulStatsDeps> = {}, method = 'POST') {
  const req = Object.assign(new EventEmitter(), {
    url: '/api/soul-stats',
    method,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.7' },
    pause: () => {},
    resume: () => {},
    destroy: () => {},
  });
  let status = 0;
  let sent = '';
  const res = {
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: (b?: string) => void (sent = b ?? ''),
  };
  const uid = `uid-${++uidSeq}`; // own rate-limit bucket per call unless a test passes one
  const done = handleSoulStatsRoutes(req as never, res as never, '/api/soul-stats', {
    authenticate: async () => ({ userId: uid }),
    getDb: () => null,
    now: () => NOW,
    enabled: () => true,
    addCounts: addSoulCounts,
    ...deps,
  });
  void Promise.resolve().then(() => {
    req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });
  return done.then((handled) => ({ handled, status, body: sent }));
}

describe('SOUL_STATS', () => {
  it('is off unless set on', () => {
    expect(soulStatsOn({})).toBe(false);
    expect(soulStatsOn({ SOUL_STATS: 'off' })).toBe(false);
    expect(soulStatsOn({ SOUL_STATS: 'on' })).toBe(true);
  });

  it('off: 404 before auth, and nothing stored', async () => {
    const { db, writes } = memoryDb();
    const authenticate = vi.fn(async () => ({ userId: 'u' }));
    const addCounts = vi.fn(addSoulCounts);
    const deps = { enabled: () => false, getDb: () => db, authenticate, addCounts };
    expect((await call({ counts: COUNTS }, deps)).status).toBe(404);
    expect(authenticate).not.toHaveBeenCalled();
    expect(addCounts).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
});

describe('what is stored', () => {
  it('one increment per non-zero count in this UTC hour, kept 8 days, with no uid', async () => {
    const { db, writes } = memoryDb();
    const deps = { getDb: () => db, authenticate: async () => ({ userId: 'uid-fictional-77' }) };
    expect((await call({ counts: COUNTS }, deps)).status).toBe(202);
    expect(writes).toHaveLength(1);
    const [{ path, data, options }] = writes;
    expect(path).toBe('soul_stats_hourly/2026-11-19T07');
    expect(Object.keys(data).sort()).toEqual([
      'comfort_pulse',
      'crisis_hold',
      'expireAt',
      'micro_expression',
      'name_lift_comfort',
      'updatedAt',
    ]);
    expect((data.micro_expression as FieldValue).isEqual(FieldValue.increment(3))).toBe(true);
    expect((data.comfort_pulse as FieldValue).isEqual(FieldValue.increment(1))).toBe(true);
    expect((data.crisis_hold as FieldValue).isEqual(FieldValue.increment(1))).toBe(true);
    expect((data.name_lift_comfort as FieldValue).isEqual(FieldValue.increment(2))).toBe(true);
    // Timestamps survive safeSet's cleaner; a Date would be stored as a string,
    // which a TTL policy never expires and the admin read can't date.
    expect(data.expireAt).toBeInstanceOf(Timestamp);
    expect(data.updatedAt).toBeInstanceOf(Timestamp);
    expect((data.expireAt as Timestamp).toMillis()).toBe(Date.UTC(2026, 10, 27, 7, 42)); // 8 days out
    expect(options).toEqual({ merge: true });
    expect(JSON.stringify(data)).not.toContain('uid-fictional-77');
  });

  it('writes nothing when every count is 0', async () => {
    const { db, writes } = memoryDb();
    expect((await call({ counts: ZEROS }, { getDb: () => db })).status).toBe(202);
    expect(writes).toHaveLength(0);
  });

  it('takes all eleven counts at 500 (under the 1 KB cap): one increment each', async () => {
    const { db, writes } = memoryDb();
    const full = Object.fromEntries(SOUL_COUNT_KEYS.map((k) => [k, 500]));
    expect((await call({ counts: full }, { getDb: () => db })).status).toBe(202);
    const [{ data }] = writes;
    for (const k of SOUL_COUNT_KEYS) {
      expect((data[k] as FieldValue).isEqual(FieldValue.increment(500))).toBe(true);
    }
  });

  it('answers 503 without Firestore, and 500 when the write fails', async () => {
    expect((await call({ counts: COUNTS })).status).toBe(503);
    const { db } = memoryDb();
    const addCounts = async () => Promise.reject(new Error('14 UNAVAILABLE'));
    expect((await call({ counts: COUNTS }, { getDb: () => db, addCounts })).status).toBe(500);
  });

  it('answers 503 with the reason when the Firestore write does not settle within 5 s', async () => {
    const hung = { collection: () => ({ doc: () => ({ set: () => new Promise(() => {}) }) }) };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const done = call({ counts: COUNTS }, { getDb: () => hung as never });
      const settled = () => Promise.race([done, Promise.resolve(null)]);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(await settled()).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      const out = await settled();
      expect(out?.status).toBe(503);
      expect(JSON.parse(out?.body ?? '{}')).toEqual({
        error: 'Soul stats are unavailable right now',
        reason: 'Firestore did not answer within 5s',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('who may send, and what', () => {
  it('leaves other paths alone and only takes POST', async () => {
    const res = { writeHead: () => {}, setHeader: () => {}, end: () => {} };
    expect(await handleSoulStatsRoutes({} as never, res as never, '/api/reports')).toBe(false);
    expect((await call({ counts: COUNTS }, {}, 'GET')).status).toBe(405);
  });

  it('answers 401 without a verified caller (the real requireAuth, no token)', async () => {
    const { requireAuth } = await import('../../auth-middleware.js');
    const getDb = vi.fn(() => null);
    const { status } = await call({ counts: COUNTS }, { authenticate: requireAuth, getDb });
    expect(status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('answers 400 off schema or bad JSON, and 413 over 1 KB, before touching storage', async () => {
    const getDb = vi.fn(() => null);
    expect((await call({ counts: { ...COUNTS, memory_spark: 501 } }, { getDb })).status).toBe(400);
    expect((await call({ counts: COUNTS, trigger: 'concern' }, { getDb })).status).toBe(400);
    expect((await call('{not json', { getDb })).status).toBe(400);
    expect((await call({ counts: COUNTS, pad: 'x'.repeat(1100) }, { getDb })).status).toBe(413);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('limits each person to 120 sends an hour (the 60 s timer plus page-hide sends)', async () => {
    const { db } = memoryDb();
    const deps = { getDb: () => db, authenticate: async () => ({ userId: 'busy-uid' }) };
    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) statuses.push((await call({ counts: COUNTS }, deps)).status);
    expect(statuses.slice(0, 120).every((s) => s === 202)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});
