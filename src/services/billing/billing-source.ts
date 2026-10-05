/**
 * Where a paid subscription is billed, from what the profile actually records.
 *
 * The web can only manage a Stripe subscription (through the Stripe billing
 * portal). One bought in the iOS app lives with the App Store, and only Apple
 * can change it. So the status API says which one it is, and the web never
 * offers the Stripe portal unless a Stripe customer exists.
 *
 * - provider 'apple' (set when an Apple purchase is applied to the profile)
 *   → 'app_store', even if a Stripe customer was created earlier (an abandoned
 *   checkout leaves one behind).
 * - otherwise a Stripe customer id → 'stripe' (Stripe records written before
 *   `provider` existed have only the id).
 * - otherwise an Apple original transaction id → 'app_store'.
 * - a free tier, or a paid tier with no billing record (an admin upgrade) → 'none'.
 *
 * @module services/billing/billing-source
 */
import type { SubscriptionData } from '../../types/subscription.js';

export type BillingSource = 'stripe' | 'app_store' | 'none';

type BillingFields = Pick<
  SubscriptionData,
  'tier' | 'provider' | 'stripeCustomerId' | 'appleOriginalTransactionId'
>;

export function billingSourceOf(subscription: BillingFields | null | undefined): BillingSource {
  if (!subscription || subscription.tier === 'free') return 'none';
  if (subscription.provider === 'apple') return 'app_store';
  if (subscription.stripeCustomerId) return 'stripe';
  if (subscription.appleOriginalTransactionId) return 'app_store';
  return 'none';
}
