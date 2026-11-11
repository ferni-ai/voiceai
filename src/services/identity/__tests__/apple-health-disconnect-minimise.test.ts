/**
 * Apple Health (lane W7): disconnect erases every store the sync writes and reads it back,
 * is idempotent, and retries (and logs) a pass that fails; the sync never keeps samples,
 * source names or device names; oversize and held syncs are refused; old days with names
 * are stripped on read; account erasure covers every store. Indexing runs the real
 * store-hooks debounce, so a sync just before a disconnect is covered too.
 *
 * All ids and values here are fictional. The Firestore below is an in-memory fake keyed by
 * document path, so each assertion inspects the raw stored documents; the vector store is a
 * fake over the same documents, plus a fallback cache.
 */
import crypto from 'node:crypto';
import { FieldValue } from '@google-cloud/firestore';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
/** The vector store's fallback cache: id -> metadata */
const fallback = vi.hoisted(() => new Map<string, Record<string, unknown>>());
/** throw: the delete errors (throwOnce: only the first); noop: it succeeds and deletes nothing */
const faults = vi.hoisted(() => ({
  recursiveDelete: null as 'throw' | 'throwOnce' | 'noop' | null,
  docDelete: null as 'noop' | null,
}));
const vstore = vi.hoisted(() => ({
  addDocument: vi.fn(async (d: { id: string; text: string; metadata: Record<string, unknown> }) => {
    docs.set(`vectors/${d.id}`, { text: d.text, metadata: d.metadata });
  }),
  removeDocument: vi.fn(async (id: string) => {
    fallback.delete(id);
    if (faults.docDelete !== 'noop') docs.delete(`vectors/${id}`);
    return true;
  }),
  cached: vi.fn(async ({ userId }: { userId: string }) => ({
    docs: [...fallback]
      .filter(([, m]) => m.userId === userId)
      .map(([id, metadata]) => ({ id, metadata })),
    fallback: false,
  })),
  list: vi.fn(async () => []),
  invalidateSearchCacheForUser: vi.fn(() => 0),
}));
vi.mock('../../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => vstore,
}));
vi.mock('../../../memory/embeddings.js', () => ({ embed: async () => [0.1, 0.2] }));
const held = vi.hoisted(() => ({ value: false }));
/** Each module's logger, by module name (the global safe-logger mock keeps no handle on them) */
const loggers = vi.hoisted(() => new Map<string, Record<string, ReturnType<typeof vi.fn>>>());
vi.mock('../../../utils/safe-logger.js', () => {
  const make = (module = '?') => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() };
    loggers.set(module, log);
    return { ...log, fatal: vi.fn(), child: vi.fn(() => make(`${module}.child`)) };
  };
  return {
    createLogger: (o?: { module?: string }) => make(o?.module),
    getLogger: () => make(),
    safeLog: () => make(),
    serializeError: (e: unknown) => e,
    isFullLoggingEnabled: () => false,
    setErrorLogSink: () => undefined,
    truncateForLog: (v: unknown) => v,
  };
});
vi.mock('../../outreach/minor-care-shared-hold.js', () => ({
  sharedHeldStrict: vi.fn(async () => held.value),
}));

import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { handleAppleHealthRoutes } from '../../../servers/api/routes/apple-health.js';
import { handleWearablesRoutes } from '../../../servers/api/routes/wearables.js';
import { handleWearableRoutes } from '../../../api/routes/wearable.js';
import {
  APPLE_HEALTH_STORES,
  ERASE_ATTEMPTS,
  disconnectAppleHealth,
} from '../apple-health-erase.js';
import { forgetCachedStatus, toDailySummary } from '../apple-health-sync.js';
import { eraseStore } from '../../platform/erase-store.js';
import { resetMaxPerUserCache } from '../../data-layer/max-per-user.js';
import { clearPendingChanges, getQueueMetrics } from '../../data-layer/store-hooks.js';
import { ERASED_STORES } from '../../platform/user-stores.js';
import { EXPORTED_STORES } from '../../platform/user-records-export.js';

const isMap = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
const isDelete = (v: unknown): boolean => v instanceof FieldValue && v.isEqual(FieldValue.delete());
const merge = (a: Data, b: Data): Data =>
  Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => !isDelete(b[k]))
      .map((k) => [
        k,
        k in b ? (isMap(a[k]) && isMap(b[k]) ? merge(a[k] as Data, b[k] as Data) : b[k]) : a[k],
      ])
  );
const field = (data: Data | undefined, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (isMap(v) ? v[k] : undefined), data);
const children = (path: string): string[] => [
  ...new Set(
    [...docs.keys()]
      .filter((p) => p.startsWith(`${path}/`))
      .map((p) => p.slice(path.length + 1).split('/')[0]!)
  ),
];

function snap(path: string) {
  const data = docs.get(path);
  return {
    id: path.split('/').at(-1)!,
    exists: data !== undefined,
    data: () => data,
    get: (f: string) => field(data, f),
    ref: doc(path),
  };
}
function doc(path: string): Data {
  return {
    id: path.split('/').at(-1),
    path,
    get: async () => snap(path),
    set: async (d: Data, o?: { merge?: boolean }) =>
      void docs.set(path, o?.merge ? merge(docs.get(path) ?? {}, d) : d),
    update: async (d: Data) => void docs.set(path, { ...docs.get(path), ...d }),
    delete: async () => void (faults.docDelete === 'noop' || docs.delete(path)),
    collection: (name: string) => collection(`${path}/${name}`),
    listCollections: async () =>
      children(path)
        .filter((id) => !docs.has(`${path}/${id}`))
        .map((id) => collection(`${path}/${id}`)),
  };
}
function collection(path: string, where: [string, string, unknown][] = []): Data {
  const matches = (d: Data | undefined): boolean =>
    where.every(([f, op, v]) => {
      const value = field(d, f);
      return op === '!=' ? value !== undefined && value !== v : value === v;
    });
  const rows = () =>
    children(path)
      .map((id) => `${path}/${id}`)
      .filter((p) => docs.has(p) && matches(docs.get(p)))
      .map(snap);
  const query: Data = {
    doc: (id: string) => doc(`${path}/${id}`),
    where: (f: string, op: string, v: unknown) => collection(path, [...where, [f, op, v]]),
    limit: () => query,
    select: () => query,
    get: async () => ({ docs: rows(), empty: rows().length === 0 }),
    count: () => ({ get: async () => ({ data: () => ({ count: rows().length }) }) }),
    listDocuments: async () => children(path).map((id) => doc(`${path}/${id}`)),
  };
  return query;
}
const db = {
  collection: (name: string) => collection(name),
  recursiveDelete: async (ref: { path: string }) => {
    if (faults.recursiveDelete === 'throwOnce') {
      faults.recursiveDelete = null;
      throw new Error('unavailable');
    }
    if (faults.recursiveDelete === 'throw') throw new Error('unavailable');
    if (faults.recursiveDelete === 'noop') return;
    for (const p of [...docs.keys()])
      if (p === ref.path || p.startsWith(`${ref.path}/`)) docs.delete(p);
  },
};

const eraseLog = () => loggers.get('apple-health-erase')!;

const A = 'test-user-a';
const B = 'test-user-b';
const TOKEN = 'fictional-sync-token';
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const nameRaw = (uid: string) =>
  [...docs.entries()].filter(([p, d]) => p.includes(uid) || field(d, 'metadata.userId') === uid);

function seedPerson(uid: string, date: string): void {
  docs.set(`apple_health_tokens/${uid}`, {
    hashedToken: hash(TOKEN),
    deviceId: 'd1',
    deviceName: 'Test Phone',
  });
  docs.set(`apple_health_status/${uid}`, {
    connected: true,
    deviceId: 'd1',
    deviceName: 'Test Phone',
  });
  docs.set(`apple_health_data/${uid}/daily/${date}`, {
    sleep: { totalSleep: 400, sources: ['Oura', 'Test Watch'] },
  });
  docs.set(`apple_health_data/${uid}/workouts/w-${uid}`, { duration: 1800, sourceName: 'Whoop' });
  docs.set(`vectors/${indexedId(date)}`, { text: 'Wellness check.', metadata: indexed(uid, date) });
}
const indexedId = (date: string) => `health_wellness_checkin_activity_${date}`;
const indexed = (userId: string, date: string) => ({
  userId,
  storeType: 'health',
  entityType: 'wellness_checkin',
  entityId: `activity_${date}`,
});

interface Reply {
  status: number;
  body: Data;
}
async function call(
  handler: (req: IncomingMessage, res: ServerResponse, path: string, url: URL) => Promise<boolean>,
  method: string,
  path: string,
  opts: { uid?: string; token?: string; body?: unknown; raw?: string } = {}
): Promise<Reply> {
  const text = opts.raw ?? (opts.body === undefined ? '' : JSON.stringify(opts.body));
  const req = Readable.from(text ? [Buffer.from(text)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: path,
    headers: {
      ...(opts.uid ? { 'x-firebase-uid': opts.uid } : {}),
      ...(opts.token ? { 'x-sync-token': opts.token } : {}),
    },
  });
  const reply: Reply = { status: 0, body: {} };
  const res = {
    headersSent: false,
    setHeader: () => undefined,
    writeHead(this: { headersSent: boolean }, status: number) {
      reply.status = status;
      this.headersSent = true;
    },
    end: (b?: string) => void (reply.body = b ? (JSON.parse(b) as Data) : {}),
    once: () => undefined,
  } as unknown as ServerResponse;
  const url = new URL(path, 'http://localhost');
  await handler(req, res, url.pathname, url);
  return reply;
}
const disconnect = () =>
  call(handleAppleHealthRoutes, 'DELETE', '/api/apple-health/disconnect', { uid: A });
const sync = (body: unknown, raw?: string) =>
  call(handleAppleHealthRoutes, 'POST', '/api/apple-health/sync', {
    uid: A,
    token: TOKEN,
    body,
    raw,
  });

beforeEach(() => {
  docs.clear();
  fallback.clear();
  clearPendingChanges();
  resetMaxPerUserCache();
  vi.clearAllMocks();
  faults.recursiveDelete = null;
  faults.docDelete = null;
  held.value = false;
  eraseLog().warn.mockClear();
  eraseLog().error.mockClear();
  forgetCachedStatus(A);
  vi.mocked(getFirestoreDb).mockReturnValue(db as never);
  seedPerson(A, '2026-10-01');
  seedPerson(B, '2026-10-02');
});
afterEach(() => {
  clearPendingChanges();
  vi.useRealTimers();
});

describe('disconnect erases every Apple Health store', () => {
  it('removes token, status, daily, legacy workouts and the indexed day; B is untouched', async () => {
    expect(
      nameRaw(A)
        .map(([p]) => p.split('/')[0])
        .sort()
    ).toEqual([
      'apple_health_data',
      'apple_health_data',
      'apple_health_status',
      'apple_health_tokens',
      'vectors',
    ]);
    const before = nameRaw(B).length;

    expect(await disconnect()).toEqual({ status: 200, body: { success: true } });
    expect(nameRaw(A)).toEqual([]);
    expect(nameRaw(B)).toHaveLength(before);
  });

  it.each([
    [
      'POST /wearables/apple_health/unlink',
      () => call(handleWearablesRoutes, 'POST', '/wearables/apple_health/unlink', { uid: A }),
    ],
    [
      'POST /api/wearable/disconnect',
      () =>
        call(handleWearableRoutes, 'POST', '/api/wearable/disconnect', {
          uid: A,
          body: { provider: 'apple_health' },
        }),
    ],
  ])('%s erases it too', async (_name, unlink) => {
    expect((await unlink()).status).toBe(200);
    expect(nameRaw(A)).toEqual([]);
  });

  it('is idempotent: a second disconnect, and one with nothing stored, succeed', async () => {
    expect((await disconnect()).status).toBe(200);
    expect(await disconnect()).toEqual({ status: 200, body: { success: true } });
    expect(nameRaw(A)).toEqual([]);
    docs.clear();
    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: true });
  });

  it('a pass that fails is logged and retried, and the retry erases everything', async () => {
    faults.recursiveDelete = 'throwOnce';
    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: true });
    expect(nameRaw(A)).toEqual([]);
    expect(eraseLog().warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: A, attempt: 1, error: 'Error' }),
      'Apple Health disconnect: a pass failed'
    );
  });

  it('a delete that keeps failing is a logged 500 with the data reported still there', async () => {
    faults.recursiveDelete = 'throw';
    expect(await disconnect()).toMatchObject({ status: 500, body: { success: false } });
    expect(nameRaw(A).length).toBeGreaterThan(0);
    expect(eraseLog().warn).toHaveBeenCalledTimes(ERASE_ATTEMPTS);
    expect(eraseLog().error).toHaveBeenCalledWith(
      { userId: A, attempts: ERASE_ATTEMPTS },
      'Apple Health disconnect: data left behind'
    );
  });

  it('a delete that silently keeps the data fails the read-back', async () => {
    faults.recursiveDelete = 'noop';
    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: false });
    expect(eraseLog().warn).toHaveBeenCalledWith(
      {
        userId: A,
        attempt: ERASE_ATTEMPTS,
        left: ['apple_health_tokens', 'apple_health_status', 'apple_health_data'],
      },
      'Apple Health disconnect: a pass left data'
    );
  });

  it('an indexed day that survives fails the read-back, and a later disconnect erases it', async () => {
    faults.docDelete = 'noop';
    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: false });
    expect(eraseLog().warn).toHaveBeenLastCalledWith(
      { userId: A, attempt: ERASE_ATTEMPTS, left: ['vectors'] },
      'Apple Health disconnect: a pass left data'
    );
    expect(nameRaw(A).map(([p]) => p)).toEqual([`vectors/${indexedId('2026-10-01')}`]);

    faults.docDelete = null;
    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: true });
    expect(nameRaw(A)).toEqual([]);
  });

  it('indexed days go by owner and type, not by stored date', async () => {
    // A day indexed for A whose stored day is already gone, and one in the fallback cache
    docs.set(`vectors/${indexedId('2026-09-15')}`, { metadata: indexed(A, '2026-09-15') });
    fallback.set(indexedId('2026-09-16'), indexed(A, '2026-09-16'));
    // Same date as A's: the shared id now holds B's day, which must stay
    docs.set(`vectors/${indexedId('2026-10-01')}`, { metadata: indexed(B, '2026-10-01') });
    // A's own check-in from a call, not from Apple Health, stays too
    const spoken = { ...indexed(A, 'x'), entityId: 'call_77' };
    docs.set('vectors/health_wellness_checkin_call_77', { metadata: spoken });

    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: true });
    expect(nameRaw(A).map(([p]) => p)).toEqual(['vectors/health_wellness_checkin_call_77']);
    expect(fallback.size).toBe(0);
    expect(docs.get(`vectors/${indexedId('2026-10-01')}`)).toMatchObject({
      metadata: { userId: B },
    });
    expect(vstore.invalidateSearchCacheForUser).toHaveBeenCalledWith(A);
  });

  const activityDay = {
    deviceId: 'd1',
    syncedAt: '2026-10-05T08:00:00Z',
    data: { activity: [{ date: '2026-10-05', activeEnergyBurned: 410, appleExerciseTime: 30 }] },
  };

  it('a sync then a disconnect within the 2 s index debounce: the queued day is dropped', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expect((await sync(activityDay)).status).toBe(200);
    expect(getQueueMetrics().pendingByEntity.wellness_checkin).toBe(1);

    expect(await disconnectAppleHealth(A, 0)).toEqual({ ok: true });
    expect(getQueueMetrics().pendingByEntity.wellness_checkin).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(vstore.addDocument).not.toHaveBeenCalled();
    expect(nameRaw(A)).toEqual([]);
  });

  it('a disconnect on another instance: the queued write sees the token gone and skips', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expect((await sync(activityDay)).status).toBe(200);
    docs.delete(`apple_health_tokens/${A}`); // that instance's erase, with this queue untouched
    await vi.advanceTimersByTimeAsync(5000);
    expect(vstore.addDocument).not.toHaveBeenCalled();

    // Still connected: the same sync is indexed (the debounce really writes)
    docs.set(`apple_health_tokens/${A}`, { hashedToken: hash(TOKEN), deviceId: 'd1' });
    expect((await sync(activityDay)).status).toBe(200);
    await vi.advanceTimersByTimeAsync(5000);
    expect(docs.get(`vectors/${indexedId('2026-10-05')}`)).toMatchObject({
      metadata: indexed(A, '2026-10-05'),
    });
  });

  it('the unlink routes report a failed erase as a failure', async () => {
    faults.recursiveDelete = 'noop';
    const r = await call(handleWearablesRoutes, 'POST', '/wearables/apple_health/unlink', {
      uid: A,
    });
    expect(r.status).toBe(500);
    const w = await call(handleWearableRoutes, 'POST', '/api/wearable/disconnect', {
      uid: A,
      body: { provider: 'apple_health' },
    });
    expect(w.status).toBe(500);
  });
});

const rawPayload = {
  deviceId: 'd1',
  syncedAt: '2026-10-05T08:00:00Z',
  data: {
    sleep: [
      {
        id: 's1',
        startDate: '2026-10-04T23:00:00Z',
        endDate: '2026-10-05T03:00:00Z',
        value: 'asleepCore',
        sourceName: 'Oura',
        sourceId: 'com.ouraring',
      },
      {
        id: 's2',
        startDate: '2026-10-05T03:00:00Z',
        endDate: '2026-10-05T06:00:00Z',
        value: 'asleepDeep',
        sourceName: 'Whoop',
        sourceId: 'com.whoop',
      },
    ],
    steps: [
      {
        startDate: '2026-10-05T09:00:00Z',
        endDate: '2026-10-05T10:00:00Z',
        value: 4200,
        sourceName: 'Test Watch',
      },
    ],
    workouts: [
      {
        id: 'w1',
        workoutType: 'running',
        startDate: '2026-10-05T07:00:00Z',
        endDate: '2026-10-05T07:30:00Z',
        duration: 1800,
        totalEnergyBurned: 300,
        sourceName: 'Strava',
      },
    ],
    activity: [
      {
        date: '2026-10-05',
        activeEnergyBurned: 410,
        basalEnergyBurned: 1600,
        appleExerciseTime: 30,
        appleStandHours: 9,
        appleMoveMinutes: 40,
        sourceName: 'Oura',
      },
    ],
  },
};
const stored = (uid: string, date: string) => docs.get(`apple_health_data/${uid}/daily/${date}`);
const NAMES = /Oura|Whoop|Strava|Test Watch|sourceName|sources|ouraring/;

describe('the sync keeps daily totals only', () => {
  it('raw samples with source names store aggregates and no names (legacy payload)', async () => {
    expect(await sync(rawPayload)).toMatchObject({ status: 200 });
    const day = stored(A, '2026-10-05');
    expect(day).toMatchObject({
      sleep: { totalSleep: 420, deep: 180 },
      activity: { steps: 4200, activeEnergyBurned: 410 },
      workouts: { count: 1, minutes: 30 },
    });
    expect(JSON.stringify(day)).not.toMatch(NAMES);
    expect(
      [...docs.keys()].filter(
        (p) =>
          p.startsWith(`apple_health_data/${A}/workouts/`) &&
          p !== `apple_health_data/${A}/workouts/w-${A}`
      )
    ).toEqual([]);
  });

  it('setup and sync keep no device name, and status returns none', async () => {
    const setup = await call(handleAppleHealthRoutes, 'POST', '/api/apple-health/setup', {
      uid: A,
      body: { deviceId: 'd2', deviceName: "Avery Example's iPhone" },
    });
    expect(setup.status).toBe(200);
    expect(docs.get(`apple_health_tokens/${A}`)).not.toHaveProperty('deviceName');
    const token = (setup.body as { syncToken: string }).syncToken;
    const synced = await call(handleAppleHealthRoutes, 'POST', '/api/apple-health/sync', {
      uid: A,
      token,
      body: rawPayload,
    });
    expect(synced.status).toBe(200);
    // The seeded status held 'Test Phone' (stored before names were dropped): the sync removes it
    expect(docs.get(`apple_health_status/${A}`)).not.toHaveProperty('deviceName');
    expect(JSON.stringify([...docs.entries()])).not.toContain('Avery');
    const status = await call(handleAppleHealthRoutes, 'GET', '/api/apple-health/status', {
      uid: A,
    });
    expect(status.body).toMatchObject({ connected: true, deviceName: null });
  });

  it('an oversize payload gets 413 and no health data is written', async () => {
    // The token check before it stamps the token's lastUsedAt; nothing else may change
    const health = () =>
      JSON.stringify([...docs].filter(([p]) => !p.startsWith('apple_health_tokens/')));
    const before = health();
    const big = JSON.stringify({ ...rawPayload, pad: 'x'.repeat(300 * 1024) });
    expect((await sync(undefined, big)).status).toBe(413);
    expect(health()).toBe(before);
  });

  it('a minor-care-held account gets 403 on sync and setup', async () => {
    held.value = true;
    const before = JSON.stringify([...docs.entries()]);
    expect((await sync(rawPayload)).status).toBe(403);
    const setup = await call(handleAppleHealthRoutes, 'POST', '/api/apple-health/setup', {
      uid: A,
      body: { deviceId: 'd2', deviceName: 'x' },
    });
    expect(setup.status).toBe(403);
    expect(JSON.stringify([...docs.entries()])).toBe(before);
  });
});

describe('old days and erasure', () => {
  it('a stored day with source names is stripped on read (history maps through the same toDailySummary)', async () => {
    expect(JSON.stringify(stored(A, '2026-10-01'))).toContain('Oura');
    const one = await call(
      handleAppleHealthRoutes,
      'GET',
      '/api/apple-health/summary?date=2026-10-01',
      { uid: A }
    );
    expect(one).toMatchObject({ status: 200, body: { sleep: { totalSleep: 400 } } });
    expect(JSON.stringify(one.body)).not.toMatch(NAMES);
    const day = toDailySummary('2026-10-01', stored(A, '2026-10-01')!);
    expect(day.sleep).toEqual({ totalSleep: 400 });
  });

  it('account erasure lists every Apple Health store and erasing them leaves nothing', async () => {
    const catalog = [...APPLE_HEALTH_STORES, { collection: 'vectors', field: 'metadata.userId' }];
    const listed = catalog.map((s) =>
      ERASED_STORES.find((e) => JSON.stringify(e) === JSON.stringify(s))
    );
    expect(listed).toEqual(catalog);
    for (const store of listed) await eraseStore(db as never, store!, A);
    expect(nameRaw(A)).toEqual([]);
    expect(nameRaw(B).length).toBeGreaterThan(0);
    // The export reads only allowlisted subcollections: daily totals never leave in it
    expect(EXPORTED_STORES.apple_health_data).toBeUndefined();
  });
});
