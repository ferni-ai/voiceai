/**
 * Passkey registration over real HTTP with a software authenticator: Firebase
 * sign-in only, fresh sign-in and CSRF-safe POSTs, flag-gated.
 *
 * Dispatches like src/servers/api/index.ts (bindVerifiedIdentity, then the
 * route). Token verification and Firestore are faked; WebAuthn verification is
 * the real @simplewebauthn/server.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePasskeysDb } from '../../services/approvals/__tests__/passkeys-fake-db.js';
import { SoftAuthenticator } from '../../services/approvals/__tests__/soft-authenticator.js';

/** token → [uid, signed in seconds ago, auth method] */
const TOKENS: Record<string, [string, number, 'firebase' | 'api_key']> = {
  'alice-fresh': ['alice', 30, 'firebase'],
  'alice-stale': ['alice', 6 * 60, 'firebase'],
  'service-key': ['alice', 30, 'api_key'],
};
const tokenOf = (req: http.IncomingMessage) =>
  (req.headers.authorization ?? '').replace(/^Bearer /, '');

vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  const verify = async (req: http.IncomingMessage) => {
    const entry = TOKENS[tokenOf(req)];
    return entry
      ? { userId: entry[0], isAdmin: false, isDevMode: false, authMethod: entry[2] }
      : null;
  };
  return {
    ...actual,
    optionalAuthAsync: vi.fn(verify),
    requireAuth: vi.fn(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const auth = await verify(req);
      if (!auth) res.writeHead(401).end();
      return auth;
    }),
    rateLimit: vi.fn(() => false),
  };
});

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const entry = TOKENS[token];
    if (!entry) return null;
    const authTime = Math.floor(Date.now() / 1000) - entry[1];
    return { uid: entry[0], isAnonymous: false, claims: { admin: false, auth_time: authTime } };
  }),
}));

const fake = fakePasskeysDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handlePasskeyRoutes } = await import('../passkey-routes.js');

let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    await bindVerifiedIdentity(req);
    const url = new URL(req.url || '/', 'http://local');
    if (!(await handlePasskeyRoutes(req, res, url.pathname))) res.writeHead(418).end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

beforeEach(() => {
  fake.docs.clear();
  vi.stubEnv('APPROVALS_PAGE', 'on');
  vi.stubEnv('APPROVALS_PASSKEYS', 'on');
  vi.stubEnv('WEBAUTHN_ORIGINS', 'https://app.ferni.ai');
});
afterEach(() => vi.unstubAllEnvs());

function call(path: string, token: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function register(device = new SoftAuthenticator()) {
  const optionsRes = await call('/api/passkeys/register/options', 'alice-fresh', {});
  expect(optionsRes.status).toBe(200);
  const { options } = (await optionsRes.json()) as {
    options: { challenge: string; rp: { id: string } };
  };
  return call('/api/passkeys/register/verify', 'alice-fresh', {
    response: device.register(options),
  });
}

describe('passkey registration', () => {
  it('registers a passkey and lists it without key material', async () => {
    const device = new SoftAuthenticator();
    const res = await register(device);
    expect(res.status).toBe(200);
    const list = (await (await call('/api/passkeys', 'alice-fresh')).json()) as {
      passkeys: Array<Record<string, unknown>>;
    };
    expect(list.passkeys).toHaveLength(1);
    expect(list.passkeys[0]).toMatchObject({ id: device.id });
    expect(list.passkeys[0]).not.toHaveProperty('publicKey');
    expect(list.passkeys[0]).not.toHaveProperty('counter');
  });

  it('refuses a second passkey for now (adding one will need the first)', async () => {
    await register();
    const res = await call('/api/passkeys/register/options', 'alice-fresh', {});
    expect(res.status).toBe(409);
  });

  it('needs a sign-in from the last 5 minutes', async () => {
    const res = await call('/api/passkeys/register/options', 'alice-stale', {});
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('REAUTH_REQUIRED');
  });

  it('refuses cross-site requests', async () => {
    const form = await call(
      '/api/passkeys/register/options',
      'alice-fresh',
      {},
      { 'content-type': 'text/plain' }
    );
    const foreign = await call(
      '/api/passkeys/register/options',
      'alice-fresh',
      {},
      { origin: 'https://evil.example' }
    );
    expect(form.status).toBe(403);
    expect(foreign.status).toBe(403);
  });

  it('answers 404 to a service API key, and to everything while a flag is off', async () => {
    expect((await call('/api/passkeys', 'service-key')).status).toBe(404);
    vi.stubEnv('APPROVALS_PASSKEYS', '');
    expect((await call('/api/passkeys', 'alice-fresh')).status).toBe(404);
    vi.stubEnv('APPROVALS_PASSKEYS', 'on');
    vi.stubEnv('APPROVALS_PAGE', '');
    expect((await call('/api/passkeys', 'alice-fresh')).status).toBe(404);
  });

  it('refuses a response that does not verify', async () => {
    const optionsRes = await call('/api/passkeys/register/options', 'alice-fresh', {});
    const { options } = (await optionsRes.json()) as {
      options: { challenge: string; rp: { id: string } };
    };
    const res = await call('/api/passkeys/register/verify', 'alice-fresh', {
      response: new SoftAuthenticator().register(options, { origin: 'https://evil.example' }),
    });
    expect(res.status).toBe(400);
    expect(fake.docs.size).toBe(0);
  });
});
