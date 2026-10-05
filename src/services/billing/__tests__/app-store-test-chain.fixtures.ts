/**
 * A TEST-ONLY certificate chain shaped like Apple's App Store signing chain, so
 * tests can sign any notification or transaction and run Apple's library's
 * full verification on it (Apple publishes signed fixtures only for TEST
 * notifications; see apple-store.fixtures.ts).
 *
 * Generated 2026-10-04 with OpenSSL 3, EC P-256, valid to 2046:
 * - root: self-signed CA
 * - intermediate: CA, carries 1.2.840.113635.100.6.2.1 (Apple's WWDR marker)
 * - leaf: carries 1.2.840.113635.100.6.11.1 (Apple's App Store signing marker)
 * SignedDataVerifier checks exactly these: the chain up to a trusted root, both
 * markers, the validity dates and the JWS signature.
 *
 * Trusted ONLY by tests that mock apple-root-certs.ts. Production trusts
 * Apple's roots alone, so this key can't sign anything production accepts.
 */
import { createPrivateKey, sign } from 'node:crypto';

const ROOT_DER =
  'MIIB0jCCAXigAwIBAgIUV/V0K4F+4ZZRgUaXB5TPfi8IXaEwCgYIKoZIzj0EAwIwRzEvMC0GA1UEAwwmRmVybmkgVGVzdCBB' +
  'cHAgU3RvcmUgUm9vdCAodGVzdHMgb25seSkxFDASBgNVBAoMC0Zlcm5pIHRlc3RzMB4XDTI2MTAwNDIyMTUwOFoXDTQ2MDky' +
  'OTIyMTUwOFowRzEvMC0GA1UEAwwmRmVybmkgVGVzdCBBcHAgU3RvcmUgUm9vdCAodGVzdHMgb25seSkxFDASBgNVBAoMC0Zl' +
  'cm5pIHRlc3RzMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEv+94leQ7g7lmDPC0AY3ZAdD/h5d2r+4jD5lqonGybbmkKzWy' +
  'Xq9YWrAwqqBKmzB7xpBhroZwYHfaDRZEfxldHaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0O' +
  'BBYEFKIi5ymWV9UxAuB5VlzhNzx82lhPMAoGCCqGSM49BAMCA0gAMEUCIQCmzynFNaRpGkmzk9Jt8E5AnVgD9QZRnc9WuH6p' +
  'KRQr0AIgFGPcXVKW9IEhy8VhyC/oyZi/Y1bJvY2A1Ap9PKxQkD0=';

const INTER_DER =
  'MIICEDCCAbagAwIBAgIUXDN/96m9+7A6LnRzRgZwlS6E6iEwCgYIKoZIzj0EAwIwRzEvMC0GA1UEAwwmRmVybmkgVGVzdCBB' +
  'cHAgU3RvcmUgUm9vdCAodGVzdHMgb25seSkxFDASBgNVBAoMC0Zlcm5pIHRlc3RzMB4XDTI2MTAwNDIyMTUwOFoXDTQ2MDky' +
  'OTIyMTUwOFowTzE3MDUGA1UEAwwuRmVybmkgVGVzdCBBcHAgU3RvcmUgSW50ZXJtZWRpYXRlICh0ZXN0cyBvbmx5KTEUMBIG' +
  'A1UECgwLRmVybmkgdGVzdHMwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATojSFyEm9ORsh2LvsY/bONDmQtt1j1H2P5oi23' +
  'GUKeLIBYnFnr7V4xDpUwK+yq/NYAtEVRHnr7reeSC8jRqD0Yo3gwdjASBgNVHRMBAf8ECDAGAQH/AgEAMA4GA1UdDwEB/wQE' +
  'AwIBBjAdBgNVHQ4EFgQUlooP+3L58/BiXSuFDdRP5f20wPcwHwYDVR0jBBgwFoAUoiLnKZZX1TEC4HlWXOE3PHzaWE8wEAYK' +
  'KoZIhvdjZAYCAQQCBQAwCgYIKoZIzj0EAwIDSAAwRQIgQ8/PzOke72NCKMD1+xYHxnxRGi2n4Y10550G2nxW1kACIQCiCFIB' +
  'hYuC1nuFqg27Um674Fp0u3SZgxURI+b93FQF5w==';

const LEAF_DER =
  'MIICDDCCAbKgAwIBAgIUWn+oYfyHc/5GjCxsG5X/IPILAB0wCgYIKoZIzj0EAwIwTzE3MDUGA1UEAwwuRmVybmkgVGVzdCBB' +
  'cHAgU3RvcmUgSW50ZXJtZWRpYXRlICh0ZXN0cyBvbmx5KTEUMBIGA1UECgwLRmVybmkgdGVzdHMwHhcNMjYxMDA0MjIxNTA4' +
  'WhcNNDYwOTI5MjIxNTA4WjBJMTEwLwYDVQQDDChGZXJuaSBUZXN0IEFwcCBTdG9yZSBTaWduZXIgKHRlc3RzIG9ubHkpMRQw' +
  'EgYDVQQKDAtGZXJuaSB0ZXN0czBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABFXJqMlDs1w+eEnx8IvvqYEM4Cm8tAxrRmgC' +
  'lukhosyiX/w1E6mnWZ5aNK6dWKicpXRt837HADP9BZM9739J44+jcjBwMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgeA' +
  'MB0GA1UdDgQWBBTka/7NonVsltwgB1B90yVdGVEz/zAfBgNVHSMEGDAWgBSWig/7cvnz8GJdK4UN1E/l/bTA9zAQBgoqhkiG' +
  '92NkBgsBBAIFADAKBggqhkjOPQQDAgNIADBFAiADbmK9tBdCe8JrKG1S7YJz+xmUloT2JdqSUnb3PaV14gIhANgGaaUcq3SX' +
  'V2M12u+0AxSexJtJx7+6VfGVeGhCLAqL';

/** The leaf's test-only signing key (JWK). Worthless outside these tests. */
const SIGNER_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'VcmoyUOzXD54SfHwi--pgQzgKby0DGtGaAKW6SGizKI',
  y: 'X_w1E6mnWZ5aNK6dWKicpXRt837HADP9BZM9739J448',
  d: 'VG-vQECxxN_QlQNK9wZxHVeOfSaIvApIh1TgXz_nI9k',
};

/** The test root, to trust in place of Apple's roots. */
export const TEST_APP_STORE_ROOT = Buffer.from(ROOT_DER, 'base64');

/** Sign `payload` the way the App Store does: ES256 with the x5c chain in the header. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function signLikeAppStore(payload: object): Promise<string> {
  const b64u = (text: string): string => Buffer.from(text).toString('base64url');
  const header = b64u(JSON.stringify({ alg: 'ES256', x5c: [LEAF_DER, INTER_DER, ROOT_DER] }));
  const body = b64u(JSON.stringify(payload));
  const key = createPrivateKey({ key: SIGNER_JWK, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(`${header}.${body}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${body}.${signature.toString('base64url')}`;
}

/** The iOS app's bundle id (apps/ios-native/project.yml). */
export const APP_BUNDLE_ID = 'com.sethdford.ferni';
const DAY = 24 * 60 * 60 * 1000;

/** A signed StoreKit 2 transaction for our app (Sandbox), current for 30 days unless overridden. */
export async function appStoreTransaction(fields: Record<string, unknown> = {}): Promise<string> {
  const now = Date.now();
  return signLikeAppStore({
    transactionId: `tx-${now}-${Math.random()}`,
    originalTransactionId: 'otx-1',
    bundleId: APP_BUNDLE_ID,
    productId: 'com.ferni.subscription.partner.monthly',
    purchaseDate: now - DAY,
    originalPurchaseDate: now - DAY,
    expiresDate: now + 30 * DAY,
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    signedDate: now,
    environment: 'Sandbox',
    ...fields,
  });
}

/** A signed App Store Server Notification v2 for our app (Sandbox). */
export async function appStoreNotification(
  notificationType: string,
  {
    subtype,
    transaction = {},
    renewal,
  }: {
    subtype?: string;
    transaction?: Record<string, unknown>;
    renewal?: Record<string, unknown>;
  } = {}
): Promise<string> {
  const now = Date.now();
  const signedRenewalInfo = renewal
    ? await signLikeAppStore({
        originalTransactionId: transaction.originalTransactionId ?? 'otx-1',
        autoRenewProductId: 'com.ferni.subscription.partner.monthly',
        productId: 'com.ferni.subscription.partner.monthly',
        autoRenewStatus: 1,
        signedDate: now,
        environment: 'Sandbox',
        ...renewal,
      })
    : undefined;
  return signLikeAppStore({
    notificationType,
    subtype,
    notificationUUID: `n-${now}-${Math.random()}`,
    version: '2.0',
    signedDate: now,
    data: {
      appAppleId: 1234,
      bundleId: APP_BUNDLE_ID,
      environment: 'Sandbox',
      signedTransactionInfo: await appStoreTransaction(transaction),
      signedRenewalInfo,
    },
  });
}

export const DAY_MS = DAY;
