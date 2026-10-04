/**
 * Seed Fund gifts, shared by every "plant a seed" button and the monthly gift.
 *
 * POST /api/garden/plant takes `{ amount }` in whole dollars and answers with a
 * Stripe PaymentIntent client secret, which Stripe.js then confirms. The
 * server answers 503 when Stripe isn't configured, and the web build has no
 * publishable key when payments were never set up here; both come back as
 * `not-configured` so the button can say so instead of inviting a retry.
 * POST /api/garden/subscribe answers a Stripe Checkout url (503 likewise).
 *
 * @module services/seed-payment
 */

import type { PlantSeedResponse, SubscriptionResponse } from '../types/seed-fund.types.js';
import { apiFetch } from '../utils/api-helpers.js';
import { billingErrorMessage } from '../utils/billing.js';
import { createLogger } from '../utils/logger.js';
import { loadStripe } from './monetization.service.js';

const log = createLogger('SeedPayment');

export type SeedPaymentOutcome =
  /** Stripe accepted the payment and is navigating to the return URL. */
  | { status: 'confirmed' }
  /** Sent to Stripe Checkout (monthly gift). */
  | { status: 'redirected' }
  /** Payments aren't set up (server 503 or no Stripe key in this build); nothing was charged. */
  | { status: 'not-configured' }
  | { status: 'failed'; reason: string };

interface StripeConfirm {
  confirmPayment(options: {
    clientSecret: string;
    confirmParams: { return_url: string };
  }): Promise<{ error?: { message?: string } }>;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || `API error: ${response.status}`;
}

/** Plant a one-time seed of `amountDollars` for the signed-in user. */
export async function payForSeed(amountDollars: number): Promise<SeedPaymentOutcome> {
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

  const stripe = (await loadStripe()) as StripeConfirm | null;
  if (!stripe) {
    log.warn('Stripe.js has no publishable key; seed payment not attempted');
    return { status: 'not-configured' };
  }

  const { error } = await stripe.confirmPayment({
    clientSecret: result.clientSecret,
    confirmParams: { return_url: `${window.location.origin}/garden/success` },
  });
  if (error) return { status: 'failed', reason: error.message || 'Payment was declined' };

  return { status: 'confirmed' };
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
  window.location.href = result.checkoutUrl;
  return { status: 'redirected' };
}

/** The toast for a seed payment that didn't complete. */
export function seedPaymentFailureMessage(outcome: SeedPaymentOutcome): string {
  return outcome.status === 'not-configured'
    ? billingErrorMessage(503)
    : "Payment didn't go through. Try again?";
}
