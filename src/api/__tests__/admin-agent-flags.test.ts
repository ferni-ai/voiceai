/**
 * /api/v1/admin/agent-flags: the dev flag switchboard's routes. They exist only on the dev UI
 * server (DEPLOY_ENV=dev); anywhere else every path is a 404 before auth runs and before the
 * LiveKit or Firestore adapters are built. The adapters are injected as fakes here, so no
 * test reaches LiveKit or Firestore. requireAdmin is replaced so a test can choose the admin.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth-middleware.js';
import { bindBodyLimitResponse } from '../bounded-body.js';
import { liveKitDevAgent } from '../../config/agent-flags/adapters/livekit-dev-agent.js';
import { agentFlags } from '../../config/agent-flags/domain/switchable.js';
import type { FlagSnapshot } from '../../config/agent-flags/domain/snapshot.js';
import type { DevAgent } from '../../config/agent-flags/ports/dev-agent.js';
import type { FlagChange, FlagStore } from '../../config/agent-flags/ports/flag-store.js';

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  requireAdmin: auth.requireAdmin,
}));

/** Every line the switchboard logs, so a test can check what reached the logs. */
const logs = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  const at =
    (level: string) =>
    (...args: unknown[]): void => {
      logs.calls.push([level, ...args]);
    };
  function logger(): ReturnType<typeof real.createLogger> {
    return {
      debug: at('debug'),
      info: at('info'),
      warn: at('warn'),
      error: at('error'),
      child: logger,
    };
  }
  return { ...real, createLogger: logger };
});

import { handleAdminAgentFlagsRoutes, type AgentFlagsDeps } from '../v1/admin/agent-flags.js';

const BASE = '/api/v1/admin/agent-flags';
const ADMIN: AuthContext = {
  userId: 'uid-fictional-admin',
  isAdmin: true,
  isDevMode: false,
  authMethod: 'firebase',
  email: 'admin@example.test',
};
/** Fictional credentials on the dev project's host, for the real adapter with fake rooms. */
const LIVEKIT_DEV_ENV = {
  LIVEKIT_URL: 'wss://dev-8sm1ba0z.livekit.cloud',
  LIVEKIT_API_KEY: 'fictional-key',
  LIVEKIT_API_SECRET: 'fictional-secret',
};
const SNAPSHOT: FlagSnapshot = {
  startedAt: '2026-11-16T12:00:00.000Z',
  buildSha: 'abc1234',
  flags: { SOUND_CONDUCTOR: { raw: null, resolved: 'off' } },
};

let ipCounter = 0;
const nextIp = (): string => `198.51.100.${(ipCounter++ % 250) + 1}`;

/** A string body is sent as is (to send bytes that are not JSON); anything else as JSON. */
function request(method: string, path: string, body?: unknown, ip = nextIp()) {
  const text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = {
    host: 'dev.example.test',
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(text)),
  };
  (req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: ip };
  Object.assign(req, { pause: () => req, resume: () => req, destroy: () => req });
  // The body reader listens for 'data'/'end'; send the body once it does.
  const on = req.on.bind(req);
  req.on = ((event: string, listener: (...args: unknown[]) => void) => {
    on(event, listener);
    if (event === 'end') {
      setTimeout(() => {
        if (text) req.emit('data', Buffer.from(text));
        req.emit('end');
      }, 0);
    }
    return req;
  }) as typeof req.on;
  return req;
}

type FakeResponse = ServerResponse & { status?: number; body?: string };

function response(): FakeResponse {
  const state: { status?: number; body?: string; headersSent: boolean } = { headersSent: false };
  const res = Object.assign(state, {
    setHeader: () => res,
    getHeader: () => undefined,
    once: () => res,
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end(chunk?: string) {
      if (typeof chunk === 'string') state.body = chunk;
      return res;
    },
  }) as unknown as FakeResponse;
  return res;
}

function fakes(
  opts: {
    snapshot?: FlagSnapshot | null;
    times?: Record<string, string> | Error;
    rooms?: Array<{ name: string; participants: number }> | Error;
  } = {}
) {
  const changes: FlagChange[] = [];
  const agent: DevAgent = {
    flagSecretTimes: vi.fn(async () => {
      if (opts.times instanceof Error) throw opts.times;
      return opts.times ?? {};
    }),
    occupiedRooms: vi.fn(async () => {
      if (opts.rooms instanceof Error) throw opts.rooms;
      return opts.rooms ?? [];
    }),
    updateFlags: vi.fn(async () => undefined),
  };
  const store: FlagStore = {
    writeSnapshot: vi.fn(async () => undefined),
    readSnapshot: vi.fn(async () => (opts.snapshot === undefined ? SNAPSHOT : opts.snapshot)),
    appendChange: vi.fn(async (c: FlagChange) => {
      changes.push(c);
    }),
    recentChanges: vi.fn(async () => changes),
  };
  const deps: AgentFlagsDeps = { agent: vi.fn(() => agent), store: vi.fn(() => store) };
  return { agent, store, changes, deps };
}

async function call(
  method: string,
  path: string,
  deps: AgentFlagsDeps,
  body?: unknown,
  ip?: string
): Promise<{ handled: boolean; status?: number; json: Record<string, unknown> }> {
  const req = request(method, path, body, ip);
  const res = response();
  bindBodyLimitResponse(req, res);
  const handled = await handleAdminAgentFlagsRoutes(
    req,
    res,
    path,
    new URL(`https://dev.example.test${path}`),
    deps
  );
  return {
    handled,
    status: res.status,
    json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  };
}

const ORIGINAL_DEPLOY_ENV = process.env.DEPLOY_ENV;

beforeEach(() => {
  process.env.DEPLOY_ENV = 'dev';
  auth.requireAdmin.mockReset();
  auth.requireAdmin.mockResolvedValue(ADMIN);
});

afterEach(() => {
  if (ORIGINAL_DEPLOY_ENV === undefined) delete process.env.DEPLOY_ENV;
  else process.env.DEPLOY_ENV = ORIGINAL_DEPLOY_ENV;
});

describe('outside dev', () => {
  it.each([
    ['unset', undefined],
    ['production', 'production'],
    ['a near miss', 'Dev'],
    ['dev with a trailing space', 'dev '],
  ])(
    'answers 404 on every path with DEPLOY_ENV %s, before auth and with no adapter built',
    async (_label, value) => {
      if (value === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = value;
      const f = fakes();
      const paths = [
        ['GET', BASE],
        ['GET', `${BASE}/rooms`],
        ['POST', `${BASE}/apply`],
        ['OPTIONS', `${BASE}/apply`],
      ] as const;
      const body = { set: { SOUND_CONDUCTOR: 'on' }, reset: [] };
      const results = await Promise.all(
        paths.map(([method, path]) => call(method, path, f.deps, body))
      );
      for (const r of results) expect(r).toMatchObject({ handled: true, status: 404 });
      expect(f.deps.agent).not.toHaveBeenCalled();
      expect(f.deps.store).not.toHaveBeenCalled();
      expect(auth.requireAdmin).not.toHaveBeenCalled();
    }
  );

  it('leaves paths that only share the prefix to other handlers', async () => {
    const f = fakes();
    expect((await call('GET', '/api/v1/admin/agent-flagsx', f.deps)).handled).toBe(false);
    expect((await call('GET', '/api/v1/admin/flags', f.deps)).handled).toBe(false);
  });
});

describe('auth', () => {
  it.each([401, 403])('stops when requireAdmin refuses with %i, building nothing', async (code) => {
    auth.requireAdmin.mockImplementation(async (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(code);
      res.end(JSON.stringify({ error: 'refused' }));
      return null;
    });
    const f = fakes();
    const paths = [
      ['GET', BASE],
      ['GET', `${BASE}/rooms`],
      ['POST', `${BASE}/apply`],
    ] as const;
    const body = { set: { SOUND_CONDUCTOR: 'on' }, reset: [] };
    const results = await Promise.all(
      paths.map(([method, path]) => call(method, path, f.deps, body))
    );
    for (const r of results) expect(r).toMatchObject({ handled: true, status: code });
    expect(f.deps.agent).not.toHaveBeenCalled();
    expect(f.deps.store).not.toHaveBeenCalled();
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
  });

  it('rate limits at 30 requests a minute per caller', async () => {
    const f = fakes();
    const ip = '192.0.2.77';
    const statuses: Array<number | undefined> = [];
    for (let i = 0; i < 31; i++) {
      // eslint-disable-next-line no-await-in-loop -- the limiter counts requests in order
      statuses.push((await call('GET', `${BASE}/rooms`, f.deps, undefined, ip)).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('GET /api/v1/admin/agent-flags', () => {
  it('lists every per-file flag with the snapshot and the 20 latest changes', async () => {
    const f = fakes({ times: { SOUND_CONDUCTOR: '2026-11-16T11:59:00Z' } });
    const r = await call('GET', BASE, f.deps);
    expect(r.status).toBe(200);
    expect(r.json.flags).toEqual(JSON.parse(JSON.stringify(agentFlags())));
    expect(r.json.snapshot).toEqual(SNAPSHOT);
    expect(r.json.stale).toBe(false);
    expect(r.json.pendingRestart).toEqual([]);
    expect(r.json.changes).toEqual([]);
    expect(r.json).not.toHaveProperty('warning');
    expect(f.store.recentChanges).toHaveBeenCalledWith(20);
  });

  it('is stale when a flag secret changed after the agent started', async () => {
    const f = fakes({
      times: { SOUND_CONDUCTOR: '2026-11-16T11:00:00Z', ATTUNE_LEDGER: '2026-11-16T12:00:05Z' },
    });
    const r = await call('GET', BASE, f.deps);
    expect(r).toMatchObject({
      status: 200,
      json: { stale: true, pendingRestart: ['ATTUNE_LEDGER'] },
    });
  });

  it('names every switchable flag changed since the agent started, sorted, as pending restart', async () => {
    const f = fakes({
      times: {
        SOUND_CONDUCTOR: '2026-11-16T12:30:00Z',
        ATTUNE_LEDGER: '2026-11-16T11:00:00Z',
        CRISIS_MEANS_IN_HAND: '2026-11-16T12:00:00.001Z',
        LATENCY_ARM_PERCENT: '2026-11-16T13:00:00Z', // numeric config flag: read-only
        ABUSE_DISCLOSURE_PATTERNS: 'not a time',
      },
    });
    const r = await call('GET', BASE, f.deps);
    expect(r.json.pendingRestart).toEqual([
      'ABUSE_DISCLOSURE_PATTERNS',
      'CRISIS_MEANS_IN_HAND',
      'SOUND_CONDUCTOR',
    ]);
  });

  it('is stale with nothing pending when no agent has written a snapshot', async () => {
    const f = fakes({ snapshot: null, times: { SOUND_CONDUCTOR: '2026-11-16T12:30:00Z' } });
    const r = await call('GET', BASE, f.deps);
    expect(r).toMatchObject({
      status: 200,
      json: { snapshot: null, stale: true, pendingRestart: [] },
    });
  });

  it.each([
    ['LIVEKIT_URL is the prod project', { LIVEKIT_URL: 'wss://prod-x.livekit.cloud' }],
    ['LIVEKIT_API_SECRET is missing', { LIVEKIT_API_SECRET: undefined }],
  ])(
    'still shows the flags, as stale with a warning, when %s and no adapter can be built',
    async (_label, env) => {
      const f = fakes();
      const deps = { ...f.deps, agent: () => liveKitDevAgent({ ...LIVEKIT_DEV_ENV, ...env }) };
      const r = await call('GET', BASE, deps);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ snapshot: SNAPSHOT, stale: true, pendingRestart: [] });
      expect(String(r.json.warning)).toMatch(/LiveKit settings/);
      expect((r.json.flags as unknown[]).length).toBe(agentFlags().length);
    }
  );

  it('still shows the flags, as stale with a warning, when LiveKit cannot be read', async () => {
    const f = fakes({ times: new Error('CloudAgent.ListAgentSecrets failed: HTTP 503') });
    const r = await call('GET', BASE, f.deps);
    expect(r.status).toBe(200);
    expect(r.json.stale).toBe(true);
    expect(r.json.pendingRestart).toEqual([]);
    expect(r.json.warning).toEqual(expect.any(String));
    expect(String(r.json.warning)).not.toContain('HTTP 503');
    expect((r.json.flags as unknown[]).length).toBe(agentFlags().length);
  });
});

describe('GET /api/v1/admin/agent-flags/rooms', () => {
  it('lists the occupied rooms', async () => {
    const rooms = [{ name: 'room-fictional-1', participants: 1 }];
    const f = fakes({ rooms });
    const r = await call('GET', `${BASE}/rooms`, f.deps);
    expect(r).toMatchObject({ status: 200, json: { rooms } });
  });

  it('answers 502 without the room service text when the rooms cannot be listed', async () => {
    const f = fakes({ rooms: new Error('twirp internal: fictional-room-service-text') });
    const r = await call('GET', `${BASE}/rooms`, f.deps);
    expect(r.status).toBe(502);
    expect(r.json.error).toEqual(expect.any(String));
    expect(JSON.stringify(r.json)).not.toContain('fictional-room-service-text');
  });

  it('answers 502 after 10 s, not never, when the room service hangs', async () => {
    vi.useFakeTimers();
    try {
      const f = fakes();
      const hung = {
        listRooms: () =>
          new Promise<never>(() => {
            // never settles, like a hung room service
          }),
      };
      const deps = { ...f.deps, agent: () => liveKitDevAgent(LIVEKIT_DEV_ENV, vi.fn(), hung) };
      const answered = vi.fn();
      void call('GET', `${BASE}/rooms`, deps).then(answered);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(answered).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(answered).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('POST /api/v1/admin/agent-flags/apply', () => {
  const BODY = { set: { SOUND_CONDUCTOR: 'on' }, reset: [] };

  it("records the admin's email from requireAdmin as the actor", async () => {
    const f = fakes();
    const r = await call('POST', `${BASE}/apply`, f.deps, BODY);
    expect(r.status).toBe(200);
    expect(r.json.appliedAt).toEqual(expect.any(String));
    expect(r.json).not.toHaveProperty('status');
    expect(f.agent.updateFlags).toHaveBeenCalledWith(BODY);
    expect(f.changes[0]).toMatchObject({ actor: 'admin@example.test', result: 'applied' });
  });

  it("records the admin's uid when requireAdmin has no email", async () => {
    auth.requireAdmin.mockResolvedValue({ ...ADMIN, email: undefined });
    const f = fakes();
    await call('POST', `${BASE}/apply`, f.deps, BODY);
    expect(f.changes[0]?.actor).toBe('uid-fictional-admin');
  });

  it('answers with the use case status: 400 for an invalid body, 409 for an occupied room', async () => {
    const bad = await call('POST', `${BASE}/apply`, fakes().deps, {
      set: {},
      reset: [],
      actor: 'x',
    });
    expect(bad).toMatchObject({ status: 400, json: { errors: expect.any(Array) } });
    const rooms = [{ name: 'room-fictional-2', participants: 3 }];
    const busy = fakes({ rooms });
    const r = await call('POST', `${BASE}/apply`, busy.deps, BODY);
    expect(r).toMatchObject({ status: 409, json: { rooms } });
    expect(busy.agent.updateFlags).not.toHaveBeenCalled();
  });

  it('answers 502 after 10 s, not never, when the room service hangs, and changes nothing', async () => {
    vi.useFakeTimers();
    try {
      const f = fakes();
      const hung = {
        listRooms: () =>
          new Promise<never>(() => {
            // never settles, like a hung room service
          }),
      };
      const rpc = vi.fn();
      const deps = { ...f.deps, agent: () => liveKitDevAgent(LIVEKIT_DEV_ENV, rpc, hung) };
      const answered = vi.fn();
      void call('POST', `${BASE}/apply`, deps, BODY).then(answered);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(answered).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(answered).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }));
      expect(rpc).not.toHaveBeenCalled();
      expect(f.changes[0]).toMatchObject({ result: 'failed' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers 400 for a body that is not JSON', async () => {
    const f = fakes();
    const r = await call('POST', `${BASE}/apply`, f.deps, 'not json!');
    expect(r.status).toBe(400);
    expect(f.agent.occupiedRooms).not.toHaveBeenCalled();
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
  });

  it('refuses a body over 16 KB with 413 and changes nothing', async () => {
    const f = fakes();
    const big = { set: { SOUND_CONDUCTOR: 'on' }, reset: [], pad: 'x'.repeat(17 * 1024) };
    const r = await call('POST', `${BASE}/apply`, f.deps, big);
    expect(r.status).toBe(413);
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
    expect(f.agent.occupiedRooms).not.toHaveBeenCalled();
  });

  it('answers 404 to a path or method it does not serve', async () => {
    const f = fakes();
    expect((await call('GET', `${BASE}/apply`, f.deps)).status).toBe(404);
    expect((await call('POST', BASE, f.deps, BODY)).status).toBe(404);
    expect((await call('GET', `${BASE}/nope`, f.deps)).status).toBe(404);
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
  });
});

/** Every field of every logged value, Errors' message, stack and cause included, as text. */
function dump(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Error
      ? { ...v, name: v.name, message: v.message, stack: v.stack, cause: v.cause }
      : v
  );
}

describe('LiveKit error text stays out of the logs and the replies', () => {
  const LEAK = 'fake-secret-do-not-leak-9002';

  beforeEach(() => {
    logs.calls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs only the method, status, twirp code and error name from the real adapter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ code: 'internal', msg: LEAK }), { status: 500 })
      )
    );
    const failingRooms = {
      listRooms: async (): Promise<never> => {
        throw new Error(`twirp error: ${LEAK}`);
      },
    };
    const f = fakes();
    const deps = {
      ...f.deps,
      agent: () => liveKitDevAgent(LIVEKIT_DEV_ENV, undefined, failingRooms),
    };
    const flags = await call('GET', BASE, deps);
    const rooms = await call('GET', `${BASE}/rooms`, deps);
    expect([flags.status, rooms.status]).toEqual([200, 502]);
    const logged = dump(logs.calls);
    // The failures were logged, by method and code, so the check below can fail.
    expect(logged).toContain('CloudAgent.ListAgentSecrets');
    expect(logged).toContain('internal');
    expect(logged).toContain('RoomService.ListRooms');
    expect(logged).not.toContain(LEAK);
    expect(dump([flags.json, rooms.json])).not.toContain(LEAK);
  });

  it('logs only the error name when any other dev agent fails with text', async () => {
    const f = fakes({ times: new Error(LEAK), rooms: new Error(LEAK) });
    const flags = await call('GET', BASE, f.deps);
    const rooms = await call('GET', `${BASE}/rooms`, f.deps);
    expect([flags.status, rooms.status]).toEqual([200, 502]);
    expect(logs.calls.length).toBeGreaterThanOrEqual(2);
    expect(dump(logs.calls)).not.toContain(LEAK);
  });
});

describe('POST /apply through the real adapter: what LiveKit answered decides the reply', () => {
  const LEAK = 'fake-secret-do-not-leak-9002';
  const BODY = { set: { SOUND_CONDUCTOR: 'on' }, reset: [] };
  const REFUSED = 'LiveKit refused the update; nothing changed';
  const UNCONFIRMED =
    'LiveKit did not confirm; the update may have applied and restarted the agent';
  const noRooms = { listRooms: async (): Promise<never[]> => [] };

  beforeEach(() => {
    logs.calls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function applyAnswered(answer: () => Promise<Response>) {
    const fetchFake = vi.fn(answer);
    vi.stubGlobal('fetch', fetchFake);
    const f = fakes();
    const deps = { ...f.deps, agent: () => liveKitDevAgent(LIVEKIT_DEV_ENV, undefined, noRooms) };
    const r = await call('POST', `${BASE}/apply`, deps, BODY);
    return { ...r, fetches: fetchFake.mock.calls.length, changes: f.changes };
  }

  const json = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });

  it('says nothing changed, with the code, when LiveKit answers a twirp error', async () => {
    const r = await applyAnswered(json(400, { code: 'invalid_argument', msg: LEAK }));
    expect(r.status).toBe(502);
    expect(r.json).toEqual({ error: REFUSED, code: 'invalid_argument' });
    expect(r.fetches).toBe(1);
    expect(r.changes).toEqual([
      expect.objectContaining({
        result: 'failed',
        detail: expect.stringContaining('invalid_argument'),
      }),
    ]);
    expect(dump([logs.calls, r.json, r.changes])).not.toContain(LEAK);
  });

  it.each([
    [
      'times out',
      async (): Promise<Response> => {
        throw new globalThis.DOMException(`timed out ${LEAK}`, 'TimeoutError');
      },
    ],
    [
      'fails on the network',
      async (): Promise<Response> => {
        throw new TypeError(`fetch failed: ${LEAK}`);
      },
    ],
    ['answers 2xx without success', json(200, {})],
    ['answers success false', json(200, { success: false, message: LEAK })],
    [
      'answers 502 that is not JSON',
      async () => new Response(`<html>${LEAK}</html>`, { status: 502 }),
    ],
  ])('says it may have applied when LiveKit %s, and does not retry', async (_label, answer) => {
    const r = await applyAnswered(answer);
    expect(r.status).toBe(502);
    expect(r.json).toEqual({ error: UNCONFIRMED });
    expect(r.fetches).toBe(1);
    expect(r.changes).toEqual([expect.objectContaining({ result: 'failed' })]);
    expect(dump([logs.calls, r.json, r.changes])).not.toContain(LEAK);
  });

  it('logs only the error name when any other dev agent fails the update with text', async () => {
    const f = fakes();
    vi.mocked(f.agent.updateFlags).mockRejectedValue(new Error(LEAK));
    const r = await call('POST', `${BASE}/apply`, f.deps, BODY);
    expect(r).toMatchObject({ status: 502, json: { error: UNCONFIRMED } });
    expect(logs.calls.length).toBeGreaterThanOrEqual(1);
    expect(dump([logs.calls, r.json, f.changes])).not.toContain(LEAK);
  });

  it('logs only the error name when any other dev agent fails the room check with text', async () => {
    const f = fakes({ rooms: new Error(LEAK) });
    const r = await call('POST', `${BASE}/apply`, f.deps, BODY);
    expect(r.status).toBe(502);
    expect(logs.calls.length).toBeGreaterThanOrEqual(1);
    expect(dump([logs.calls, r.json, f.changes])).not.toContain(LEAK);
  });
});

describe('the admin router', () => {
  it('sends /api/v1/admin/agent-flags here, so the prod server answers 404', async () => {
    process.env.DEPLOY_ENV = 'production';
    const { handleAdminRoutes } = await import('../v1/admin/index.js');
    const req = request('GET', BASE);
    const res = response();
    const handled = await handleAdminRoutes(
      req,
      res,
      BASE,
      new URL(`https://x.example.test${BASE}`)
    );
    expect(handled).toBe(true);
    expect(res.status).toBe(404);
  });
});
