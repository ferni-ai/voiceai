/**
 * POST /api/monetization/webhook — Stripe events for one-time payments
 * (tips, value capture, Ferni Fund).
 *
 * SECURITY: every event must carry a valid stripe-signature over the raw request
 * body. handlePaymentSucceeded records money and Ferni Fund contributions for
 * whatever ferni_user_id the metadata names, so an unsigned or forged event is
 * rejected with 400 before anything is recorded.
 */

import { handlePaymentSucceeded, verifyPaymentWebhook } from '../services/stripe-payments.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'MonetizationWebhook' });

const WEBHOOK_PATH = '/api/monetization/webhook';

interface WebhookRequest {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface WebhookResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function json(status: number, body: unknown): WebhookResponse {
  return { status, headers: { 'Content-Type': 'application/json' }, body };
}

/**
 * Body for a monetization request. The webhook keeps the raw string because Stripe
 * signs the exact bytes it sent; every other route gets parsed JSON ({} if invalid).
 */
export function parseMonetizationBody(pathname: string, rawBody: string): unknown {
  if (pathname === WEBHOOK_PATH) return rawBody;
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return {};
  }
}

export async function handleMonetizationWebhook(ctx: WebhookRequest): Promise<WebhookResponse> {
  const signature = ctx.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    log.warn('Monetization webhook received without signature');
    return json(400, { error: 'Missing stripe-signature header' });
  }
  if (typeof ctx.body !== 'string') {
    log.error({ bodyType: typeof ctx.body }, 'Monetization webhook body must be the raw string');
    return json(400, { error: 'Invalid webhook payload format' });
  }

  let event;
  try {
    event = await verifyPaymentWebhook(ctx.body, signature);
  } catch (error) {
    log.warn({ error: String(error) }, 'Monetization webhook signature verification failed');
    return json(400, { error: 'Webhook verification failed' });
  }

  try {
    log.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received');
    const paymentIntent = event.data.object;
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded({
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata ?? {},
        });
        break;
      case 'payment_intent.payment_failed':
        log.warn({ paymentIntentId: paymentIntent.id }, 'Payment failed');
        break;
      default:
        log.debug({ eventType: event.type }, 'Unhandled webhook event type');
    }
    return json(200, { received: true });
  } catch (error) {
    // 500 so Stripe retries a verified event whose processing failed
    log.error({ error: String(error) }, 'Webhook processing failed');
    return json(500, { error: 'Webhook processing failed' });
  }
}
