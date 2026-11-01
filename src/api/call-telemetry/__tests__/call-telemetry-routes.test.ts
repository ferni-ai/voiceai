/**
 * POST /api/call-telemetry with an in-memory Firestore: the flag modes, who may
 * call, the body cap, the room check, the limits, and exactly what is stored.
 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_STATES,
  DEVICE_MODEL,
  EVENT_KINDS,
  OUTCOMES,
  PHASES,
  ROOM_NAME,
  ROUTES,
  THERMAL,
  VERSION,
} from '../call-telemetry-input.js';
import { handleCallTelemetryRoutes, type CallTelemetryDeps } from '../call-telemetry-routes.js';
import { callTelemetryMode, FELT_OFF_KEEP_MS } from '../call-telemetry-store.js';

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = Date.UTC(2026, 9, 22, 12);

/** Documents by path, with doc().set/get and transactions: enough for the route. */
function memoryDb(seed: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(seed));
  let next = 0;
  const ref = (path: string) => ({
    id: path.split('/')[1],
    path,
    get: async () => ({ data: () => docs.get(path) }),
    set: async (d: Record<string, unknown>) => void docs.set(path, d),
  });
  const db = {
    collection: (name: string) => ({ doc: (id = `doc${++next}`) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (r: { get: () => unknown }) => r.get(),
        set: (r: { path: string }, d: Record<string, unknown>) => void docs.set(r.path, d),
      }),
  };
  const under = (c: string) => [...docs].filter(([p]) => p.startsWith(`${c}/`));
  return { db: db as never, docs, under };
}

let uidSeq = 0;
function call(body: unknown, deps: Partial<CallTelemetryDeps> = {}, method = 'POST') {
  const req = Object.assign(new EventEmitter(), {
    url: '/api/call-telemetry',
    method,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.9' },
    pause: () => {},
    resume: () => {},
    destroy: () => {},
  });
  let status = 0;
  const res = { writeHead: (s: number) => void (status = s), setHeader: () => {}, end: () => {} };
  const uid = `uid-${++uidSeq}`; // own rate-limit bucket per call unless a test passes one
  const done = handleCallTelemetryRoutes(req as never, res as never, '/api/call-telemetry', {
    authenticate: async () => ({ userId: uid }),
    getDb: () => null,
    now: () => NOW,
    mode: () => 'on',
    roomHolder: async () => 'mine',
    recordSummary: async () => {},
    ...deps,
  });
  void Promise.resolve().then(() => {
    req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });
  return done.then((handled) => ({ handled, status }));
}

afterEach(() => vi.unstubAllEnvs());

describe('CALL_TELEMETRY modes', () => {
  it('reads off (default and junk), reports and on', () => {
    expect(callTelemetryMode({})).toBe('off');
    expect(callTelemetryMode({ CALL_TELEMETRY: 'yes please' })).toBe('off');
    expect(callTelemetryMode({ CALL_TELEMETRY: ' Reports ' })).toBe('reports');
    expect(callTelemetryMode({ CALL_TELEMETRY: 'on' })).toBe('on');
  });

  it('off: 404 for both kinds before auth, and nothing stored', async () => {
    const { db, docs } = memoryDb();
    const authenticate = vi.fn(async () => ({ userId: 'u' }));
    const recordSummary = vi.fn(async () => {});
    for (const body of [fixture('felt-off.json'), fixture('summary.json')]) {
      const deps = { mode: () => 'off' as const, getDb: () => db, authenticate, recordSummary };
      expect((await call(body, deps)).status).toBe(404);
    }
    expect(authenticate).not.toHaveBeenCalled();
    expect(recordSummary).not.toHaveBeenCalled();
    expect(docs.size).toBe(0);
  });

  it('reports: stores a felt-off report (201) and answers a summary 404', async () => {
    const { db, under } = memoryDb();
    const recordSummary = vi.fn(async () => {});
    const deps = { mode: () => 'reports' as const, getDb: () => db, recordSummary };
    expect((await call(fixture('felt-off.json'), deps)).status).toBe(201);
    expect(under('call_felt_off')).toHaveLength(1);
    expect((await call(fixture('summary.json'), deps)).status).toBe(404);
    expect(recordSummary).not.toHaveBeenCalled();
  });

  it('on: takes both, the summary handed to recordSummary (202)', async () => {
    const { db, under } = memoryDb();
    const recordSummary = vi.fn(async () => {});
    const deps = { mode: () => 'on' as const, getDb: () => db, recordSummary };
    expect((await call(fixture('felt-off.json'), deps)).status).toBe(201);
    expect((await call(fixture('summary.json'), deps)).status).toBe(202);
    expect(under('call_felt_off')).toHaveLength(1);
    expect(recordSummary).toHaveBeenCalledWith(
      expect.stringMatching(/^uid-/),
      expect.objectContaining({ kind: 'summary' })
    );
  });
});

describe('who may send, and what', () => {
  it('leaves other paths alone and only takes POST', async () => {
    const res = { writeHead: () => {}, setHeader: () => {}, end: () => {} };
    expect(await handleCallTelemetryRoutes({} as never, res as never, '/api/reports')).toBe(false);
    expect((await call(fixture('summary.json'), {}, 'GET')).status).toBe(405);
  });

  it('answers 401 without a verified caller (the real requireAuth, no token)', async () => {
    const { requireAuth } = await import('../../auth-middleware.js');
    const getDb = vi.fn(() => null);
    const { status } = await call(fixture('felt-off.json'), { authenticate: requireAuth, getDb });
    expect(status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('answers 413 over 16 KB', async () => {
    const big = { ...fixture('felt-off.json'), pad: 'x'.repeat(17_000) };
    expect((await call(big)).status).toBe(413);
  });

  it('answers 400 off schema or bad JSON, before touching storage', async () => {
    const getDb = vi.fn(() => null);
    expect(
      (await call({ ...fixture('summary.json'), rooms: ['voice-123'] }, { getDb })).status
    ).toBe(400);
    expect((await call('{not json', { getDb })).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('answers 403 for a room claimed by someone else, and stores nothing', async () => {
    const { db, docs } = memoryDb();
    const roomHolder = vi.fn(async (_db: unknown, room: string) =>
      room.startsWith('ios-7c6d') ? ('theirs' as const) : ('mine' as const)
    );
    expect((await call(fixture('felt-off.json'), { getDb: () => db, roomHolder })).status).toBe(
      403
    );
    expect(roomHolder).toHaveBeenCalledTimes(2);
    expect(docs.size).toBe(0);
  });

  it('accepts an expired claim, marked roomVerified false', async () => {
    const { db, under } = memoryDb();
    const deps = { getDb: () => db, roomHolder: async () => 'unclaimed' as const };
    expect((await call(fixture('felt-off.json'), deps)).status).toBe(201);
    expect(under('call_felt_off')[0][1].roomVerified).toBe(false);
  });

  it('limits felt-off to 5 a minute per person', async () => {
    const { db } = memoryDb();
    const deps = { getDb: () => db, authenticate: async () => ({ userId: 'busy-uid' }) };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(fixture('felt-off.json'), deps)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('limits felt-off to 20 a day per person across instances (Firestore quota)', async () => {
    const quota = { 'call_felt_off_quota/q-uid': { day: '2026-10-22', count: 20 } };
    const { db, under } = memoryDb(quota);
    const deps = { getDb: () => db, authenticate: async () => ({ userId: 'q-uid' }) };
    expect((await call(fixture('felt-off.json'), deps)).status).toBe(429);
    expect(under('call_felt_off')).toHaveLength(0);
  });
});

/** Every string the stored record may hold, by path ([] for any array index). */
const oneOf = (values: readonly string[]) => (v: string) => values.includes(v);
const re = (pattern: RegExp) => (v: string) => pattern.test(v);
const ALLOWED_STRINGS: Record<string, (v: string) => boolean> = {
  uid: (v) => v === 'walk-uid',
  'rooms[]': re(ROOM_NAME),
  note: () => true, // the one free text: the person's own note, 140 units at most
  status: oneOf(['open']),
  serverVersion: re(/^[\w.-]{1,64}$/),
  'summarySoFar.build.appVersion': re(VERSION),
  'summarySoFar.build.os': re(VERSION),
  'summarySoFar.build.livekit': re(VERSION),
  'summarySoFar.build.deviceModel': re(DEVICE_MODEL),
  'summarySoFar.call.outcome': oneOf(OUTCOMES),
  'summarySoFar.route.routeStart': oneOf(ROUTES),
  'summarySoFar.route.routeEnd': oneOf(ROUTES),
  'summarySoFar.device.thermalStart': oneOf(THERMAL),
  'summarySoFar.device.thermalMax': oneOf(THERMAL),
  'ring.samples[].phase': oneOf(PHASES),
  'ring.samples[].agentState': oneOf(AGENT_STATES),
  'ring.samples[].route': oneOf(ROUTES),
  'ring.samples[].thermal': oneOf(THERMAL),
  'ring.events[].kind': oneOf(EVENT_KINDS),
};

function freeStrings(value: unknown, path = ''): string[] {
  if (typeof value === 'string') {
    return ALLOWED_STRINGS[path]?.(value) ? [] : [`${path}=${JSON.stringify(value)}`];
  }
  if (Array.isArray(value)) return value.flatMap((v) => freeStrings(v, `${path}[]`));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([k, v]) => freeStrings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('the stored felt-off record (the no-free-strings walk)', () => {
  it('holds no string outside the allow-list, and keeps the note', async () => {
    vi.stubEnv('BUILD_SHA', 'abc123');
    const { db, under } = memoryDb();
    const deps = { getDb: () => db, authenticate: async () => ({ userId: 'walk-uid' }) };
    expect((await call(fixture('felt-off.json'), deps)).status).toBe(201);
    const [[, stored]] = under('call_felt_off');
    expect(freeStrings(stored)).toEqual([]);
    expect(stored).toMatchObject({ note: 'cut out twice, then an echo', status: 'open' });
    expect(stored).toMatchObject({ uid: 'walk-uid', appBuild: 57, tapAgainMs: 6400 });
    expect((stored.expiresAt as Date).getTime()).toBe(NOW + FELT_OFF_KEEP_MS);
  });

  it('the walk itself catches a string it does not know', () => {
    expect(freeStrings({ uid: 'walk-uid', deviceName: "Seth's iPhone" })).toEqual([
      'deviceName="Seth\'s iPhone"',
    ]);
    expect(freeStrings({ ring: { events: [{ kind: 'handoff:Maya' }] } })).toHaveLength(1);
  });

  it('stores no note key when the note is blank', async () => {
    const { db, under } = memoryDb();
    expect(
      (await call({ ...fixture('felt-off.json'), note: '   ' }, { getDb: () => db })).status
    ).toBe(201);
    expect(under('call_felt_off')[0][1]).not.toHaveProperty('note');
  });
});
