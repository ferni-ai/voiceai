/**
 * GET /api/on-it: "Ferni's on it" for the signed-in person. Real HTTP through
 * the real engagement router and route; a request nothing claims gets the
 * server's unknown-route 404. Only the token check and the stores are faked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Errand } from '../../services/errands/index.js';
import type { FollowUp } from '../../services/follow-through/index.js';
import {
  NEVER_SHOWN,
  NOW,
  changedFollowUps,
  liveFollowUps,
  openErrands,
} from '../../services/on-it/__tests__/fixtures.js';

// Read once when auth-middleware loads, so set before the router is imported.
vi.hoisted(() => {
  process.env.API_KEYS = 'svc-key-synthetic';
  process.env.ADMIN_API_KEYS = 'admin-key-synthetic';
});

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: { admin: token === 'tok-admin' } }
      : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
}));

const routeLog = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'on-it-route' ? routeLog : actual.createLogger(bindings),
  };
});

const stores = vi.hoisted(() => ({
  reads: [] as string[],
  live: new Map<string, FollowUp[]>(),
  changed: new Map<string, FollowUp[]>(),
  errands: new Map<string, Errand[]>() as Map<string, Errand[]> | null,
  fail: '' as '' | 'live' | 'changed' | 'errands' | 'forgotten',
  /** When set, the live read throws an error whose message is this text. */
  failMessage: '',
}));
vi.mock('../on-it-deps.js', () => ({
  firestoreOnItDeps: async () => {
    const read = <T>(name: typeof stores.fail, value: T): T => {
      if (stores.fail === name) throw new Error(`${name} unavailable`);
      return value;
    };
    return {
      live: async (userId: string) => {
        stores.reads.push(userId);
        if (stores.failMessage) throw new Error(stores.failMessage);
        return read('live', stores.live.get(userId) ?? []);
      },
      changed: async (userId: string) => read('changed', stores.changed.get(userId) ?? []),
      openErrands: async (userId: string) =>
        read('errands', stores.errands ? (stores.errands.get(userId) ?? []) : null),
      forgottenMatcher: async () => read('forgotten', (text: string) => text.includes('divorce')),
    };
  },
}));

const { handleEngagementRoutes } = await import('../engagement-routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleEngagementRoutes(req, res, url.pathname, url).then((handled) => {
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubEnv('FERNI_ON_IT', 'on');
  stores.reads = [];
  stores.fail = '';
  stores.failMessage = '';
  for (const fn of Object.values(routeLog)) fn.mockClear();
  stores.live = new Map([
    ['uid-A', liveFollowUps('uid-A')],
    ['uid-B', liveFollowUps('uid-B').map((f) => ({ ...f, text: `B secret ${f.id}` }))],
  ]);
  stores.changed = new Map([['uid-A', changedFollowUps('uid-A')]]);
  stores.errands = new Map([['uid-A', openErrands('uid-A')]]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

interface Body {
  sections?: Array<{ id: string; rows: Array<{ id: string }> }>;
  error?: string;
}
const get = async (query = '', token: string | null = 'tok-A') => {
  const res = await fetch(`${base}/api/on-it${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  return { res, text, body: JSON.parse(text.startsWith('{') ? text : '{}') as Body };
};

describe('GET /api/on-it', () => {
  it('flag off: 404, exactly what an unknown path gets, and nothing is read', async () => {
    vi.stubEnv('FERNI_ON_IT', 'off');

    const off = await get();
    const unknown = await fetch(`${base}/api/no-such-route`, {
      headers: { authorization: 'Bearer tok-A' },
    });

    expect(off.res.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(off.text).toBe(await unknown.text());
    expect(stores.reads).toEqual([]);
  });

  it('flag unset is off', async () => {
    vi.stubEnv('FERNI_ON_IT', '');

    expect((await get()).res.status).toBe(404);
  });

  it('401 without a signed-in caller, and nothing is read', async () => {
    const { res } = await get('', null);

    expect(res.status).toBe(401);
    expect(stores.reads).toEqual([]);
  });

  it.each(['svc-key-synthetic', 'admin-key-synthetic'])(
    '401 for an API key (%s): it names no one, so nothing is read',
    async (key) => {
      const res = await fetch(`${base}/api/on-it`, { headers: { 'x-api-key': key } });

      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain('sections');
      expect(stores.reads).toEqual([]);
    }
  );

  it("the caller's four sections, with no contact detail, recipient or tool id", async () => {
    const { res, body, text } = await get();

    expect(res.status).toBe(200);
    expect(body.sections?.map((s) => s.id)).toEqual(['waitingOnYou', 'doing', 'holding', 'done']);
    for (const secret of NEVER_SHOWN) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/divorce|userId|uid-/);
  });

  it('reads only the signed-in uid, whatever ?uid= or ?userId= names, even for an admin', async () => {
    const asA = await get('?uid=uid-B&userId=uid-B');
    const asAdmin = await get('?uid=uid-B&userId=uid-B', 'tok-admin');

    expect(stores.reads).toEqual(['uid-A', 'uid-admin']);
    expect(asA.text).not.toContain('B secret');
    expect(asAdmin.res.status).toBe(200);
    expect(asAdmin.body.sections).toEqual([]);
  });

  it.each(['live', 'changed', 'errands'] as const)(
    '503, never an empty 200, when the %s store throws',
    async (which) => {
      stores.fail = which;

      const { res, body } = await get();

      expect(res.status).toBe(503);
      expect(body.sections).toBeUndefined();
      expect(body.error).toBe("Couldn't load this right now");
    }
  );

  it('503 when the forgotten topics cannot be read: no risk of showing one', async () => {
    stores.fail = 'forgotten';

    const { res, body } = await get();

    expect(res.status).toBe(503);
    expect(body.sections).toBeUndefined();
  });

  it("a failed read logs the error's class, never the item text its message quotes", async () => {
    const sentinel = 'SENTINEL pick up the biopsy results';
    stores.live.set('uid-A', [{ ...liveFollowUps('uid-A')[0], text: sentinel }]);
    stores.failMessage = `could not decode row: ${sentinel}`;

    const { res } = await get();

    expect(res.status).toBe(503);
    expect(routeLog.error).toHaveBeenCalledTimes(1);
    expect(routeLog.error.mock.calls[0]?.[0]).toMatchObject({ error: 'Error' });
    const logged = Object.values(routeLog).flatMap((fn) => fn.mock.calls);
    expect(JSON.stringify(logged)).not.toContain('SENTINEL');
  });

  it('errands off: 200 without the doing section', async () => {
    stores.errands = null;

    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(body.sections?.map((s) => s.id)).toEqual(['waitingOnYou', 'holding', 'done']);
  });

  it('an empty view means nothing is held or doing', async () => {
    stores.live.set('uid-A', []);
    stores.changed.set('uid-A', []);
    stores.errands?.set('uid-A', []);

    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(body.sections).toEqual([]);
  });
});
