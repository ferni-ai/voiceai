/**
 * Seed Fund gifts, shared by every "plant a seed" button and the monthly gift.
 *
 * POST /api/garden/plant takes `{ amount }` in whole dollars and answers with a
 * Stripe PaymentIntent client secret. The card form (ui/seed-payment-form)
 * mounts Stripe's Payment Element for it and confirms with `elements`. The
 * server answers 503 when Stripe isn't configured, and the web build has no
 * publishable key when payments were never set up here; both come back as
 * `not-configured` so the button can say so instead of inviting a retry.
 * POST /api/garden/subscribe answers a Stripe Checkout url (503 likewise).
 *
 * @module services/seed-payment
 */

import type {
  PlantSeedResponse,
  SeedPaymentOutcome,
  StripeForCard,
  SubscriptionResponse,
} from '../types/seed-fund.types.js';
import { apiFetch } from '../utils/api-helpers.js';
import { t } from '../i18n/index.js';
import { billingErrorMessage } from '../utils/billing.js';
import { createLogger } from '../utils/logger.js';
import { loadStripe } from './monetization.service.js';

const log = createLogger('SeedPayment');

const MONTHLY_GIFT_KEY = 'ferni_monthly_gift_dollars';

export type { SeedPaymentOutcome };

/** Shows the card form and confirms the payment (ui/seed-payment-form's collectCardPayment). */
export type CardCollector = (
  stripe: StripeForCard,
  clientSecret: string,
  amountDollars: number
) => Promise<SeedPaymentOutcome>;

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || `API error: ${response.status}`;
}

/** Plant a one-time seed of `amountDollars` for the signed-in user. */
export async function payForSeed(
  amountDollars: number,
  collect: CardCollector
): Promise<SeedPaymentOutcome> {
  const response = await apiFetch('/api/garden/plant', {
    method: 'POST',
    body: JSON.stringify({ amount: amountDollars }),
  });

  if (response.status === 503) return { status: 'not-configured' };
  if (!response.ok) return { status: 'failed', reason: await readError(response) };

  const result = (await response.json()) as PlantSeedResponse;
  if (!result.success || !result.clientSecret) {
    return { status: 'failed', reason: result.error || 'Failed to create payment' };
  }

  const stripe = (await loadStripe()) as StripeForCard | null;
  if (!stripe) {
    log.warn('Stripe.js has no publishable key; seed payment not attempted');
    return { status: 'not-configured' };
  }

  const outcome = await collect(stripe, result.clientSecret, amountDollars);
  // Seeds economy listens for this to award the supporter bonus (see seeds-economy.service)
  if (outcome.status === 'confirmed') {
    document.dispatchEvent(
      new CustomEvent('ferni:contribution-success', { detail: { amountCents: amountDollars * 100 } })
    );
  }
  return outcome;
}

/** Start a monthly gift of `amountDollars`: on success, go to Stripe Checkout. */
export async function startMonthlyGift(amountDollars: number): Promise<SeedPaymentOutcome> {
  const response = await apiFetch('/api/garden/subscribe', {
    method: 'POST',
    body: JSON.stringify({ amount: amountDollars }),
  });

  if (response.status === 503) return { status: 'not-configured' };
  if (!response.ok) return { status: 'failed', reason: await readError(response) };

  const result = (await response.json()) as SubscriptionResponse;
  if (!result.success || !result.checkoutUrl) {
    return { status: 'failed', reason: result.error || 'Failed to start subscription' };
  }
  // Checkout leaves the page; remember the amount so the /garden/success return can pay the bonus
  try {
    sessionStorage.setItem(MONTHLY_GIFT_KEY, String(amountDollars));
  } catch {
    // Private mode: the thank-you still shows, only the seed bonus is skipped
  }
  window.location.href = result.checkoutUrl;
  return { status: 'redirected' };
}

/**
 * On return from monthly-gift Checkout (/garden/success), announce the payment once so the
 * seeds economy can award the founding bonus. Only fires for a gift this tab started
 * (startMonthlyGift), so opening /garden/success by hand does nothing. Gifts under $10
 * have no founding tier. Returns the tier announced, or null.
 */
export function announceMonthlyGiftPaid(): 'founding-member' | 'founding-patron' | null {
  let dollars = 0;
  try {
    dollars = Number(sessionStorage.getItem(MONTHLY_GIFT_KEY));
    sessionStorage.removeItem(MONTHLY_GIFT_KEY);
  } catch {
    return null;
  }
  if (!(dollars >= 10)) return null;
  const tier = dollars >= 20 ? 'founding-patron' : 'founding-member';
  document.dispatchEvent(new CustomEvent('ferni:subscription-paid', { detail: { tier } }));
  return tier;
}

/** The toast for a gift that went wrong, or null when there is nothing to say. */
export function seedPaymentFailureMessage(outcome: SeedPaymentOutcome): string | null {
  if (outcome.status === 'not-configured') return billingErrorMessage(503);
  if (outcome.status === 'failed') return t('toasts.paymentFailed');
  return null; // confirmed, redirected, or cancelled by the user
}
