/**
 * GET /api/waitlist/me and POST /api/waitlist/join over HTTP: sign-in rules,
 * the contract shape, and that a join without a sign-in never reveals a place.
 */
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../../services/waitlist/__tests__/memory-store.js';

const { world } = vi.hoisted(() => ({
  world: {
    token: null as null | { email: string; emailVerified: boolean },
    store: null as unknown,
  },
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async () =>
    world.token
      ? { uid: 'u1', isAnonymous: false, claims: {}, expiresAt: 0, ...world.token }
      : null,
  isVerifiedToken: (t: unknown) => !!t && typeof t === 'object' && 'uid' in t,
}));
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => ({}),
}));
vi.mock('../../services/waitlist/store.js', () => ({ firestoreWaitlistStore: () => world.store }));

const { handleWaitlistQueueRoutes } = await import('../waitlist-queue-routes.js');

async function call(method: 'GET' | 'POST', path: string, body?: unknown) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    url: path,
    method,
    headers: { host: 'localhost', ...(world.token ? { authorization: 'Bearer a.b.c' } : {}) },
  });
  let status = 0;
  let text = '';
  const res = { writeHead: (s: number) => void (status = s), end: (b: string) => void (text = b) };
  const handled = await handleWaitlistQueueRoutes(req as never, res as never, path);
  return { handled, status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

let s: ReturnType<typeof memoryStore>;
beforeEach(() => {
  s = memoryStore();
  world.store = s.store;
  world.token = null;
});

describe('waitlist queue routes', () => {
  it('/me needs a sign-in with a verified email', async () => {
    expect((await call('GET', '/api/waitlist/me')).status).toBe(401);
    world.token = { email: 'pat@example.com', emailVerified: false };
    expect((await call('GET', '/api/waitlist/me')).status).toBe(401);
  });

  it('a signed-in join puts you in line, and /me answers in the contract shape', async () => {
    world.token = { email: 'Pat@Example.com', emailVerified: true };
    const joined = await call('POST', '/api/waitlist/join', {});
    expect(joined).toMatchObject({ status: 200, body: { status: 'waiting', position: 1, wavesAway: 1 } }); // prettier-ignore
    const me = await call('GET', '/api/waitlist/me');
    expect(me.body).toEqual(joined.body);
    expect(Object.keys(me.body).sort()).toEqual(['admittedAt', 'foundingMember', 'foundingWave', 'nextWaveAt', 'position', 'referralUrl', 'referrals', 'seatExpiresAt', 'status', 'wavesAway']); // prettier-ignore
  });

  it('a join without a sign-in is unverified and reveals nothing about who is on the list', async () => {
    world.token = { email: 'pat@example.com', emailVerified: true };
    await call('POST', '/api/waitlist/join', {});
    world.token = null;
    const probe = await call('POST', '/api/waitlist/join', { email: 'pat@example.com' });
    expect(probe.body).toMatchObject({ status: 'waiting', position: null, referralUrl: null });
    const stranger = await call('POST', '/api/waitlist/join', { email: 'new@example.com' });
    expect(stranger.body).toEqual(probe.body);
    expect((await s.store.get(Buffer.from('new@example.com').toString('base64').replace(/[/+=]/g, '_')))?.verified).toBe(false); // prettier-ignore
  });

  it('refuses a throwaway inbox with a warm message', async () => {
    const out = await call('POST', '/api/waitlist/join', { email: 'x@yopmail.com' });
    expect(out).toMatchObject({ status: 400, body: { error: 'disposable_email' } });
    expect(s.docs.size).toBe(0);
  });

  it('leaves other paths alone', async () => {
    expect((await call('GET', '/api/waitlist/check')).handled).toBe(false);
  });
});
