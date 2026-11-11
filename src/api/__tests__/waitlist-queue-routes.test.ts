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
    unchecked: false, // the token's account couldn't be checked (Auth down, token-revocation.ts)
    store: null as unknown,
  },
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async () => {
    if (world.unchecked)
      throw Object.assign(new Error('unchecked'), { code: 'auth/revocation-check-unavailable' });
    return world.token
      ? { uid: 'u1', isAnonymous: false, claims: {}, expiresAt: 0, ...world.token }
      : null;
  },
  isVerifiedToken: (t: unknown) => !!t && typeof t === 'object' && 'uid' in t,
}));
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => ({}),
}));
vi.mock('../../services/waitlist/store.js', () => ({ firestoreWaitlistStore: () => world.store }));

const { handleWaitlistQueueRoutes } = await import('../waitlist-queue-routes.js');
const { waitlistRateLimit } = await import('../waitlist-rate-limits.js');

async function call(method: 'GET' | 'POST', path: string, body?: unknown) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    url: path,
    method,
    headers: { host: 'localhost', ...(world.token ? { authorization: 'Bearer a.b.c' } : {}) },
  });
  let status = 0;
  let headers: Record<string, string> = {};
  let text = '';
  const res = {
    writeHead: (s: number, h?: Record<string, string>) => void ((status = s), (headers = h ?? {})),
    end: (b: string) => void (text = b),
  };
  const handled = await handleWaitlistQueueRoutes(req as never, res as never, path);
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { handled, status, headers, body: parsed };
}

let s: ReturnType<typeof memoryStore>;
beforeEach(() => {
  s = memoryStore();
  world.store = s.store;
  world.token = null;
  world.unchecked = false;
});

describe('waitlist queue routes', () => {
  it("answers 503 with Retry-After, never 401, when the token's account couldn't be checked", async () => {
    world.token = { email: 'pat@example.com', emailVerified: true };
    world.unchecked = true;
    for (const [method, path] of [
      ['GET', '/api/waitlist/me'],
      ['POST', '/api/waitlist/join'],
    ] as const) {
      const { status, headers } = await call(method, path, {});
      expect(status).toBe(503);
      expect(headers['Retry-After']).toBe('5');
    }
  });

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

  it('/join needs a sign-in too: an anonymous or unproven join is refused and writes nothing', async () => {
    expect((await call('POST', '/api/waitlist/join', { email: 'new@example.com' })).status).toBe(
      401
    );
    world.token = { email: 'pat@example.com', emailVerified: false };
    expect((await call('POST', '/api/waitlist/join', {})).status).toBe(401);
    expect(s.docs.size).toBe(0);
  });

  it('the address comes from the token, never the body', async () => {
    world.token = { email: 'pat@example.com', emailVerified: true };
    await call('POST', '/api/waitlist/join', { email: 'victim@example.com' });
    expect([...s.docs.values()].map((d) => d.email)).toEqual(['pat@example.com']);
  });

  it('refuses a throwaway inbox with a warm message', async () => {
    world.token = { email: 'x@yopmail.com', emailVerified: true };
    const out = await call('POST', '/api/waitlist/join', {});
    expect(out).toMatchObject({ status: 400, body: { error: 'disposable_email' } });
    expect(s.docs.size).toBe(0);
  });

  it('/me finds your entry by your sign-in (uid) even if the address spelling changed', async () => {
    world.token = { email: 'old@example.com', emailVerified: true };
    await call('POST', '/api/waitlist/join', {});
    world.token = { email: 'new@example.com', emailVerified: true }; // same uid u1
    expect((await call('GET', '/api/waitlist/me')).body).toMatchObject({ status: 'waiting', position: 1 }); // prettier-ignore
  });

  it('/join shares the tight sign-up rate limit', () => {
    expect(waitlistRateLimit('/api/waitlist/join')).toEqual({ maxRequests: 5, keyPrefix: 'waitlist:signup' }); // prettier-ignore
    expect(waitlistRateLimit('/api/waitlist/me').keyPrefix).not.toBe('waitlist:signup');
  });

  it('leaves other paths alone', async () => {
    expect((await call('GET', '/api/waitlist/check')).handled).toBe(false);
  });
});
