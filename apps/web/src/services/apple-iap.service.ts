/**
 * Subscription status for the web, and the way out to Apple's subscription page.
 *
 * App Store purchases (StoreKit) happen only in the native iOS app
 * (apps/ios-native), which verifies them through /api/apple/verify. The web app
 * can't buy or restore them; it reads the user's status from the server and,
 * for an Apple subscription, sends them to Apple to change it.
 *
 * Where a plan is billed comes from the server (`billingSource`, read from the
 * profile's Stripe/App Store records), never from the tier: a paid tier alone
 * says nothing about whether Stripe's portal can manage it.
 */

import { apiGet } from '../utils/api.js';
import { recordPaywallFlag } from './paywall.service.js';

const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/** Where GET /api/subscription/status says the plan is billed. */
export type BillingSource = 'stripe' | 'app_store' | 'none';

/** The provider to manage a plan with. Anything unrecognised is 'none': no Stripe portal on a guess. */
export function providerForBillingSource(source: unknown): SubscriptionStatus['provider'] {
  if (source === 'app_store') return 'apple';
  if (source === 'stripe') return 'stripe';
  return 'none';
}

/**
 * Subscription status from backend verification
 */
export interface SubscriptionStatus {
  tier: 'free' | 'friend' | 'partner';
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  expiresDate?: string;
  provider: 'apple' | 'stripe' | 'none';
}

/**
 * The user's subscription, as GET /api/subscription/status reports it.
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  try {
    const response = await apiGet<{
      tier?: string;
      status?: string;
      currentPeriodEnd?: string;
      billingSource?: BillingSource;
    }>(`/api/subscription/status?userId=${userId}`);
    if (!response.ok || !response.data) {
      return { tier: 'free', status: 'expired', provider: 'none' };
    }
    recordPaywallFlag(response.data);

    return {
      tier: (response.data.tier || 'free') as 'free' | 'friend' | 'partner',
      status: (response.data.status || 'active') as 'active' | 'canceled' | 'expired' | 'past_due',
      expiresDate: response.data.currentPeriodEnd,
      provider: providerForBillingSource(response.data.billingSource),
    };
  } catch {
    return { tier: 'free', status: 'expired', provider: 'none' };
  }
}

/**
 * Open Apple's subscription page (Apple doesn't allow in-app cancellation).
 */
export function openSubscriptionManagement(): void {
  window.open(APPLE_SUBSCRIPTIONS_URL, '_blank');
}

export const appleIAPService = {
  getSubscriptionStatus,
  openSubscriptionManagement,
};

export default appleIAPService;
