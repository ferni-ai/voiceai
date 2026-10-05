/**
 * Contract: what the iOS app sells is what the server grants.
 *
 * Sender: the iOS app's own configuration — the bundle id in
 * apps/ios-native/project.yml and the products in apps/ios-native/Ferni.storekit
 * (the same IDs as ProductID in SubscriptionService.swift).
 * Receiver: the real POST /api/apple/verify with the server's default config.
 *
 * Before: the server only knew com.ferni.{friend,partner}.{monthly,annual}
 * and defaulted to bundle id com.ferni.app, while the app sells
 * com.ferni.subscription.*.{monthly,yearly} under com.sethdford.ferni — so
 * every real purchase failed verification (wrong bundle) or mapped to free.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetHarness, startAppleServer, sub, type AppleServer } from './apple-billing.harness.js';
import { appStoreTransaction } from './app-store-test-chain.fixtures.js';

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

const IOS = new URL('../../../../apps/ios-native/', import.meta.url);

interface StoreKitConfig {
  subscriptionGroups: Array<{ subscriptions: Array<{ productID: string }> }>;
}
const storeKit = JSON.parse(readFileSync(new URL('Ferni.storekit', IOS), 'utf8')) as StoreKitConfig;
const sold = storeKit.subscriptionGroups.flatMap((g) => g.subscriptions.map((s) => s.productID));
const bundleId = /PRODUCT_BUNDLE_IDENTIFIER: (\S+)/.exec(
  readFileSync(new URL('project.yml', IOS), 'utf8')
)?.[1];

let apple: AppleServer;
beforeAll(async () => {
  apple = await startAppleServer();
});
afterAll(async () => apple.close());
beforeEach(resetHarness);

describe("the iOS app's products", () => {
  it('reads four subscriptions and the app bundle id from the iOS project', () => {
    expect(sold).toHaveLength(4);
    expect(bundleId).toBe('com.sethdford.ferni');
  });

  it.each(sold)('%s grants its tier on the buyer’s profile', async (productId) => {
    const tier = productId.includes('partner') ? 'partner' : 'friend'; // the app's own rule
    const purchase = await appStoreTransaction({
      productId,
      bundleId,
      originalTransactionId: `otx-${productId}`,
    });

    const res = await apple.verify('alice', purchase);

    expect(res).toMatchObject({ status: 200, body: { tier } });
    expect(sub('alice')).toMatchObject({ tier, provider: 'apple', appleProductId: productId });
  });
});
