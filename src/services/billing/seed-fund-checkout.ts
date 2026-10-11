/**
 * Checkout for a monthly Seed Fund gift: the amount the person chose, billed monthly.
 *
 * Gifts used to go through the Friend plan's checkout, so every gift was billed at the
 * plan price whatever was chosen, the giver was made a Friend subscriber, and cancelling
 * the gift (or a failed gift payment) downgraded or flagged their real plan. A gift
 * subscription carries no `ferni_user_id`/`tier`, so the plan webhooks leave it alone;
 * `garden_type: 'monthly'` marks it for the founding bonus and the invoice handlers.
 *
 * @module services/billing/seed-fund-checkout
 */
import { getOrCreateCustomer, getStripe } from './stripe-subscription.js';

export const MIN_MONTHLY_GIFT = 5;
export const MAX_MONTHLY_GIFT = 1000;
export const GIFT_AMOUNT_ERROR = `Monthly amount must be $${MIN_MONTHLY_GIFT}-$${MAX_MONTHLY_GIFT}`;

/** Whole cents for a chosen dollar amount, or null when it isn't a valid monthly gift. */
export function monthlyGiftCents(amount: unknown): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (amount < MIN_MONTHLY_GIFT || amount > MAX_MONTHLY_GIFT) return null;
  return Math.round(amount * 100);
}

export async function createSeedFundCheckout(params: {
  /** The Stripe customer's owner (the caller's id, verified or legacy device id). */
  userId: string;
  /** The verified uid that earns the founding seeds; absent for unverified callers. */
  seedsUid?: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  const stripe = await getStripe();
  const customer = await getOrCreateCustomer(params.userId);
  const metadata = {
    garden_type: 'monthly',
    ...(params.seedsUid ? { seeds_uid: params.seedsUid } : {}),
  };
  const session = await stripe.checkout.sessions.create({
    customer,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: params.amountCents,
          recurring: { interval: 'month' },
          product_data: { name: 'Ferni Seed Fund — monthly gift' },
        },
      },
    ],
    success_url: `${params.successUrl}${params.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: params.cancelUrl,
    metadata,
    subscription_data: { metadata },
    billing_address_collection: 'required',
  });
  return { sessionId: session.id, url: session.url! };
}
