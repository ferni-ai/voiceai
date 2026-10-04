/**
 * POST /api/apple/webhook trusts nothing until Apple's signature checks out.
 *
 * The notification JWS used to be base64-decoded and acted on unverified, so a
 * made-up DID_RENEW for a known originalTransactionId extended that user's paid
 * subscription. These tests drive the REAL route (handleAppleRoutes) and the
 * REAL notification handler; only the profile store is mocked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIGNED_BY_LEAF_WITHOUT_APPLE_OID,
  SIGNED_BY_TEST_CHAIN,
  TEST_ROOT_SHA256,
} from './apple-jws.fixtures.js';

const store = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock('../../../memory/store-factory.js', () => ({ getStore: async () => store }));

let verifyAppleSignedJws: typeof import('../apple-jws-verify.js').verifyAppleSignedJws;
let handleAppleRoutes: typeof import('../../../api/apple-iap-routes.js').handleAppleRoutes;

beforeAll(async () => {
  // APPLE_CONFIG is read at import time; the webhook answers 503 when unconfigured.
  vi.stubEnv('APPLE_ISSUER_ID', 'issuer');
  vi.stubEnv('APPLE_KEY_ID', 'key');
  vi.stubEnv('APPLE_PRIVATE_KEY', 'unused-in-webhook');
  ({ verifyAppleSignedJws } = await import('../apple-jws-verify.js'));
  ({ handleAppleRoutes } = await import('../../../api/apple-iap-routes.js'));
});

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** What an attacker can post: Apple's JSON shape, no Apple signature. */
const forgedRenewal = [
  b64u({ alg: 'ES256' }),
  b64u({
    notificationType: 'DID_RENEW',
    data: {
      signedTransactionInfo: [
        b64u({ alg: 'ES256' }),
        b64u({
          transactionId: 'tx-9',
          originalTransactionId: 'otx-1',
          productId: 'com.ferni.partner.monthly',
          purchaseDate: 1759500000000,
          expiresDate: 4102444800000,
        }),
        'sig',
      ].join('.'),
    },
  }),
  'not-a-signature',
].join('.');

function postWebhook(signedPayload: string) {
  const req = Readable.from([JSON.stringify({ signedPayload })]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/apple/webhook';
  req.headers = { 'content-type': 'application/json' };
  let status = 0;
  let raw = '';
  const res = {
    writeHead: (code: number) => ((status = code), res),
    setHeader: () => res,
    end: (chunk?: string) => void (raw = chunk ?? ''),
  } as unknown as ServerResponse;
  return {
    run: () => handleAppleRoutes(req, res),
    status: () => status,
    body: () => (raw ? JSON.parse(raw) : null),
  };
}

describe('POST /api/apple/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const victim = {
      id: 'victim',
      subscription: { tier: 'free', status: 'expired', appleOriginalTransactionId: 'otx-1' },
    };
    store.listProfiles.mockResolvedValue([victim]);
    store.getProfile.mockResolvedValue(victim);
    store.saveProfile.mockResolvedValue(undefined);
  });

  it('rejects an unsigned notification and changes no subscription', async () => {
    const call = postWebhook(forgedRenewal);
    await call.run();

    expect(call.status()).toBe(401);
    expect(call.body()).toEqual({ error: 'Invalid signature' });
    expect(store.saveProfile).not.toHaveBeenCalled();
  });

  it('rejects a notification signed by a look-alike chain that is not rooted at Apple', async () => {
    const call = postWebhook(SIGNED_BY_TEST_CHAIN);
    await call.run();

    expect(call.status()).toBe(401);
    expect(store.saveProfile).not.toHaveBeenCalled();
  });
});

describe('verifyAppleSignedJws', () => {
  const trustTestRoot = { rootFingerprints: [TEST_ROOT_SHA256] };

  it('returns the payload when the chain and signature check out', async () => {
    const payload = await verifyAppleSignedJws<{ notificationType: string }>(
      SIGNED_BY_TEST_CHAIN,
      trustTestRoot
    );
    expect(payload.notificationType).toBe('DID_RENEW');
  });

  it('only trusts Apple Root CA - G3 by default', async () => {
    await expect(verifyAppleSignedJws(SIGNED_BY_TEST_CHAIN)).rejects.toThrow(/root is not trusted/);
  });

  it('rejects a payload edited after signing', async () => {
    const [header, , signature] = SIGNED_BY_TEST_CHAIN.split('.');
    const edited = `${header}.${b64u({ notificationType: 'REFUND' })}.${signature}`;
    await expect(verifyAppleSignedJws(edited, trustTestRoot)).rejects.toThrow();
  });

  it('rejects alg none and a missing certificate chain', async () => {
    const none = `${b64u({ alg: 'none' })}.${b64u({ notificationType: 'DID_RENEW' })}.`;
    await expect(verifyAppleSignedJws(none, trustTestRoot)).rejects.toThrow(/ES256/);
    await expect(verifyAppleSignedJws(forgedRenewal, trustTestRoot)).rejects.toThrow(/x5c/);
  });

  it('rejects a leaf without the App Store signing OID', async () => {
    await expect(
      verifyAppleSignedJws(SIGNED_BY_LEAF_WITHOUT_APPLE_OID, trustTestRoot)
    ).rejects.toThrow(/App Store signing chain/);
  });

  it('rejects certificates outside their validity period', async () => {
    await expect(
      verifyAppleSignedJws(SIGNED_BY_TEST_CHAIN, { ...trustTestRoot, now: new Date('2200-01-01') })
    ).rejects.toThrow(/validity/);
  });
});
