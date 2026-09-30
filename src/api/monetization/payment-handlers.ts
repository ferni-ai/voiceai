/**
 * Monetization API: Stripe webhook and payment verification endpoints.
 * Extracted from monetization-routes.ts.
 */

import {
  handlePaymentSucceeded,
  isStripeConfigured,
  verifyPayment,
} from '../../services/stripe-payments.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RequestContext, ResponseContext } from './types.js';

const log = createLogger({ module: 'MonetizationAPI' });

// ============================================================================
// STRIPE WEBHOOK ENDPOINT
// ============================================================================

/**
 * POST /api/monetization/webhook
 * Handle Stripe webhook events for payment confirmation
 */
export async function handleStripeWebhook(ctx: RequestContext): Promise<ResponseContext> {
  const signature = ctx.headers['stripe-signature'] as string;

  if (!signature) {
    log.warn('Webhook received without signature');
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Missing stripe-signature header' },
    };
  }

  const webhookSecret =
    process.env.STRIPE_MONETIZATION_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !ctx.rawBody) {
    log.error({ hasSecret: Boolean(webhookSecret) }, 'Stripe webhook cannot be verified');
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Webhook verification not configured' },
    };
  }

  let verified: unknown;
  try {
    // SECURITY: only signed events from Stripe are processed
    const { verifyWebhook } = await import('../../services/billing/stripe-subscription.js');
    verified = await verifyWebhook(ctx.rawBody, signature, webhookSecret);
  } catch (error) {
    log.warn({ error: String(error) }, 'Stripe webhook signature verification failed');
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Invalid signature' },
    };
  }

  try {
    const event = verified as {
      type: string;
      data: {
        object: {
          id: string;
          amount: number;
          metadata: Record<string, string>;
        };
      };
    };

    log.info({ eventType: event.type }, 'Stripe webhook received');

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentSucceeded({
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata,
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        log.warn({ paymentIntentId: paymentIntent.id }, 'Payment failed');
        break;
      }

      default:
        log.debug({ eventType: event.type }, 'Unhandled webhook event type');
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { received: true },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Webhook processing failed');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Webhook processing failed' },
    };
  }
}

// ============================================================================
// PAYMENT VERIFICATION (payment-complete page)
// ============================================================================

export const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9]+$/;

export function jsonResponse(status: number, body: unknown): ResponseContext {
  return { status, headers: { 'Content-Type': 'application/json' }, body };
}

/**
 * GET /api/monetization/{tip|fund|value}/verify?payment_intent=pi_...
 * Look up a Stripe payment intent after the checkout redirect.
 *
 * SECURITY: Requires auth and only reveals payments made by the caller
 * (payment intent metadata.ferni_user_id must match), unless admin.
 */
export async function verifyPaymentStatus(ctx: RequestContext): Promise<ResponseContext> {
  if (!ctx.authUserId) {
    return jsonResponse(401, { success: false, message: 'Sign in to check your payment.' });
  }

  const paymentIntentId = ctx.query.payment_intent;
  if (!paymentIntentId || !PAYMENT_INTENT_ID.test(paymentIntentId)) {
    return jsonResponse(400, { success: false, message: 'Missing or invalid payment reference.' });
  }

  if (!isStripeConfigured()) {
    return jsonResponse(503, {
      success: false,
      message: "We can't confirm payments right now. If you were charged, it'll show up soon.",
    });
  }

  try {
    const result = await verifyPayment(paymentIntentId);

    // Treat someone else's payment exactly like a missing one (no enumeration)
    if (result.userId !== ctx.authUserId && !ctx.isAdmin) {
      log.warn({ authUserId: ctx.authUserId }, 'Payment verify for another user refused');
      return jsonResponse(404, { success: false, message: "We couldn't find that payment." });
    }

    if (result.succeeded) {
      return jsonResponse(200, {
        success: true,
        type: result.type,
        amountCents: result.amountCents,
      });
    }

    return jsonResponse(200, {
      success: false,
      message: "Your payment hasn't gone through yet. Check back in a moment.",
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to verify payment');
    return jsonResponse(500, {
      success: false,
      message: "We couldn't verify your payment. If you were charged, we'll sort it out.",
    });
  }
}
