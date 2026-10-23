/**
 * POST /api/me/focus (ENGAGEMENT-SPEC 3.3, PR F1). Real HTTP through the real
 * engagement router and route; a request nothing claims gets the server's
 * unknown-route 404. Only the token check and Firestore are faked: the store
 * keeps one bogle_users doc per uid in memory and runs the real nextFocus.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersonFlagLookup } from '../../config/person-flag.js';
import { zonedWallTimeToUtc } from '../../utils/time-zone.js';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token.slice(4)}`, claims: {} } : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
}));

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../services/messaging/focus-store.js', async () => {
  const { focusFromDoc, nextFocus } = await import('../../services/messaging/focus.js');
  const { prefsFromDoc } = await import('../../services/messaging/prefs.js');
  return {
    firestoreFocusStore: {
      save: async (userId: string, post: never, now: Date) => {
        const doc = docs.get(userId);
        const prefs = (doc?.messagingPrefs ?? {}) as Record<string, unknown>;
        const next = nextFocus(focusFromDoc(prefs.focus), post, now, prefsFromDoc(doc).zone);
        if (next !== 'too-many-devices')
          docs.set(userId, { ...doc, messagingPrefs: { ...prefs, focus: next } });
        return next;
      },
    },
  };
});

const { handleEngagementRoutes } = await import('../engagement-routes.js');

const NY = 'America/New_York';
const at = (day: number, hour: number): Date =>
  zonedWallTimeToUtc({ year: 2026, month: 10, day, hour, minute: 0 }, NY);

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
  vi.useFakeTimers({ toFake: ['Date'], now: at(14, 23) });
  vi.stubEnv('FOCUS_HOLD', 'on');
  docs.clear();
  docs.set('uid-A', { messagingPrefs: { zone: NY } });
});

const focus = (body: unknown, token: string | null = 'tok-A'): Promise<Response> =>
  fetch(`${base}/api/me/focus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const SLEEP = { held: true, kind: 'sleep', holdCheckIns: true, remindersThrough: true };
const savedFocus = (uid: string): Record<string, unknown> | undefined =>
  (docs.get(uid)?.messagingPrefs as { focus?: Record<string, unknown> } | undefined)?.focus;

describe('POST /api/me/focus', () => {
  it('flag off: 404, like any unknown path, and nothing is saved', async () => {
    vi.stubEnv('FOCUS_HOLD', 'off');
    const res = await focus({ ...SLEEP, deviceId: 'iphone' });
    expect(res.status).toBe(404);
    expect(savedFocus('uid-A')).toBeUndefined();
  });

  it('env off but on for this person (their cohort): the route answers', async () => {
    vi.stubEnv('FOCUS_HOLD', 'off');
    usePersonFlagLookup(async (uid, flag) =>
      uid === 'uid-A' && flag === 'FOCUS_HOLD' ? 'on' : undefined
    );
    try {
      expect((await focus({ ...SLEEP, deviceId: 'iphone' })).status).toBe(200);
      expect((await focus({ ...SLEEP, deviceId: 'iphone' }, 'tok-B')).status).toBe(404);
    } finally {
      usePersonFlagLookup(async () => undefined);
    }
  });

  it('Sleep at 23:00 ET is held, capped at 10:00 ET', async () => {
    const res = await focus({ ...SLEEP, deviceId: 'iphone' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      held: true,
      kind: 'sleep',
      remindersThrough: true,
      capUntil: at(15, 10).toISOString(),
    });
    expect(savedFocus('uid-A')).toMatchObject({ held: true, capUntil: at(15, 10).toISOString() });
  });

  it('two devices: the iPad clearing while the iPhone holds keeps the hold', async () => {
    await focus({ ...SLEEP, deviceId: 'iphone' });
    await focus({ ...SLEEP, deviceId: 'ipad' });
    const ipadOff = await focus({ ...SLEEP, held: false, deviceId: 'ipad' });
    expect(await ipadOff.json()).toMatchObject({ held: true });
    const phoneOff = await focus({ ...SLEEP, held: false, deviceId: 'iphone' });
    expect(await phoneOff.json()).toEqual({ held: false, kind: 'sleep', remindersThrough: true });
  });

  it('device ids are stored only as hashes', async () => {
    await focus({ ...SLEEP, deviceId: 'my-iphone-serial' });
    expect(JSON.stringify(savedFocus('uid-A'))).not.toContain('my-iphone-serial');
  });

  it('only the verified caller: no token is 401', async () => {
    expect((await focus({ ...SLEEP, deviceId: 'iphone' }, null)).status).toBe(401);
    expect(savedFocus('uid-A')).toBeUndefined();
  });

  it('a bad body is 400 and saves nothing', async () => {
    expect((await focus({ ...SLEEP, kind: 'nap', deviceId: 'iphone' })).status).toBe(400);
    expect((await focus('{not json')).status).toBe(400);
    expect(savedFocus('uid-A')).toBeUndefined();
  });

  it('GET is not the route', async () => {
    const res = await fetch(`${base}/api/me/focus`, { headers: { Authorization: 'Bearer tok-A' } });
    expect(res.status).toBe(404);
  });
});
