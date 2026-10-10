/**
 * Stripe webhooks follow the same paying-twice rule as App Store events: the
 * higher tier wins, a tie stays with Stripe, and the plan not in charge takes
 * over when the other one ends.
 *
 * Before: downgradeToFree and syncSubscriptionFromStripe wrote tier/provider
 * without looking at the App Store, so someone paying in the iOS app who
 * cancelled a Stripe plan dropped to free (or was overwritten by a lower Stripe
 * tier) until Apple's next renewal.
 *
 * Real: the Stripe webhook handler and sync functions, the App Store verify and
 * webhook routes (Apple's SignedDataVerifier with the test chain), the
 * entitlement rules, and the Firestore profile store (FirestoreStore, which
 * merges and writes a cleared field as null). Mocked: Stripe's API client, the
 * Firestore SDK client (an in-memory database with Firestore's merge
 * semantics), the purchase-ownership collection and the Firebase token check.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  firestoreDocs as docs,
  resetHarness,
  startAppleServer,
  type AppleServer,
} from './apple-billing.harness.js';
import {
  appStoreNotification,
  appStoreTransaction,
  DAY_MS,
} from './app-store-test-chain.fixtures.js';

type Doc = Record<string, unknown>;
const stripeSubs = vi.hoisted(() => new Map<string, Doc>());

vi.mock('@google-cloud/firestore', async (importOriginal) =>
  (await import('./apple-billing.harness.js')).fakeFirestoreSdkModule(await importOriginal())
);
vi.mock('../../../memory/store-factory.js', async () => {
  const { FirestoreStore } = await import('../../../memory/storage/firestore-store.js');
  const store = new FirestoreStore({ projectId: 'test' });
  return { getStore: async () => store };
});
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('./apple-billing.harness.js')).fakeFirestoreModule(),
}));
vi.mock('../apple-root-certs.js', async () => ({
  APPLE_ROOT_CERTIFICATES: [
    (await import('./app-store-test-chain.fixtures.js')).TEST_APP_STORE_ROOT,
  ],
}));
vi.mock('../../identity/firebase-auth.js', async () =>
  (await import('./apple-billing.harness.js')).fakeFirebaseAuthModule()
);
vi.mock('stripe', () => ({
  default: class {
    subscriptions = {
      retrieve: async (id: string) => {
        const found = stripeSubs.get(id);
        if (!found) throw new Error(`no such subscription: ${id}`);
        return found;
      },
    };
  },
}));

let apple: AppleServer;
let stripe: typeof import('../stripe-subscription.js');

beforeAll(async () => {
  apple = await startAppleServer();
  stripe = await import('../stripe-subscription.js');
});
afterAll(() => apple.close());
beforeEach(() => {
  resetHarness();
  docs.clear();
  stripeSubs.clear();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  docs.set('bogle_users/alice', { id: 'alice', name: 'Alice' });
});

/** The subscription as Firestore holds it. */
const sub = (): Doc => (docs.get('bogle_users/alice')?.subscription ?? {}) as Doc;
const PERIOD_END = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

function stripeSub(tier: string, status = 'active'): Doc {
  return {
    id: 'sub_alice',
    status,
    customer: 'cus_alice',
    created: PERIOD_END - 40 * 24 * 3600,
    current_period_end: PERIOD_END,
    trial_end: null,
    metadata: { ferni_user_id: 'alice', tier },
  };
}

async function event(type: string, object: Doc): Promise<void> {
  await stripe.handleWebhookEvent({ id: `evt_${type}`, type, data: { object } } as never);
}

/** Alice subscribes through Stripe checkout (the real checkout.session.completed path). */
async function stripeCheckout(tier: string): Promise<void> {
  stripeSubs.set('sub_alice', stripeSub(tier));
  await event('checkout.session.completed', {
    id: 'cs_1',
    subscription: 'sub_alice',
    metadata: { ferni_user_id: 'alice', tier },
  });
}

/** Alice buys in the iOS app (the real /api/apple/verify route). */
async function appStorePurchase(productId: string, expiresDate: number): Promise<void> {
  const res = await apple.verify('alice', await appStoreTransaction({ productId, expiresDate }));
  expect(res.status).toBe(200);
}

const PARTNER = 'com.ferni.subscription.partner.monthly';
const FRIEND = 'com.ferni.subscription.friend.monthly';
const billingSource = async () => (await stripe.getSubscriptionInfo('alice')).billingSource;

describe('a Stripe plan ending leaves a live App Store plan in charge', () => {
  it('cancel while the App Store holds a higher tier: keeps it, clears Stripe', async () => {
    const appleExpiry = Date.now() + 20 * DAY_MS;
    await stripeCheckout('friend');
    await appStorePurchase(PARTNER, appleExpiry);
    expect(sub()).toMatchObject({
      tier: 'partner',
      provider: 'apple',
      stripeTierUnderApple: 'friend',
    });

    await event('customer.subscription.deleted', stripeSub('friend', 'canceled'));

    expect(sub()).toMatchObject({ tier: 'partner', provider: 'apple', status: 'active' });
    expect(new Date(sub().currentPeriodEnd as string).getTime()).toBe(appleExpiry);
    expect(sub().stripeSubscriptionId).toBeNull();
    expect(sub().stripeTierUnderApple).toBeNull();
    expect(await billingSource()).toBe('app_store');

    // The cancelled Stripe plan is gone for good: when the App Store plan ends, Alice is free.
    await apple.webhook(await appStoreNotification('EXPIRED', { transaction: { expiresDate: 1 } }));
    expect(sub()).toMatchObject({ tier: 'free', status: 'canceled' });
  });

  it('cancel at a tie (Stripe in charge): the App Store plan takes over with its expiry', async () => {
    const appleExpiry = Date.now() + 12 * DAY_MS;
    await stripeCheckout('friend');
    await appStorePurchase(FRIEND, appleExpiry);
    expect(sub()).toMatchObject({
      tier: 'friend',
      provider: 'stripe',
      appleTierUnderStripe: 'friend',
    });

    await event('customer.subscription.deleted', stripeSub('friend', 'canceled'));

    expect(sub()).toMatchObject({ tier: 'friend', provider: 'apple', status: 'active' });
    expect(new Date(sub().currentPeriodEnd as string).getTime()).toBe(appleExpiry);
    expect(sub().stripeSubscriptionId).toBeNull();
    expect(await billingSource()).toBe('app_store');
  });

  it('failed payment: invoice.payment_failed writes nothing, then unpaid leaves Apple in charge', async () => {
    await stripeCheckout('friend');
    await appStorePurchase(PARTNER, Date.now() + 20 * DAY_MS);
    const before = structuredClone(sub());

    await event('invoice.payment_failed', { id: 'in_1', customer: 'cus_alice' });
    expect(sub()).toEqual(before);

    await event('customer.subscription.updated', stripeSub('friend', 'unpaid'));
    expect(sub()).toMatchObject({ tier: 'partner', provider: 'apple', status: 'active' });
    expect(sub().stripeSubscriptionId).toBeNull();
    expect(sub().stripeTierUnderApple).toBeNull();
  });

  it('an App Store plan that already expired does not take over', async () => {
    await stripeCheckout('friend');
    await appStorePurchase(FRIEND, Date.now() + DAY_MS);
    const s = sub();
    docs.set('bogle_users/alice', {
      id: 'alice',
      subscription: { ...s, appleExpiresUnderStripe: new Date(Date.now() - 1).toISOString() },
    });

    await event('customer.subscription.deleted', stripeSub('friend', 'canceled'));
    expect(sub()).toMatchObject({ tier: 'free', status: 'active' });
  });
});

describe('a Stripe plan at least as high takes charge, and the App Store plan is remembered', () => {
  it('Stripe upgrade above the App Store tier, then Stripe ends: back to the App Store tier', async () => {
    const appleExpiry = Date.now() + 25 * DAY_MS;
    await appStorePurchase(FRIEND, appleExpiry);
    expect(sub()).toMatchObject({ tier: 'friend', provider: 'apple' });

    await stripeCheckout('partner');
    expect(sub()).toMatchObject({
      tier: 'partner',
      provider: 'stripe',
      stripeSubscriptionId: 'sub_alice',
      appleTierUnderStripe: 'friend',
    });
    expect(new Date(sub().appleExpiresUnderStripe as string).getTime()).toBe(appleExpiry);
    expect(await billingSource()).toBe('stripe');

    await event('customer.subscription.deleted', stripeSub('partner', 'canceled'));
    expect(sub()).toMatchObject({ tier: 'friend', provider: 'apple', status: 'active' });
    expect(new Date(sub().currentPeriodEnd as string).getTime()).toBe(appleExpiry);
    expect(sub().appleTierUnderStripe).toBeNull();
  });

  it('the remembered App Store plan ending first is forgotten, so a later Stripe cancel is free', async () => {
    await appStorePurchase(FRIEND, Date.now() + 25 * DAY_MS);
    await stripeCheckout('partner');

    await apple.webhook(await appStoreNotification('EXPIRED', { transaction: { expiresDate: 1 } }));
    expect(sub()).toMatchObject({ tier: 'partner', provider: 'stripe' });
    expect(sub().appleTierUnderStripe).toBeNull();

    await event('customer.subscription.deleted', stripeSub('partner', 'canceled'));
    expect(sub()).toMatchObject({ tier: 'free', status: 'active' });
  });

  it('a lower Stripe tier does not overwrite a higher App Store one', async () => {
    await appStorePurchase(PARTNER, Date.now() + 25 * DAY_MS);

    await stripeCheckout('friend');
    expect(sub()).toMatchObject({
      tier: 'partner',
      provider: 'apple',
      stripeSubscriptionId: 'sub_alice',
      stripeTierUnderApple: 'friend',
    });

    // ...and the App Store's own hand-back still works when its plan ends.
    await apple.webhook(await appStoreNotification('REFUND'));
    expect(sub()).toMatchObject({ tier: 'friend', provider: 'stripe', status: 'active' });
  });
});

describe('cleared fields come back from Firestore as null', () => {
  it('an old Stripe plan left on the profile is not handed back when the App Store plan ends', async () => {
    // What a Stripe cancellation used to leave in Firestore: the merge kept the old id.
    docs.set('bogle_users/alice', {
      id: 'alice',
      subscription: {
        tier: 'free',
        status: 'active',
        billingFrequency: 'monthly',
        inTrial: false,
        monthlyUsage: { period: '2026-10', conversationCount: 0, minutesTalked: 0 },
        stripeCustomerId: 'cus_alice',
        stripeSubscriptionId: 'sub_old',
      },
    });
    await appStorePurchase(PARTNER, Date.now() + 20 * DAY_MS);
    expect(sub()).toMatchObject({ tier: 'partner', provider: 'apple', stripeTierUnderApple: null });

    await apple.webhook(await appStoreNotification('EXPIRED', { transaction: { expiresDate: 1 } }));
    expect(sub()).toMatchObject({ tier: 'free', status: 'canceled', provider: 'apple' });
  });
});

describe('no App Store plan: Stripe behaves as before', () => {
  it('checkout gives the Stripe tier; deletion drops to free and keeps the customer', async () => {
    await stripeCheckout('partner');
    expect(sub()).toMatchObject({
      tier: 'partner',
      status: 'active',
      provider: 'stripe',
      stripeCustomerId: 'cus_alice',
      stripeSubscriptionId: 'sub_alice',
      inTrial: false,
    });

    await event('customer.subscription.deleted', stripeSub('partner', 'canceled'));
    expect(sub()).toMatchObject({
      tier: 'free',
      status: 'active',
      inTrial: false,
      stripeCustomerId: 'cus_alice',
    });
    expect(sub().stripeSubscriptionId).toBeNull();
  });

  it('an update to past_due keeps the Stripe tier with that status', async () => {
    await stripeCheckout('friend');
    await event('customer.subscription.updated', stripeSub('friend', 'past_due'));
    expect(sub()).toMatchObject({ tier: 'friend', status: 'past_due', provider: 'stripe' });
  });
});
