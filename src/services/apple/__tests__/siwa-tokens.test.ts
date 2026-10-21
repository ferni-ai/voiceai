/**
 * Sign in with Apple grants (siwa-tokens.ts): the app's authorization code is
 * traded for a refresh token only for the Apple account linked to the caller,
 * kept encrypted, and revoked at Apple on account deletion. Revocation never
 * throws and always forgets the stored grant. Apple is a fake fetch; the
 * client secret is checked against a real P-256 key.
 */
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../tests/helpers/fake-firestore.js';
import {
  SIWA_CLIENT_IDS,
  SIWA_TOKENS_COLLECTION,
  exchangeAuthorizationCode,
  revokeAppleSignIn,
  type SiwaDeps,
} from '../siwa-tokens.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ENV = {
  SIWA_KEY_P8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  SIWA_KEY_ID: 'KEY123',
  SIWA_TEAM_ID: 'TEAM456',
};
const REFRESH = 'r.apple-refresh-token-value';
const NOW = new Date('2026-10-18T12:00:00Z');

const state = newFakeFirestoreState();
const db = createFakeFirestore(state)() as unknown as Firestore;
const stored = () => state.docs.get(`${SIWA_TOKENS_COLLECTION}/alice`);

/** An id_token as Apple's token endpoint returns it (unsigned is fine: it came over TLS). */
const idToken = (sub: string) =>
  ['{"alg":"none"}', JSON.stringify({ sub, iss: 'https://appleid.apple.com' }), '']
    .map((p) => Buffer.from(p).toString('base64url'))
    .join('.');

interface Call {
  url: string;
  form: URLSearchParams;
}
let calls: Call[];
let answer: (url: string) => Promise<Response>;
const fakeFetch = vi.fn(async (url: string, init?: { body?: string }) => {
  calls.push({ url, form: new URLSearchParams(init?.body ?? '') });
  return answer(url);
}) as unknown as typeof fetch;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function deps(over: Partial<SiwaDeps> = {}): SiwaDeps {
  return {
    env: ENV,
    fetch: fakeFetch,
    db,
    appleSubFor: async () => 'apple-sub-alice',
    now: () => NOW,
    ...over,
  };
}

async function verifySecret(secret: string, clientId: string, key: KeyObject = publicKey) {
  expect(decodeProtectedHeader(secret)).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
  const { payload } = await jwtVerify(secret, key, {
    issuer: 'TEAM456',
    subject: clientId,
    audience: 'https://appleid.apple.com',
    currentDate: NOW,
  });
  return payload;
}

beforeEach(() => {
  resetFakeFirestore(state);
  calls = [];
  answer = async (url) =>
    url.endsWith('/auth/token')
      ? json(200, { refresh_token: REFRESH, id_token: idToken('apple-sub-alice') })
      : new Response('', { status: 200 });
  vi.stubEnv('OAUTH_ENCRYPTION_KEY', 'test-encryption-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('exchangeAuthorizationCode', () => {
  it('trades the code with a signed client secret and keeps the refresh token encrypted', async () => {
    expect(stored()).toBeUndefined();

    const result = await exchangeAuthorizationCode('alice', 'code-1', 'native', deps());

    expect(result).toEqual({ stored: true });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe('https://appleid.apple.com/auth/token');
    expect(call.form.get('client_id')).toBe(SIWA_CLIENT_IDS.native);
    expect(call.form.get('grant_type')).toBe('authorization_code');
    expect(call.form.get('code')).toBe('code-1');
    const claims = await verifySecret(call.form.get('client_secret')!, SIWA_CLIENT_IDS.native);
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(300);

    const doc = stored();
    expect(doc?.clientId).toBe('com.sethdford.ferni');
    expect(JSON.stringify(doc)).not.toContain(REFRESH);
  });

  it('uses the web Services ID for the website', async () => {
    await exchangeAuthorizationCode('alice', 'code-1', 'web', deps());
    expect(calls[0].form.get('client_id')).toBe('com.sethdford.ferni.web');
    await verifySecret(calls[0].form.get('client_secret')!, 'com.sethdford.ferni.web');
  });

  it('does nothing without the Sign in with Apple key', async () => {
    const result = await exchangeAuthorizationCode('alice', 'code-1', 'native', deps({ env: {} }));
    expect(result).toEqual({ stored: false, reason: 'not_configured' });
    expect(calls).toEqual([]);
    expect(stored()).toBeUndefined();
  });

  it("won't keep a grant for an Apple account that isn't linked to the caller", async () => {
    const result = await exchangeAuthorizationCode(
      'alice',
      'code-of-someone-else',
      'native',
      deps({ appleSubFor: async () => 'apple-sub-other' })
    );
    expect(result).toEqual({ stored: false, reason: 'not_linked' });
    expect(stored()).toBeUndefined();
  });

  it('keeps nothing when Apple refuses the code', async () => {
    answer = async () => json(400, { error: 'invalid_grant' });
    const result = await exchangeAuthorizationCode('alice', 'stale', 'native', deps());
    expect(result).toEqual({ stored: false, reason: 'rejected' });
    expect(stored()).toBeUndefined();
  });
});

describe('revokeAppleSignIn', () => {
  beforeEach(async () => {
    await exchangeAuthorizationCode('alice', 'code-1', 'native', deps());
    calls = [];
  });

  it('revokes the refresh token at Apple and forgets the grant', async () => {
    expect(stored()).toBeDefined();

    expect(await revokeAppleSignIn('alice', deps())).toBe('revoked');

    expect(calls.map((c) => c.url)).toEqual(['https://appleid.apple.com/auth/revoke']);
    const form = calls[0].form;
    expect(form.get('token')).toBe(REFRESH);
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_id')).toBe(SIWA_CLIENT_IDS.native);
    await verifySecret(form.get('client_secret')!, SIWA_CLIENT_IDS.native);
    expect(stored()).toBeUndefined();
  });

  it('reports failure, without throwing, when Apple refuses; the grant is still forgotten', async () => {
    answer = async () => new Response('', { status: 500 });
    expect(await revokeAppleSignIn('alice', deps())).toBe('failed');
    expect(stored()).toBeUndefined();
  });

  it("doesn't throw when Apple can't be reached", async () => {
    answer = async () => {
      throw new Error('network down');
    };
    expect(await revokeAppleSignIn('alice', deps())).toBe('failed');
    expect(stored()).toBeUndefined();
  });

  it('forgets the grant without calling Apple when the key is not set', async () => {
    expect(await revokeAppleSignIn('alice', deps({ env: {} }))).toBe('not_configured');
    expect(calls).toEqual([]);
    expect(stored()).toBeUndefined();
  });

  it('has nothing to revoke for someone who never sent a code', async () => {
    expect(await revokeAppleSignIn('bob', deps())).toBe('none');
    expect(calls).toEqual([]);
    expect(stored()).toBeDefined();
  });

  it("doesn't throw when Firestore is unavailable", async () => {
    expect(await revokeAppleSignIn('alice', deps({ db: null }))).toBe('failed');
  });
});
