/**
 * POST /api/apple/verify gives the buyer what they paid for, on their profile.
 *
 * Before: verify recorded ownership in apple_transaction_owners but never
 * wrote the profile, so an App Store subscriber read `free` everywhere (the
 * web offered Stripe checkout and kept teammates locked).
 *
 * Real: HTTP server, routes, auth middleware, Apple's SignedDataVerifier
 * (Sandbox, full chain + signature checks), ownership claim, entitlement rules,
 * getSubscriptionInfo. Mocked: the Firebase token check, Firestore and the
 * profile store (in memory, apple-billing.harness.ts), and the trusted root (a
 * test chain shaped like Apple's, app-store-test-chain.fixtures.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forge,
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
let getSubscriptionInfo: typeof import('../stripe-subscription.js').getSubscriptionInfo;

beforeAll(async () => {
  apple = await startAppleServer();
  ({ getSubscriptionInfo } = await import('../stripe-subscription.js'));
});
afterAll(() => apple.close());
beforeEach(resetHarness);

describe('POST /api/apple/verify writes the buyer’s profile', () => {
  it('gives the buyer the tier, provider apple, the purchase id and expiry', async () => {
    const expiresDate = Date.now() + 30 * DAY_MS;
    const res = await apple.verify('alice', await appStoreTransaction({ expiresDate }));

    expect(res).toMatchObject({ status: 200, body: { isValid: true, tier: 'partner' } });
    expect(sub('alice')).toMatchObject({
      tier: 'partner',
      status: 'active',
      provider: 'apple',
      appleOriginalTransactionId: 'otx-1',
      appleProductId: 'com.ferni.subscription.partner.monthly',
    });
    expect(time(sub('alice').currentPeriodEnd)).toBe(expiresDate);
    const info = await getSubscriptionInfo('alice');
    expect(info).toMatchObject({ tier: 'partner', billingSource: 'app_store', canUpgrade: false });
    expect(info.usage.teamAccess).toBe('full-team');
  });

  it('is idempotent: a retried verify writes nothing new', async () => {
    const receipt = await appStoreTransaction();
    expect((await apple.verify('alice', receipt)).status).toBe(200);
    const after = structuredClone(sub('alice'));
    const writes = state.saves;

    expect((await apple.verify('alice', receipt)).status).toBe(200);
    expect(state.saves).toBe(writes);
    expect(sub('alice')).toEqual(after);
  });

  it("never writes another account's profile: B can't claim A's purchase", async () => {
    const receipt = await appStoreTransaction();
    await apple.verify('alice', receipt);
    profiles.set('bob', { id: 'bob' });

    expect((await apple.verify('bob', receipt)).status).toBe(403);
    expect(profiles.get('bob')?.subscription).toBeUndefined();
    expect(sub('alice')).toMatchObject({ tier: 'partner', provider: 'apple' });
  });

  it("ignores a body naming someone else's profile", async () => {
    const res = await apple.verify('alice', await appStoreTransaction(), { userId: 'bob' });
    expect(res.status).toBe(403);
    expect(profiles.has('bob')).toBe(false);
  });

  it('a forged transaction (our chain, another key) changes nothing', async () => {
    const forged = await forge(await appStoreTransaction());
    expect((await apple.verify('alice', forged)).status).toBe(400);
    expect(profiles.get('alice')?.subscription).toBeUndefined();
  });

  it('an expired purchase grants nothing', async () => {
    const expired = await appStoreTransaction({ expiresDate: Date.now() - 1 });
    const res = await apple.verify('alice', expired);
    expect(res.body).toMatchObject({ status: 'expired' });
    expect(sub('alice').tier ?? 'free').toBe('free');
  });
});

describe('paying twice: the higher tier wins, Stripe keeps ties', () => {
  const stripe = (tier: string) => ({
    tier,
    status: 'active',
    provider: 'stripe',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    billingFrequency: 'monthly',
    inTrial: false,
    monthlyUsage: { period: '2026-10', conversationCount: 0, minutesTalked: 0 },
  });

  it('never downgrades a higher Stripe tier, and an App Store expiry leaves it alone', async () => {
    profiles.set('alice', { id: 'alice', subscription: stripe('partner') });
    await apple.verify(
      'alice',
      await appStoreTransaction({ productId: 'com.ferni.subscription.friend.monthly' })
    );
    expect(sub('alice')).toMatchObject({
      tier: 'partner',
      provider: 'stripe',
      appleOriginalTransactionId: 'otx-1',
    });

    await apple.webhook(await appStoreNotification('EXPIRED', { transaction: { expiresDate: 1 } }));
    expect(sub('alice')).toMatchObject({ tier: 'partner', provider: 'stripe', status: 'active' });
    expect((await getSubscriptionInfo('alice')).billingSource).toBe('stripe');
  });

  it('a higher App Store tier covers a Stripe one and hands it back when it ends', async () => {
    profiles.set('alice', { id: 'alice', subscription: stripe('friend') });
    await apple.verify('alice', await appStoreTransaction());
    expect(sub('alice')).toMatchObject({
      tier: 'partner',
      provider: 'apple',
      stripeTierUnderApple: 'friend',
    });

    await apple.webhook(await appStoreNotification('REFUND'));
    expect(sub('alice')).toMatchObject({ tier: 'friend', provider: 'stripe', status: 'active' });
    expect((await getSubscriptionInfo('alice')).billingSource).toBe('stripe');
  });
});
