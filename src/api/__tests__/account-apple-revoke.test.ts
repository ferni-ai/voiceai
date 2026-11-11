/**
 * Sign in with Apple and account deletion (App Store 5.1.1(v)):
 * - POST /api/account/apple-authorization trades the app's code for a grant
 *   kept for the verified caller (no-op without the Sign in with Apple key);
 * - DELETE /api/account revokes that grant at Apple, and the deletion still
 *   succeeds when Apple can't be reached.
 * Real routes and real siwa-tokens over the shared fake Firestore; Apple is a
 * stubbed fetch, and the token verifier, data sweep, linked-record sweeps and
 * Firebase user calls are doubles.
 */
import { generateKeyPairSync } from 'node:crypto';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);
const firebase = vi.hoisted(() => ({ deleted: [] as string[] }));

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers['x-api-key'] === 'service-key') {
      return { userId: 'api-user', isAdmin: false, authMethod: 'api_key' };
    }
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer verified-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: match[1], firebaseUid: match[1], isAdmin: false, authMethod: 'firebase' };
  }),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../services/data-export.js', () => ({
  getDataExportService: () => ({ deleteAllData: vi.fn(async () => undefined) }),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  setFirebaseUserDisabled: vi.fn(async () => 'done' as const),
  getFirebaseUserOrThrow: vi.fn(async () => null),
  deleteFirebaseUser: vi.fn(async (uid: string) => {
    firebase.deleted.push(uid);
    return true;
  }),
  getFirebaseUser: vi.fn(async (uid: string) => ({
    providerData: [{ providerId: 'apple.com', uid: `apple-sub-${uid}` }],
  })),
}));
vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/push-endpoint-owners.js', () => ({
  erasePushRecordsFor: vi.fn(async () => undefined),
}));
vi.mock('../../servers/token/oauth-link-state.js', () => ({
  deleteOAuthLinkStatesFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/billing/apple-signed-data.js', () => ({
  tombstoneTransactionOwnersFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/musical-you/social.js', () => ({
  eraseMusicalSocialData: vi.fn(async () => undefined),
}));
vi.mock('../../services/social/challenges.js', () => ({
  eraseSocialChallengesFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/social/leaderboards.js', () => ({
  eraseSocialStatsFor: vi.fn(async () => undefined),
}));

const { handleAccountRoutes } = await import('../account-routes.js');

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const REFRESH = 'r.apple-refresh-token-value';
const idToken = (sub: string) =>
  ['{"alg":"none"}', JSON.stringify({ sub }), '']
    .map((p) => Buffer.from(p).toString('base64url'))
    .join('.');

let appleCalls: Array<{ url: string; form: URLSearchParams }>;
let appleDown: boolean;

function request(
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string>
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function call(method: string, path: string, body: unknown, headers: Record<string, string>) {
  const sent = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    end: vi.fn((data?: string) => {
      sent.body = JSON.parse(data || '{}') as Record<string, unknown>;
    }),
  } as unknown as ServerResponse;
  await handleAccountRoutes(request(method, path, body, headers), res, path);
  return sent;
}

const as = (uid: string) => ({ authorization: `Bearer verified-${uid}` });
const authorize = (uid: string, body: unknown = { authorizationCode: 'code-1' }) =>
  call('POST', '/api/account/apple-authorization', body, as(uid));
const deleteAccount = (uid: string) =>
  call('DELETE', '/api/account', { confirmation: 'DELETE_MY_ACCOUNT' }, as(uid));
const grantOf = (uid: string) => fake.docs.get(`apple_signin_tokens/${uid}`);

beforeEach(() => {
  resetFakeFirestore(fake);
  firebase.deleted = [];
  appleCalls = [];
  appleDown = false;
  vi.stubEnv('OAUTH_ENCRYPTION_KEY', 'test-encryption-key');
  vi.stubEnv('SIWA_KEY_P8', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  vi.stubEnv('SIWA_KEY_ID', 'KEY123');
  vi.stubEnv('SIWA_TEAM_ID', 'TEAM456');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      appleCalls.push({ url, form: new URLSearchParams(init?.body ?? '') });
      if (appleDown) throw new Error('network down');
      if (url.endsWith('/auth/token')) {
        const sub = 'apple-sub-alice';
        return new Response(JSON.stringify({ refresh_token: REFRESH, id_token: idToken(sub) }));
      }
      return new Response('', { status: 200 });
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/account/apple-authorization', () => {
  it('keeps the grant for the verified caller', async () => {
    expect(grantOf('alice')).toBeUndefined();
    const sent = await authorize('alice');
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ stored: true });
    expect(grantOf('alice')).toBeDefined();
  });

  it("refuses to keep alice's Apple grant for bob", async () => {
    const sent = await authorize('bob');
    expect(sent.status).toBe(403);
    expect(grantOf('bob')).toBeUndefined();
  });

  it('answers stored: false without the Sign in with Apple key, and calls nobody', async () => {
    vi.stubEnv('SIWA_KEY_P8', '');
    const sent = await authorize('alice');
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ stored: false, reason: 'not_configured' });
    expect(appleCalls).toEqual([]);
  });

  it('refuses a service API key and a missing code', async () => {
    const byKey = await call(
      'POST',
      '/api/account/apple-authorization',
      { authorizationCode: 'code-1' },
      { 'x-api-key': 'service-key' }
    );
    expect(byKey.status).toBe(403);
    expect((await authorize('alice', {})).status).toBe(400);
    expect((await authorize('alice', { authorizationCode: 'c', client: 'tv' })).status).toBe(400);
    expect(appleCalls).toEqual([]);
  });
});

describe('DELETE /api/account and Sign in with Apple', () => {
  it("revokes the person's Apple grant, then deletes the account", async () => {
    await authorize('alice');
    appleCalls = [];

    const sent = await deleteAccount('alice');

    expect(sent.status).toBe(200);
    expect(sent.body.success).toBe(true);
    expect(appleCalls.map((c) => c.url)).toEqual(['https://appleid.apple.com/auth/revoke']);
    expect(appleCalls[0].form.get('token')).toBe(REFRESH);
    expect(grantOf('alice')).toBeUndefined();
    expect(firebase.deleted).toEqual(['alice']);
    expect(sent.body.details).toMatchObject({ appleSignIn: 'revoked' });
  });

  it("still deletes the account when Apple can't be reached", async () => {
    await authorize('alice');
    appleDown = true;

    const sent = await deleteAccount('alice');

    expect(sent.status).toBe(200);
    expect(sent.body.success).toBe(true);
    expect(firebase.deleted).toEqual(['alice']);
    expect(sent.body.details).toMatchObject({ appleSignIn: 'failed' });
    expect(grantOf('alice')).toBeUndefined();
  });
});
