/**
 * The protections the route tests can't see, because they inject a fake room
 * reader: the real roomClaimHolder (an expired claim, even your own, verifies
 * nothing), the daily quota read inside its transaction (concurrent submits at
 * the cap can't both pass), and the note never reaching a log or stderr.
 * Firestore is faked with optimistic concurrency: a transaction whose reads
 * changed before commit is retried, as Firestore does. Adapted from the #2520
 * verifier probe (B3, D1, C1).
 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logged } = vi.hoisted(() => ({ logged: [] as string[] }));
// Every logger the route creates records each call (args serialized), then logs for real.
vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  type Obj = Record<string | symbol, unknown>;
  const wrap = (name: string, real: Obj): Obj =>
    new Proxy(real, {
      get(t, k) {
        const v = t[k];
        if (typeof v !== 'function' || typeof k !== 'string') return v;
        return (...args: unknown[]) => {
          logged.push(
            `${name}.${k} ${JSON.stringify(args, (_k, x) => (x instanceof Error ? String(x) : x))}`
          );
          const out = (v as (...a: unknown[]) => unknown).apply(t, args);
          return k === 'child' ? wrap(name, out as Obj) : out;
        };
      },
    });
  const create = actual.createLogger as (o: unknown) => Obj;
  return { ...actual, createLogger: (opts: unknown) => wrap(JSON.stringify(opts), create(opts)) };
});

import { handleCallTelemetryRoutes, type CallTelemetryDeps } from '../call-telemetry-routes.js';
import { roomClaimHolder } from '../../../servers/api/routes/token-room-claim.js';
import { takeReplyReportQuota } from '../../reply-reports/reply-report-quota.js';
import { QUOTA_COLLECTION } from '../call-telemetry-store.js';

const fixture = (): Record<string, unknown> & { rooms: string[] } =>
  JSON.parse(readFileSync(new URL('./fixtures/felt-off.json', import.meta.url), 'utf8'));
const NOW = Date.UTC(2026, 9, 22, 12);
const SENTINEL = 'SENTINEL-NOTE-zq9x';
type Doc = Record<string, unknown>;

/** Firestore fake: random yields, and transactions validated against what they read. */
function occDb(seed: Record<string, Doc> = {}, opts: { failSet?: boolean } = {}) {
  const docs = new Map<string, Doc>(Object.entries(seed));
  const ver = new Map<string, number>();
  let next = 0;
  const tick = () =>
    new Promise<void>((r) => {
      setTimeout(r, Math.random() * 3);
    });
  const ref = (path: string) => ({
    id: path.split('/')[1],
    path,
    get: async () => {
      await tick();
      const d = docs.get(path);
      return { data: () => (d ? { ...d } : undefined), exists: !!d };
    },
    set: async (d: Doc) => {
      await tick();
      // An error that echoes the document, as a client library's could
      if (opts.failSet) throw new Error(`14 UNAVAILABLE writing ${JSON.stringify(d)}`);
      docs.set(path, d);
      ver.set(path, (ver.get(path) ?? 0) + 1);
    },
  });
  const db = {
    collection: (name: string) => ({ doc: (id = `doc${++next}`) => ref(`${name}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const reads = new Map<string, number>();
        const writes: [string, Doc][] = [];
        const tx = {
          get: async (r: { path: string; get: () => Promise<unknown> }) => {
            reads.set(r.path, ver.get(r.path) ?? 0);
            return r.get();
          },
          set: (r: { path: string }, d: Doc) => void writes.push([r.path, d]),
        };
        const out = await fn(tx);
        await tick();
        if ([...reads].every(([p, v]) => (ver.get(p) ?? 0) === v)) {
          for (const [p, d] of writes) {
            docs.set(p, d);
            ver.set(p, (ver.get(p) ?? 0) + 1);
          }
          return out;
        }
      }
      throw new Error('ABORTED');
    },
  };
  const under = (c: string) => [...docs].filter(([p]) => p.startsWith(`${c}/`)).map(([, d]) => d);
  return { db: db as never, docs, under };
}

const roomDoc = (room: string) => `livekit_room_claims/${Buffer.from(room).toString('base64url')}`;

let seq = 0;
/** One POST through the real route, with the real room reader. */
async function post(body: unknown, deps: Partial<CallTelemetryDeps> = {}) {
  const req = Object.assign(new EventEmitter(), {
    url: '/api/call-telemetry',
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: `198.51.100.${(seq % 250) + 1}` },
    pause: () => {},
    resume: () => {},
    destroy: () => {},
  });
  let status = 0;
  let out = '';
  const res = {
    headersSent: false,
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: (b?: unknown) => void (out += b ? String(b) : ''),
  };
  const uid = `uid-${++seq}`;
  const done = handleCallTelemetryRoutes(req as never, res as never, '/api/call-telemetry', {
    authenticate: async () => ({ userId: uid }),
    getDb: () => null,
    now: () => NOW,
    mode: () => 'reports',
    roomHolder: roomClaimHolder,
    recordSummary: async () => {},
    ...deps,
  });
  void Promise.resolve().then(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  await done;
  return { status, out };
}

describe('roomClaimHolder, the real reader', () => {
  const ROOM = 'ios-00000000-0000-4000-8000-000000000001';
  const holder = (claim: Doc | undefined, uid = 'me') =>
    roomClaimHolder(occDb(claim ? { [roomDoc(ROOM)]: claim } : {}).db, ROOM, uid, NOW);

  it('a live claim is mine for its uid and theirs for anyone else', async () => {
    expect(await holder({ uid: 'me', expiresAtMs: NOW + 1 })).toBe('mine');
    expect(await holder({ uid: 'victim', expiresAtMs: NOW + 1 })).toBe('theirs');
  });

  it('an expired claim is unclaimed, whoever held it', async () => {
    expect(await holder({ uid: 'victim', expiresAtMs: NOW })).toBe('unclaimed');
    expect(await holder({ uid: 'me', expiresAtMs: NOW - 1 })).toBe('unclaimed');
  });

  it('no claim is unclaimed', async () => {
    expect(await holder(undefined)).toBe('unclaimed');
  });

  it('through the route: an expired claim, even your own, is stored roomVerified false', async () => {
    const f = fixture();
    const claims = (uid: string, expiresAtMs: number) =>
      Object.fromEntries(f.rooms.map((r) => [roomDoc(r), { uid, expiresAtMs }]));
    const own = occDb(claims('owner', NOW - 1));
    const asOwner = { getDb: () => own.db, authenticate: async () => ({ userId: 'owner' }) };
    expect((await post(f, asOwner)).status).toBe(201);
    expect(own.under('call_felt_off')[0]).toMatchObject({ uid: 'owner', roomVerified: false });

    const theirs = occDb(claims('victim', NOW - 1));
    expect((await post(f, { getDb: () => theirs.db })).status).toBe(201);
    expect(theirs.under('call_felt_off')[0]).toMatchObject({ roomVerified: false });

    const live = occDb(claims('owner', NOW + 1000));
    expect((await post(f, { ...asOwner, getDb: () => live.db })).status).toBe(201);
    expect(live.under('call_felt_off')[0]).toMatchObject({ roomVerified: true });
  });
});

describe('the daily quota is taken in its transaction', () => {
  it('40 concurrent takes at a limit of 20 grant exactly 20', async () => {
    const o = occDb();
    const granted = await Promise.all(
      Array.from({ length: 40 }, () =>
        takeReplyReportQuota(o.db, 'c-uid', NOW, 20, QUOTA_COLLECTION)
      )
    );
    expect(granted.filter(Boolean)).toHaveLength(20);
    expect(o.docs.get(`${QUOTA_COLLECTION}/c-uid`)).toMatchObject({ count: 20 });
  });

  it('two concurrent takes with one report left grant one', async () => {
    const o = occDb({ [`${QUOTA_COLLECTION}/u`]: { day: '2026-10-22', count: 19 } });
    const granted = await Promise.all([
      takeReplyReportQuota(o.db, 'u', NOW, 20, QUOTA_COLLECTION),
      takeReplyReportQuota(o.db, 'u', NOW, 20, QUOTA_COLLECTION),
    ]);
    expect(granted.filter(Boolean)).toHaveLength(1);
  });
});

describe('the note never reaches a log', () => {
  let captured: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const tee = (orig: typeof origOut): typeof origOut =>
    ((c: unknown, ...a: unknown[]) => {
      captured.push(String(c));
      return (orig as (...x: unknown[]) => boolean)(c, ...a);
    }) as typeof origOut;
  beforeEach(() => {
    logged.length = 0;
    captured = [];
    process.stdout.write = tee(origOut);
    process.stderr.write = tee(origErr);
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, m).mockImplementation(
        (...a) => void captured.push(a.map(String).join(' '))
      );
  });
  afterEach(() => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    vi.restoreAllMocks();
  });

  it('on the 201, 500, 429 and 400 paths, in logs, stdout, stderr and error bodies', async () => {
    const note = `${SENTINEL} call cut`;
    let o = occDb();
    expect((await post({ ...fixture(), note }, { getDb: () => o.db })).status).toBe(201);
    expect(o.under('call_felt_off')[0]?.note).toBe(note); // stored, so it was really sent
    o = occDb({}, { failSet: true });
    const r500 = await post({ ...fixture(), note }, { getDb: () => o.db });
    expect(r500.status).toBe(500);
    o = occDb({ [`${QUOTA_COLLECTION}/q`]: { day: '2026-10-22', count: 20 } });
    const asQ = { getDb: () => o.db, authenticate: async () => ({ userId: 'q' }) };
    expect((await post({ ...fixture(), note }, asQ)).status).toBe(429);
    const r400 = await post(
      { ...fixture(), note: SENTINEL + 'x'.repeat(140) },
      { getDb: () => o.db }
    );
    expect(r400.status).toBe(400);

    expect(logged.length).toBeGreaterThan(0); // the capture saw the route's own lines
    expect(r400.out + r500.out).not.toContain(SENTINEL);
    expect([...logged, ...captured].join('\n')).not.toContain(SENTINEL);
  });
});
