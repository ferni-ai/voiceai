/**
 * Outreach and premium writes act on the verified caller, never on a userId the
 * body names.
 *
 * These routes took `body.userId` as given from any signed-in user, so user A could:
 * - point user B's outreach texts and emails at A's own phone (POST /api/outreach/contact),
 * - send B an SMS/email/call worded by A (POST /api/outreach/test/send),
 * - rewrite the context Ferni uses to message B (POST /api/outreach/context),
 * - register B for outreach (POST /api/outreach/register),
 * - overwrite B's premium preferences and "Our Song" list (POST /api/premium/*).
 *
 * Each test sends a real HTTP request, with a Bearer token, through the REAL route
 * handler and the REAL auth middleware. Only Firebase token verification and the
 * outreach data/delivery services are mocked; premium uses its real in-memory store,
 * so "B's data is untouched" is read back from that store.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tokens: Record<string, { uid: string; admin?: boolean }> = {
  'tok-A': { uid: 'uid-A' },
  'tok-admin': { uid: 'admin-1', admin: true },
};
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const t = tokens[token];
    return t ? { uid: t.uid, claims: { admin: t.admin === true }, isAnonymous: false } : null;
  }),
}));

const outreach = vi.hoisted(() => ({
  registerUserForOutreach: vi.fn(),
  updateUserContext: vi.fn(),
  setUserContactInfo: vi.fn(async () => undefined),
  textUser: vi.fn(async () => ({ success: true })),
  emailUser: vi.fn(async () => ({ success: true })),
  callUser: vi.fn(async () => ({ success: true })),
  createVerificationCode: vi.fn(async () => ({ code: '123456', expiresAt: 0 })),
}));
vi.mock('../../services/outreach/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/index.js')>()),
  registerUserForOutreach: outreach.registerUserForOutreach,
  updateUserContext: outreach.updateUserContext,
}));
vi.mock('../../tools/domains/proactive/outreach/index.js', () => ({
  setUserContactInfo: outreach.setUserContactInfo,
  textUser: outreach.textUser,
  emailUser: outreach.emailUser,
  callUser: outreach.callUser,
}));
vi.mock('../../services/trust-and-identity/verification-store.js', () => ({
  createVerificationCode: outreach.createVerificationCode,
  verifyCode: vi.fn(async () => ({ valid: true })),
}));

const { handleOutreachRoutes } = await import('../outreach.routes.js');
const { handlePremiumRoutes } = await import('../routes/premium-routes.js');
const { getUserPreferences } = await import('../../services/premium/premium-content.js');
const { getOurSongs } = await import('../../services/musical-you/our-song.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void (async () => {
      if (url.pathname.startsWith('/api/premium/')) {
        await handlePremiumRoutes(req, res, url.pathname, url.searchParams);
      } else {
        await handleOutreachRoutes(req, res, url.pathname, url);
      }
    })();
  });
  await new Promise<void>((r) => {
    server.listen(0, r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => vi.clearAllMocks());

const post = (path: string, body: unknown, token?: string) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

/** Outreach writes, the service each drives, and the user argument it received. */
const outreachWrites = [
  {
    path: '/api/outreach/contact',
    body: { phone: '+15550001111' },
    service: outreach.setUserContactInfo,
  },
  {
    path: '/api/outreach/test/send',
    body: { channel: 'sms', message: 'hi' },
    service: outreach.textUser,
  },
  {
    path: '/api/outreach/context',
    body: { context: { recentTopics: ['x'] } },
    service: outreach.updateUserContext,
  },
  { path: '/api/outreach/register', body: {}, service: outreach.registerUserForOutreach },
  {
    path: '/api/outreach/verify-phone',
    body: { phone: '+15550001111' },
    service: outreach.createVerificationCode,
  },
];

describe.each(outreachWrites)('POST $path', ({ path, body, service }) => {
  it('refuses user A naming user B, and never touches B', async () => {
    const res = await post(path, { ...body, userId: 'uid-B' }, 'tok-A');
    expect(res.status).toBe(403);
    expect(service).not.toHaveBeenCalled();
  });

  it('acts on the signed-in caller when they name themselves', async () => {
    const res = await post(path, { ...body, userId: 'uid-A' }, 'tok-A');
    expect(res.status).toBe(200);
    expect(service).toHaveBeenCalledTimes(1);
    expect((service.mock.calls[0] as unknown[])[0]).toBe('uid-A');
  });

  it('lets an admin act for the user they name', async () => {
    const res = await post(path, { ...body, userId: 'uid-B' }, 'tok-admin');
    expect(res.status).toBe(200);
    expect((service.mock.calls[0] as unknown[])[0]).toBe('uid-B');
  });

  it('refuses a request with no verified identity', async () => {
    const res = await post(path, { ...body, userId: 'uid-B' });
    expect(res.status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });
});

describe('premium writes', () => {
  it('refuses A overwriting B’s preferences and leaves B’s untouched', async () => {
    const before = JSON.stringify(getUserPreferences('uid-B'));
    const res = await post(
      '/api/premium/preferences',
      { userId: 'uid-B', favoriteTopics: ['hijacked'] },
      'tok-A'
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(getUserPreferences('uid-B'))).toBe(before);
  });

  it('saves the caller’s own preferences', async () => {
    const res = await post('/api/premium/preferences', { favoriteTopics: ['sleep'] }, 'tok-A');
    expect(res.status).toBe(200);
    expect(getUserPreferences('uid-A').favoriteTopics).toEqual(['sleep']);
  });

  it('refuses A adding to B’s Our Song list; A’s own add lands on A', async () => {
    const song = { trackName: 'Harvest Moon', artistName: 'Neil Young' };
    const denied = await post('/api/premium/our-songs', { ...song, userId: 'uid-B' }, 'tok-A');
    expect(denied.status).toBe(403);
    expect(getOurSongs('uid-B')).toHaveLength(0);

    const own = await post('/api/premium/our-songs', song, 'tok-A');
    expect(own.status).toBe(200);
    expect(getOurSongs('uid-A').map((s) => s.trackName)).toContain('Harvest Moon');
  });

  it.each([
    ['/api/premium/engagement', { contentId: 'c1', contentType: 'video' }],
    ['/api/premium/our-songs/designate', { trackName: 't', artistName: 'a' }],
    ['/api/premium/our-songs/played', { songId: 's1' }],
  ])('%s refuses a body naming another user', async (path, body) => {
    const res = await post(path, { ...body, userId: 'uid-B' }, 'tok-A');
    expect(res.status).toBe(403);
  });
});
