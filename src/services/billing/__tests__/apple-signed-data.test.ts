/**
 * App Store signed data is verified with Apple's library and bound to one user.
 *
 * The webhook used to base64-decode notifications and act on them unverified,
 * and /api/apple/verify took any userId. Now:
 * - the REAL webhook route + REAL notification handler run Apple's
 *   SignedDataVerifier against Apple's recorded test fixtures, with Apple's test
 *   CA as the trusted root (as Apple's own tests do). Only the profile store is
 *   mocked. Forged, unchained and wrong-bundle payloads get 401 and change nothing.
 * - claimAppleTransaction binds a verified purchase to the first user who claims
 *   its originalTransactionId; anyone else gets 403. Firestore is mocked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { CompactSign, generateKeyPair } from 'jose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLE_TEST_CA,
  MISSING_X5C_NOTIFICATION,
  SIGNED_TRANSACTION_MODEL,
  TEST_NOTIFICATION,
  TRANSACTION_INFO,
  WRONG_BUNDLE_ID_NOTIFICATION,
} from './apple-store.fixtures.js';

// Trust Apple's TEST root instead of Apple Root CA - G3; everything else is real.
vi.mock('../apple-root-certs.js', async () => ({
  APPLE_ROOT_CERTIFICATES: [(await import('./apple-store.fixtures.js')).APPLE_TEST_CA],
}));

const store = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock('../../../memory/store-factory.js', () => ({ getStore: async () => store }));

/** In-memory stand-in for Firestore's create()/get()/set()/where() on one collection. */
const owners = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const firestore = vi.hoisted(() => ({ available: true }));
vi.mock('../../../utils/firestore-utils.js', () => {
  const doc = (id: string) => ({
    create: async (data: Record<string, unknown>) => {
      if (owners.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      owners.set(id, data);
    },
    set: async (data: Record<string, unknown>) => {
      owners.set(id, data);
    },
    delete: async () => {
      owners.delete(id);
    },
    get: async () => ({ data: () => owners.get(id) }),
  });
  return {
    getFirestoreDb: () =>
      firestore.available
        ? {
            collection: () => ({
              doc,
              where: (field: string, _op: '==', value: unknown) => ({
                get: async () => ({
                  docs: [...owners]
                    .filter(([, data]) => data[field] === value)
                    .map(([id]) => ({ id, ref: doc(id) })),
                }),
              }),
            }),
          }
        : null,
  };
});

let handleAppleRoutes: typeof import('../../../api/apple-iap-routes.js').handleAppleRoutes;
let signedData: typeof import('../apple-signed-data.js');

beforeAll(async () => {
  vi.stubEnv('APPLE_ISSUER_ID', 'issuer');
  vi.stubEnv('APPLE_KEY_ID', 'key');
  vi.stubEnv('APPLE_PRIVATE_KEY', 'unused-for-signed-receipts');
  vi.stubEnv('APPLE_ENVIRONMENT', 'Sandbox');
  vi.stubEnv('APPLE_BUNDLE_ID', 'com.example');
  vi.stubEnv('APPLE_ONLINE_CHECKS', 'false'); // no OCSP for Apple's test CA
  signedData = await import('../apple-signed-data.js');
  ({ handleAppleRoutes } = await import('../../../api/apple-iap-routes.js'));
});

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Apple's real test chain in the header, but the payload re-signed by an attacker key. */
async function resign(jws: string, payload: object): Promise<string> {
  const header = JSON.parse(Buffer.from(jws.split('.')[0], 'base64url').toString());
  const { privateKey } = await generateKeyPair('ES256');
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader(header)
    .sign(privateKey);
}

function postWebhook(signedPayload: string) {
  const req = Readable.from([JSON.stringify({ signedPayload })]) as unknown as IncomingMessage;
  Object.assign(req, { method: 'POST', url: '/api/apple/webhook', headers: {} });
  let status = 0;
  const res = {
    writeHead: (code: number) => ((status = code), res),
    setHeader: () => res,
    end: () => undefined,
  } as unknown as ServerResponse;
  return handleAppleRoutes(req, res).then(() => status);
}

describe('POST /api/apple/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const victim = { id: 'victim', subscription: { appleOriginalTransactionId: 'otx-1' } };
    store.listProfiles.mockResolvedValue([victim]);
    store.getProfile.mockResolvedValue(victim);
  });

  it('rejects an unsigned notification and changes nothing', async () => {
    const forged = `${b64u({ alg: 'ES256' })}.${b64u({ notificationType: 'DID_RENEW' })}.sig`;
    expect(await postWebhook(forged)).toBe(401);
    expect(store.saveProfile).not.toHaveBeenCalled();
  });

  it("rejects Apple's test chain carrying a payload signed by another key", async () => {
    const forged = await resign(TEST_NOTIFICATION, {
      notificationType: 'DID_RENEW',
      data: { bundleId: 'com.example', environment: 'Sandbox', appAppleId: 1234 },
    });
    expect(await postWebhook(forged)).toBe(401);
    expect(store.saveProfile).not.toHaveBeenCalled();
  });

  it('rejects a notification with no certificate chain', async () => {
    expect(await postWebhook(MISSING_X5C_NOTIFICATION)).toBe(401);
  });

  it('rejects a genuinely signed notification for another bundle id', async () => {
    expect(await postWebhook(WRONG_BUNDLE_ID_NOTIFICATION)).toBe(401);
  });

  it('accepts a genuinely signed notification for our app', async () => {
    expect(await postWebhook(TEST_NOTIFICATION)).toBe(200);
  });
});

describe('claimAppleTransaction', () => {
  /** Apple's own LocalTesting helper verifier: decodes and checks bundle id + environment. */
  const appleTestHelper = new SignedDataVerifier(
    [APPLE_TEST_CA],
    false,
    Environment.LOCAL_TESTING,
    'com.example',
    1234
  );
  let purchase = '';

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256'); // Apple's createSignedDataFromJson does the same
    purchase = await new CompactSign(
      new TextEncoder().encode(JSON.stringify(SIGNED_TRANSACTION_MODEL))
    )
      .setProtectedHeader({ alg: 'ES256' })
      .sign(privateKey);
  });
  beforeEach(() => {
    owners.clear();
    firestore.available = true;
  });

  it("without a token, gives a purchase to its first claimant and refuses another user's claim with 403", async () => {
    const first = await signedData.claimAppleTransaction('uid-A', purchase, appleTestHelper);
    expect(first.ok).toBe(true);
    expect(owners.get('12345')?.userId).toBe('uid-A');

    const thief = await signedData.claimAppleTransaction('uid-B', purchase, appleTestHelper);
    expect(thief).toEqual({
      ok: false,
      status: 403,
      error: 'That purchase belongs to another account',
    });
    expect(owners.get('12345')?.userId).toBe('uid-A');

    const again = await signedData.claimAppleTransaction('uid-A', purchase, appleTestHelper);
    expect(again.ok).toBe(true);
  });

  it('gives a token-bound purchase only to the user the token was issued for', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const boundToA = await new CompactSign(
      new TextEncoder().encode(
        JSON.stringify({
          ...SIGNED_TRANSACTION_MODEL,
          appAccountToken: signedData.appAccountTokenFor('uid-A'),
        })
      )
    )
      .setProtectedHeader({ alg: 'ES256' })
      .sign(privateKey);

    // B gets there first, with A's genuine purchase: refused, and nothing recorded.
    const squatter = await signedData.claimAppleTransaction('uid-B', boundToA, appleTestHelper);
    expect(squatter).toMatchObject({ ok: false, status: 403 });
    expect(owners.size).toBe(0);

    const buyer = await signedData.claimAppleTransaction('uid-A', boundToA, appleTestHelper);
    expect(buyer.ok).toBe(true);
    expect(owners.get('12345')?.userId).toBe('uid-A');
  });

  describe('after the owner deletes their account', () => {
    /** A's purchase, claimed by A, then A's account deleted. */
    async function claimedThenDeleted(): Promise<void> {
      expect((await signedData.claimAppleTransaction('uid-A', purchase, appleTestHelper)).ok).toBe(
        true
      );
      expect(await signedData.tombstoneTransactionOwnersFor('uid-A')).toBe(1);
    }

    it('keeps no raw uid in the record', async () => {
      await claimedThenDeleted();
      const record = owners.get('12345');
      expect(record?.deletedAt).toEqual(expect.any(String));
      expect(record?.userId).toBeNull();
      expect(JSON.stringify(record)).not.toContain('uid-A');
    });

    it("refuses B's first claim of A's purchase without a token (403)", async () => {
      await claimedThenDeleted();
      const thief = await signedData.claimAppleTransaction('uid-B', purchase, appleTestHelper);
      expect(thief).toMatchObject({ ok: false, status: 403 });
      expect(owners.get('12345')?.userId).toBeNull();
    });

    it("lets the buyer's new account claim it with a token issued for that account", async () => {
      await claimedThenDeleted();
      const { privateKey } = await generateKeyPair('ES256');
      const signFor = async (uid: string) =>
        new CompactSign(
          new TextEncoder().encode(
            JSON.stringify({
              ...SIGNED_TRANSACTION_MODEL,
              appAccountToken: signedData.appAccountTokenFor(uid),
            })
          )
        )
          .setProtectedHeader({ alg: 'ES256' })
          .sign(privateKey);

      // A token for someone else proves nothing.
      const wrong = await signedData.claimAppleTransaction(
        'uid-A2',
        await signFor('uid-X'),
        appleTestHelper
      );
      expect(wrong).toMatchObject({ ok: false, status: 403 });

      const buyer = await signedData.claimAppleTransaction(
        'uid-A2',
        await signFor('uid-A2'),
        appleTestHelper
      );
      expect(buyer.ok).toBe(true);
      expect(owners.get('12345')?.userId).toBe('uid-A2');
    });
  });

  it('issues a stable, per-user appAccountToken', () => {
    const token = signedData.appAccountTokenFor('uid-A');
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(signedData.appAccountTokenFor('uid-A')).toBe(token);
    expect(signedData.appAccountTokenFor('uid-B')).not.toBe(token);
  });

  it('rejects a genuinely signed transaction for another bundle id', async () => {
    const otherApp = new SignedDataVerifier(
      [APPLE_TEST_CA],
      false,
      Environment.SANDBOX,
      'com.example.x'
    );
    const result = await signedData.claimAppleTransaction('uid-A', TRANSACTION_INFO, otherApp);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(owners.size).toBe(0);
  });

  it('rejects a transaction re-signed by someone other than Apple', async () => {
    const forged = await resign(TRANSACTION_INFO, {
      ...SIGNED_TRANSACTION_MODEL,
      environment: 'Sandbox',
    });
    const result = await signedData.claimAppleTransaction('uid-A', forged);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(owners.size).toBe(0);
  });

  it('fails closed when ownership cannot be recorded or nothing can be verified', async () => {
    firestore.available = false;
    expect(
      await signedData.claimAppleTransaction('uid-A', purchase, appleTestHelper)
    ).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(await signedData.claimAppleTransaction('uid-A', purchase, null)).toMatchObject({
      ok: false,
      status: 503,
    });
  });
});

describe('verifier configuration', () => {
  it('never selects an environment that skips signature checks', () => {
    for (const value of ['LocalTesting', 'Xcode', undefined]) {
      const env = signedData.appleEnvironment({ APPLE_ENVIRONMENT: value, NODE_ENV: 'production' });
      expect([Environment.PRODUCTION, Environment.SANDBOX]).toContain(env);
    }
  });

  it('refuses to build a production verifier without the app Apple ID', () => {
    expect(signedData.createAppleVerifier({ APPLE_ENVIRONMENT: 'Production' })).toBeNull();
    expect(
      signedData.createAppleVerifier({
        APPLE_ENVIRONMENT: 'Production',
        APPLE_APP_APPLE_ID: '1234',
      })
    ).not.toBeNull();
  });
});
