/**
 * The App Store Server Notifications webhook keeps the buyer's profile in step
 * with the subscription: renewals extend it; refunds, revocations, expiry and
 * failed billing (after any grace period) end it; upgrades change the tier.
 *
 * Before: the webhook's findUserByTransaction only matched profiles that
 * already had appleOriginalTransactionId, and only the webhook's own
 * SUBSCRIBED handler set that after a match, so nothing ever matched.
 *
 * Real: HTTP server, webhook route, Apple's SignedDataVerifier (Sandbox, full
 * chain + signature checks on the notification, transaction and renewal info),
 * ownership store logic incl. tombstones, entitlement rules. Mocked as in
 * apple-entitlement-verify.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forge,
  owners,
  profiles,
  resetHarness,
  startAppleServer,
  state,
  sub,
  time,
  type AppleServer,
} from './apple-billing.harness.js';
import {
  appStoreNotification,
  appStoreTransaction,
  DAY_MS,
} from './app-store-test-chain.fixtures.js';

vi.mock('../apple-root-certs.js', async () => ({
  APPLE_ROOT_CERTIFICATES: [
    (await import('./app-store-test-chain.fixtures.js')).TEST_APP_STORE_ROOT,
  ],
}));
vi.mock('../../identity/firebase-auth.js', async () =>
  (await import('./apple-billing.harness.js')).fakeFirebaseAuthModule()
);
vi.mock('../../../memory/store-factory.js', async () =>
  (await import('./apple-billing.harness.js')).fakeStoreModule()
);
vi.mock('../../../utils/firestore-utils.js', async () =>
  (await import('./apple-billing.harness.js')).fakeFirestoreModule()
);

let apple: AppleServer;
let tombstoneTransactionOwnersFor: (uid: string) => Promise<number>;
let getSubscriptionInfo: typeof import('../stripe-subscription.js').getSubscriptionInfo;

beforeAll(async () => {
  apple = await startAppleServer();
  ({ tombstoneTransactionOwnersFor } = await import('../apple-signed-data.js'));
  ({ getSubscriptionInfo } = await import('../stripe-subscription.js'));
});
afterAll(() => apple.close());
beforeEach(resetHarness);

/** A paid-up App Store subscriber, as /api/apple/verify leaves them. */
async function subscribed(fields: Record<string, unknown> = {}): Promise<void> {
  expect((await apple.verify('alice', await appStoreTransaction(fields))).status).toBe(200);
  expect(sub('alice')).toMatchObject({ provider: 'apple' });
}

describe('POST /api/apple/webhook follows the subscription', () => {
  it('finds the buyer through the ownership record (the profile has no Apple fields)', async () => {
    owners.set('otx-1', { userId: 'alice' });
    profiles.set('alice', { id: 'alice' });

    const subscribedNote = await appStoreNotification('SUBSCRIBED', { subtype: 'INITIAL_BUY' });
    expect(await apple.webhook(subscribedNote)).toBe(200);
    expect(sub('alice')).toMatchObject({ tier: 'partner', provider: 'apple' });
  });

  it('renewal extends the expiry', async () => {
    await subscribed();
    const renewedTo = Date.now() + 60 * DAY_MS;

    const renewal = await appStoreNotification('DID_RENEW', {
      transaction: { expiresDate: renewedTo },
    });
    expect(await apple.webhook(renewal)).toBe(200);
    expect(time(sub('alice').currentPeriodEnd)).toBe(renewedTo);
    expect(sub('alice')).toMatchObject({ tier: 'partner', status: 'active' });
  });

  it('refund drops to free at once', async () => {
    await subscribed();
    expect(await apple.webhook(await appStoreNotification('REFUND'))).toBe(200);
    expect(sub('alice')).toMatchObject({ tier: 'free', status: 'canceled' });
    expect(sub('alice').revokedAt).toBeDefined();
    expect((await getSubscriptionInfo('alice')).billingSource).toBe('none');
  });

  it('revocation (family sharing removed) drops to free at once', async () => {
    await subscribed();
    expect(await apple.webhook(await appStoreNotification('REVOKE'))).toBe(200);
    expect(sub('alice')).toMatchObject({ tier: 'free', status: 'canceled' });
  });

  it('expiry drops to free', async () => {
    await subscribed();
    const expired = await appStoreNotification('EXPIRED', {
      subtype: 'VOLUNTARY',
      transaction: { expiresDate: Date.now() - 1 },
    });
    expect(await apple.webhook(expired)).toBe(200);
    expect(sub('alice')).toMatchObject({ tier: 'free', status: 'canceled' });
  });

  it('failed billing keeps access through the grace period, then drops to free', async () => {
    await subscribed();
    const graceEnds = Date.now() + 6 * DAY_MS;
    await apple.webhook(
      await appStoreNotification('DID_FAIL_TO_RENEW', {
        subtype: 'GRACE_PERIOD',
        renewal: { gracePeriodExpiresDate: graceEnds, isInBillingRetryPeriod: true },
      })
    );
    expect(sub('alice')).toMatchObject({ tier: 'partner', status: 'past_due' });
    expect(time(sub('alice').gracePeriodEnd)).toBe(graceEnds);

    await apple.webhook(await appStoreNotification('GRACE_PERIOD_EXPIRED'));
    expect(sub('alice')).toMatchObject({ tier: 'free', status: 'unpaid' });
  });

  it('failed billing with no grace period drops to free', async () => {
    await subscribed();
    await apple.webhook(await appStoreNotification('DID_FAIL_TO_RENEW'));
    expect(sub('alice')).toMatchObject({ tier: 'free', status: 'unpaid' });
  });

  it('upgrade friend → partner applies now, downgrade partner → friend does not', async () => {
    await subscribed({ productId: 'com.ferni.subscription.friend.monthly' });
    expect(sub('alice')).toMatchObject({ tier: 'friend' });

    await apple.webhook(
      await appStoreNotification('DID_CHANGE_RENEWAL_PREF', { subtype: 'UPGRADE' })
    );
    expect(sub('alice')).toMatchObject({ tier: 'partner' });

    await apple.webhook(
      await appStoreNotification('DID_CHANGE_RENEWAL_PREF', {
        subtype: 'DOWNGRADE',
        transaction: { productId: 'com.ferni.subscription.friend.monthly' },
      })
    );
    expect(sub('alice')).toMatchObject({ tier: 'partner' });
  });

  it('a forged notification (our chain, another key) is refused and changes nothing', async () => {
    await subscribed();
    const forged = await forge(await appStoreNotification('REFUND'));
    const writes = state.saves;

    expect(await apple.webhook(forged)).toBe(401);
    expect(state.saves).toBe(writes);
    expect(sub('alice')).toMatchObject({ tier: 'partner' });
  });

  it('a genuine notification carrying a forged transaction changes nothing', async () => {
    await subscribed();
    const genuine = await appStoreNotification('REFUND');
    const payload = JSON.parse(Buffer.from(genuine.split('.')[1], 'base64url').toString()) as {
      data: { signedTransactionInfo: string };
    };
    payload.data.signedTransactionInfo = await forge(payload.data.signedTransactionInfo);
    const { signLikeAppStore } = await import('./app-store-test-chain.fixtures.js');
    const writes = state.saves;

    await apple.webhook(await signLikeAppStore(payload));
    expect(state.saves).toBe(writes);
    expect(sub('alice')).toMatchObject({ tier: 'partner' });
  });

  it("a deleted account's purchase is never re-granted", async () => {
    await subscribed();
    expect(await tombstoneTransactionOwnersFor('alice')).toBe(1);
    profiles.delete('alice');
    profiles.set('bob', { id: 'bob' });
    const writes = state.saves;

    expect(await apple.webhook(await appStoreNotification('DID_RENEW'))).toBe(200);
    expect(state.saves).toBe(writes);
    expect((await apple.verify('bob', await appStoreTransaction())).status).toBe(403);
    expect(profiles.get('bob')?.subscription).toBeUndefined();
  });

  it('asks Apple to retry when ownership cannot be read', async () => {
    await subscribed();
    state.firestoreUp = false;
    expect(await apple.webhook(await appStoreNotification('REFUND'))).toBe(503);
    expect(sub('alice')).toMatchObject({ tier: 'partner' });
  });
});
