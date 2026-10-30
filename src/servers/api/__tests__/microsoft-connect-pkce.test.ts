/**
 * OUTLOOK_CONNECT over real HTTP: POST /auth/oauth/start -> /auth/microsoft/login ->
 * /auth/microsoft/callback. The login sends an S256 PKCE challenge and only the three
 * calendar scopes; the callback sends the matching verifier, which only the browser
 * that started the flow can produce (its HttpOnly binding cookie), and the grant lands
 * sealed. Flag off: the login URL is what it was (no PKCE, the old scopes).
 *
 * Real: identity binding, link state, routes, outlook-link, the shared store over the
 * Firestore fake. Mocked: Firebase token verification and Microsoft's token endpoint.
 */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

Object.assign(process.env, {
  MICROSOFT_CLIENT_ID: 'fixture-client',
  MICROSOFT_CLIENT_SECRET: 'fixture-secret',
  OAUTH_ENCRYPTION_KEY: 'fixture-outlook-key-0123456789',
});

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));
const state = newMergeFakeState();
const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
fake.db = createMergeFakeFirestore(state);

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleOAuthStartRoute } = await import('../routes/oauth-start.js');
const { handleMicrosoftCalendarRoutes } = await import('../routes/microsoft-calendar.js');
const { setOAuthLinkStore, pkceVerifierFor } = await import('../../token/oauth-link-state.js');

const realFetch = globalThis.fetch;
const tokenCalls: URLSearchParams[] = [];
let base = '';
let server: Server;

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/token')) {
      tokenCalls.push(new URLSearchParams(String(init?.body)));
      return new globalThis.Response(
        JSON.stringify({
          access_token: 'at-fixture',
          refresh_token: 'rt-fixture',
          expires_in: 3600,
        })
      );
    }
    return realFetch(input, init);
  });
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (await handleOAuthStartRoute(req, res, url.pathname)) return;
      if (await handleMicrosoftCalendarRoutes(req, res, url.pathname, url)) return;
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
  setOAuthLinkStore(null);
  tokenCalls.length = 0;
  state.docs.clear();
  process.env.OUTLOOK_CONNECT = 'on';
});
afterEach(() => {
  delete process.env.OUTLOOK_CONNECT;
});

const send = (path: string, init: Parameters<typeof fetch>[1] = {}) =>
  realFetch(`${base}${path}`, { redirect: 'manual', ...init });

async function startAndLogin() {
  const res = await send('/auth/oauth/start', {
    method: 'POST',
    headers: { authorization: 'Bearer tok-A', 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'microsoft_calendar' }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const { url } = (await res.json()) as { url: string };
  const state = new URL(url, base).searchParams.get('state') ?? '';
  const login = await send(url, { headers: { cookie } });
  return { cookie, state, login, authorize: new URL(login.headers.get('location') ?? 'x:/') };
}

describe('Outlook connect with OUTLOOK_CONNECT on', () => {
  it('login sends an S256 challenge and the three calendar scopes', async () => {
    const { login, authorize } = await startAndLogin();
    expect(login.status).toBe(302);
    expect(authorize.pathname).toBe('/common/oauth2/v2.0/authorize');
    expect(authorize.searchParams.get('scope')).toBe(
      'offline_access User.Read Calendars.ReadWrite'
    );
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('the callback sends the verifier of that challenge and stores the grant sealed', async () => {
    const { cookie, state: st, authorize } = await startAndLogin();
    const cb = await send(`/auth/microsoft/callback?code=c1&state=${encodeURIComponent(st)}`, {
      headers: { cookie },
    });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toMatch(/calendar=outlook&status=connected$/);
    const verifier = tokenCalls[0]?.get('code_verifier') ?? '';
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      authorize.searchParams.get('code_challenge')
    );
    const raw = JSON.stringify(state.docs.get('bogle_users/uid-A/outlook_tokens/data'));
    expect(raw).toContain('encrypted');
    expect(raw).not.toContain('at-fixture');
    expect(raw).not.toContain('rt-fixture');
  });

  it('a callback from another browser stores nothing (no cookie, no verifier, no state)', async () => {
    const { state: st } = await startAndLogin();
    const cb = await send(`/auth/microsoft/callback?code=c1&state=${encodeURIComponent(st)}`);
    expect(cb.headers.get('location')).toBe('/?calendar_error=invalid_state');
    expect(tokenCalls).toHaveLength(0);
    expect(state.docs.size).toBe(0);
  });

  it('status reports the link, and unlink deletes the sealed grant', async () => {
    const { cookie, state: st } = await startAndLogin();
    await send(`/auth/microsoft/callback?code=c1&state=${encodeURIComponent(st)}`, {
      headers: { cookie },
    });
    const auth = { headers: { authorization: 'Bearer tok-A' } };
    const before = (await (await send('/auth/microsoft/status', auth)).json()) as Record<
      string,
      unknown
    >;
    expect(before).toMatchObject({ linked: true });
    await send('/auth/microsoft/unlink', { method: 'POST', ...auth });
    expect(state.docs.has('bogle_users/uid-A/outlook_tokens/data')).toBe(false);
    const after = (await (await send('/auth/microsoft/status', auth)).json()) as Record<
      string,
      unknown
    >;
    expect(after).toMatchObject({ linked: false });
  });
});

describe('unlink', () => {
  const doc = 'bogle_users/uid-A/outlook_tokens/data';
  const unlink = () =>
    send('/auth/microsoft/unlink', { method: 'POST', headers: { authorization: 'Bearer tok-A' } });

  it('a delete that fails answers 500 and keeps nothing hidden; with the flag off it still deletes', async () => {
    const { cookie, state: st } = await startAndLogin();
    await send(`/auth/microsoft/callback?code=c1&state=${encodeURIComponent(st)}`, {
      headers: { cookie },
    });
    state.failWrites.add(doc);
    const failed = await unlink();
    state.failWrites.clear();
    expect(failed.status).toBe(500);
    expect(((await failed.json()) as { error: string }).error).toMatch(/Couldn't disconnect/);
    expect(state.docs.has(doc)).toBe(true);

    delete process.env.OUTLOOK_CONNECT;
    expect((await unlink()).status).toBe(200);
    expect(state.docs.has(doc)).toBe(false);
  });
});

describe('pkce verifier', () => {
  const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as never;
  const a = `__session=${'a'.repeat(43)}`;
  const b = `__session=${'b'.repeat(43)}`;
  it('depends on the browser cookie, not only the state, and needs our cookie', () => {
    expect(pkceVerifierFor(req(a), 's1')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pkceVerifierFor(req(a), 's1')).toBe(pkceVerifierFor(req(a), 's1'));
    expect(pkceVerifierFor(req(a), 's1')).not.toBe(pkceVerifierFor(req(b), 's1'));
    expect(pkceVerifierFor(req(a), 's1')).not.toBe(pkceVerifierFor(req(a), 's2'));
    expect(pkceVerifierFor(req(), 's1')).toBeNull();
  });
});

describe('flag off', () => {
  it('login is unchanged: old scopes, no PKCE', async () => {
    delete process.env.OUTLOOK_CONNECT;
    const { authorize } = await startAndLogin();
    expect(authorize.searchParams.get('scope')).toBe(
      'openid profile offline_access User.Read Calendars.ReadWrite'
    );
    expect(authorize.searchParams.has('code_challenge')).toBe(false);
  });
});
