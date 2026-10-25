/**
 * GET /api/follow-through/upcoming: what Ferni's holding for the signed-in
 * person. Real HTTP through the real engagement router and route; a request
 * nothing claims gets the server's unknown-route 404. Only the token check and
 * the stores are faked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '../../services/follow-through/index.js';
import { followUp } from '../../services/follow-through/__tests__/fixtures.js';

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

const NOW = Date.parse('2026-10-13T16:00:00.000Z');
const at = (hours: number): string => new Date(NOW + hours * 3_600_000).toISOString();
const stores = vi.hoisted(() => ({
  reads: [] as string[],
  rows: new Map<string, FollowUp[]>(),
  failLive: false,
  failForgotten: false,
  forgotten: [] as string[],
}));
vi.mock('../follow-through-upcoming-deps.js', () => ({
  firestoreHoldingDeps: async () => ({
    live: async (userId: string) => {
      stores.reads.push(userId);
      if (stores.failLive) throw new Error('firestore unavailable');
      return stores.rows.get(userId) ?? [];
    },
    forgottenMatcher: async () => {
      if (stores.failForgotten) throw new Error('Forgotten topics unreadable');
      return (text: string) => stores.forgotten.some((t) => text.includes(t));
    },
  }),
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
  vi.stubEnv('FOLLOW_THROUGH_UPCOMING', 'on');
  Object.assign(stores, { reads: [], failLive: false, failForgotten: false, forgotten: [] });
  stores.rows = new Map([
    [
      'uid-A',
      [
        followUp({ id: 'a-undated', userId: 'uid-A', kind: 'thread', dueAt: null }),
        followUp({ id: 'a-soon', userId: 'uid-A', dueAt: at(2), text: 'call the dentist' }),
        followUp({ id: 'a-slipped', userId: 'uid-A', dueAt: at(-3), text: 'take the pills' }),
        followUp({ id: 'a-done', userId: 'uid-A', status: 'done', dueAt: at(1) }),
        followUp({ id: 'a-forgot', userId: 'uid-A', dueAt: at(1), text: 'the divorce papers' }),
        followUp({
          id: 'a-behalf',
          userId: 'uid-A',
          kind: 'promise',
          dueAt: at(4),
          text: 'Call Aunt Linda at 415-555-0132 for you',
          source: { store: 'outreach_confirm', ref: 'ref-1' },
          action: { tool: 'callOnBehalf', contactId: 'contact-abc', waitingOn: 'you' },
        }),
      ],
    ],
    ['uid-B', [followUp({ id: 'b-secret', userId: 'uid-B', dueAt: at(1), text: 'B only' })]],
  ]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type Item = Record<string, unknown> & { id: string };
const get = async (query = '', token: string | null = 'tok-A') => {
  const res = await fetch(`${base}/api/follow-through/upcoming${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  return { res, text, body: JSON.parse(text.startsWith('{') ? text : '{}') as { items?: Item[] } };
};

describe('GET /api/follow-through/upcoming', () => {
  it('flag off: 404, exactly what an unknown path gets, and nothing is read', async () => {
    vi.stubEnv('FOLLOW_THROUGH_UPCOMING', 'off');

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
    vi.stubEnv('FOLLOW_THROUGH_UPCOMING', '');

    expect((await get()).res.status).toBe(404);
  });

  it('401 without a signed-in caller', async () => {
    const { res } = await get('', null);

    expect(res.status).toBe(401);
    expect(stores.reads).toEqual([]);
  });

  it.each(['svc-key-synthetic', 'admin-key-synthetic'])(
    '401 for an API key (%s): it names no one, so nothing is read',
    async (key) => {
      const res = await fetch(`${base}/api/follow-through/upcoming`, {
        headers: { 'x-api-key': key },
      });

      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain('items');
      expect(stores.reads).toEqual([]);
    }
  );

  it("lists the caller's live items: soonest first, slipped flagged, done and forgotten left out", async () => {
    stores.forgotten = ['divorce'];

    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(body.items?.map((i) => [i.id, i.slipped])).toEqual([
      ['a-slipped', true],
      ['a-soon', false],
      ['a-behalf', false],
      ['a-undated', false],
    ]);
    expect(body).toMatchObject({ asOf: new Date(NOW).toISOString() });
  });

  it('reads only the signed-in uid, whatever ?uid= or ?userId= names, even for an admin', async () => {
    const asA = await get('?uid=uid-B&userId=uid-B');
    const asAdmin = await get('?uid=uid-B&userId=uid-B', 'tok-admin');

    expect(stores.reads).toEqual(['uid-A', 'uid-admin']);
    expect(asA.text).not.toContain('b-secret');
    expect(asAdmin.body.items).toEqual([]);
  });

  it('sends only view fields, and no contact, number or contactId for an on-behalf call', async () => {
    const { body, text } = await get();

    for (const item of body.items ?? []) {
      expect(Object.keys(item).sort()).toEqual(
        ['dueAt', 'id', 'kind', 'slipped', 'source', 'status', 'text', 'zone'].sort()
      );
    }
    expect(body.items?.find((i) => i.id === 'a-behalf')).toMatchObject({
      text: 'A call you asked me to make',
      source: 'on-behalf',
    });
    expect(text).not.toMatch(/\d{3}[-. ]?\d{3}[-. ]?\d{4}|contact-|contactId|Linda|ref-1|userId/);
  });

  it('503, never an empty 200, when the store cannot be read', async () => {
    stores.failLive = true;

    const { res, body } = await get();

    expect(res.status).toBe(503);
    expect(body.items).toBeUndefined();
  });

  it('503 when the forgotten topics cannot be read: no risk of showing one', async () => {
    stores.failForgotten = true;

    const { res, body } = await get();

    expect(res.status).toBe(503);
    expect(body.items).toBeUndefined();
  });

  it('an empty list means nothing is open', async () => {
    stores.rows.set('uid-A', []);

    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
  });
});
