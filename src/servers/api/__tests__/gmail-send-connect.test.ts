/**
 * "Send email as me" consent (GMAIL_SEND_AS_USER): the OAuth URL asks Google
 * for gmail.send and nothing broader, the shared /auth/google/callback stores
 * the grant only for gmail_send states, and calendar connects are untouched.
 *
 * Real HTTP through bindVerifiedIdentity and the REAL route handlers. Mocked:
 * Firebase token verification, Google's token endpoint (fetch), Firestore (an
 * in-memory persistence store) and the calendar token save.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
  OAUTH_ENCRYPTION_KEY: 'test-key',
});

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));
const docs = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock('../../../services/persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    const col = docs.get(collection) ?? new Map<string, unknown>();
    docs.set(collection, col);
    return {
      load: async (uid: string) => col.get(uid) ?? null,
      get: async (uid: string) => col.get(uid) ?? null,
      setImmediate: async (uid: string, data: unknown) => void col.set(uid, data),
      delete: async (uid: string) => void col.delete(uid),
      shutdown: async () => undefined,
    };
  },
}));
const savedCalendar = vi.hoisted(() => vi.fn(async (_uid: string, _tokens: unknown) => undefined));
vi.mock('../../token/oauth/google-calendar.js', () => ({ saveTokens: savedCalendar }));
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel: vi.fn(async () => null),
  stopAllUserChannels: vi.fn(async () => undefined),
}));

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleOAuthStartRoute } = await import('../routes/oauth-start.js');
const { handleGmailSendRoutes } = await import('../routes/gmail-send.js');
const { handleGoogleCalendarRoutes } = await import('../routes/google-calendar.js');
const { setOAuthLinkStore } = await import('../../token/oauth-link-state.js');
const { decryptData } = await import('../../../utils/token-encryption.js');

const realFetch = globalThis.fetch;
const idToken = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
let tokenResponse: Record<string, unknown> = {};
let base = '';
let server: Server;

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new globalThis.Response(JSON.stringify(tokenResponse));
    }
    return realFetch(input, init);
  });
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (await handleOAuthStartRoute(req, res, url.pathname)) return;
      if (await handleGmailSendRoutes(req, res, url.pathname, url)) return;
      if (await handleGoogleCalendarRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404);
      res.end();
    })();
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
  process.env.GMAIL_SEND_AS_USER = 'on';
  setOAuthLinkStore(null);
  for (const col of docs.values()) col.clear();
  savedCalendar.mockClear();
  tokenResponse = {
    access_token: 'user-at',
    refresh_token: 'user-rt',
    expires_in: 3600,
    scope:
      'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send',
    id_token: idToken({ email: 'sam@gmail.com', email_verified: true }),
  };
});

const send = (path: string, init: Parameters<typeof fetch>[1] = {}) =>
  realFetch(`${base}${path}`, { redirect: 'manual', ...init });

/** start → login: the cookie and the Google URL the login redirects to. */
async function startAndLogin(provider: string) {
  const start = await send('/auth/oauth/start', {
    method: 'POST',
    headers: { authorization: 'Bearer tok-A', 'content-type': 'application/json' },
    body: JSON.stringify({ provider, returnUrl: '/settings' }),
  });
  if (!start.ok) return { status: start.status, cookie: '', google: null };
  const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
  const { url } = (await start.json()) as { url: string };
  const login = await send(url, { headers: { cookie } });
  return { status: login.status, cookie, google: new URL(login.headers.get('location') ?? '') };
}

const storedGrant = (uid: string) => {
  const doc = docs.get('gmail_send_tokens')?.get(uid) as { encrypted: string } | undefined;
  return doc
    ? decryptData<{ email: string; refresh_token: string; scope: string }>(doc.encrypted)
    : null;
};

describe('gmail.send consent', () => {
  it('asks Google for gmail.send plus openid/email, nothing broader', async () => {
    const { google } = await startAndLogin('gmail_send');
    const scopes = google?.searchParams.get('scope')?.split(' ');
    expect(google?.origin).toBe('https://accounts.google.com');
    expect(scopes).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/gmail.send']);
    expect(google?.searchParams.get('include_granted_scopes')).toBeNull();
    expect(google?.searchParams.get('client_id')).toBe('g-id');
  });

  it('is refused at the start while the flag is off, with no state minted', async () => {
    process.env.GMAIL_SEND_AS_USER = 'off';
    const { status } = await startAndLogin('gmail_send');
    expect(status).toBe(503);
  });

  it('stores the grant, encrypted, for the user who started the flow', async () => {
    expect(storedGrant('uid-A')).toBeNull();
    const { google, cookie } = await startAndLogin('gmail_send');
    const state = google?.searchParams.get('state') ?? '';
    const cb = await send(`/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    });
    expect(cb.headers.get('location')).toBe('/settings?gmail_send=connected');
    expect(storedGrant('uid-A')).toMatchObject({
      email: 'sam@gmail.com',
      refresh_token: 'user-rt',
    });
    const raw = (docs.get('gmail_send_tokens')?.get('uid-A') as { encrypted: string }).encrypted;
    expect(raw).not.toContain('user-rt');
    expect(savedCalendar).not.toHaveBeenCalled();
  });

  it('stores nothing when the user unticks gmail.send on the consent screen', async () => {
    tokenResponse.scope = 'openid https://www.googleapis.com/auth/userinfo.email';
    const { google, cookie } = await startAndLogin('gmail_send');
    const state = google?.searchParams.get('state') ?? '';
    const cb = await send(`/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    });
    expect(cb.headers.get('location')).toBe('/settings?gmail_send_error=scope_not_granted');
    expect(storedGrant('uid-A')).toBeNull();
  });

  it('leaves calendar connects to the calendar handler on the shared callback', async () => {
    const { google, cookie } = await startAndLogin('google_calendar');
    expect(google?.searchParams.get('scope')).not.toContain('gmail');
    const state = google?.searchParams.get('state') ?? '';
    await send(`/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    });
    expect(savedCalendar).toHaveBeenCalledWith('uid-A', expect.anything());
    expect(storedGrant('uid-A')).toBeNull();
  });

  it('reports and disconnects the grant for the signed-in user', async () => {
    const { google, cookie } = await startAndLogin('gmail_send');
    const state = google?.searchParams.get('state') ?? '';
    await send(`/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    });
    const auth = { authorization: 'Bearer tok-A' };
    const before = await send('/auth/google/gmail-send/status', { headers: auth });
    expect(await before.json()).toMatchObject({ connected: true, email: 'sam@gmail.com' });
    await send('/auth/google/gmail-send/disconnect', { method: 'POST', headers: auth });
    expect(storedGrant('uid-A')).toBeNull();
  });
});
