/**
 * Monetization API: Tip Jar and Value Capture endpoints.
 * Extracted from monetization-routes.ts.
 */

import { tipJar } from '../../services/monetization/tip-jar.js';
import { valueCapture } from '../../services/monetization/value-capture.js';
import {
  createPaymentIntent,
  isStripeConfigured,
  verifyPayment,
} from '../../services/stripe-payments.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RequestContext, ResponseContext } from './types.js';

const log = createLogger({ module: 'MonetizationAPI' });

// ============================================================================
// TIP JAR ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/tip/config
 * Get tip jar configuration and user's tip history
 *
 * SECURITY: Uses authenticated userId when available
 */
export async function getTipConfig(ctx: RequestContext): Promise<ResponseContext> {
  // SECURITY: Prefer authenticated userId over deprecated x-user-id
  const userId = ctx.authUserId || ctx.query.userId;

  const config = tipJar.getConfig();
  const stats = tipJar.getStats();
  const userTips = userId ? await tipJar.getUserTips(userId) : [];

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      config,
      stats: {
        totalTips: stats.tipCount,
        averageTipCents: stats.averageTipCents,
      },
      userTips: userTips.slice(0, 10), // Last 10 tips
      stripeEnabled: isStripeConfigured(),
    },
  };
}

/**
 * POST /api/monetization/tip
 * Create a tip payment
 */
export async function createTip(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, amountCents, message } = ctx.body as {
    userId?: string;
    amountCents?: number;
    message?: string;
  };

  if (!userId || !amountCents) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and amountCents are required' },
    };
  }

  try {
    // Create tip record
    const tip = await tipJar.create({ userId, amountCents, message });

    // Create Stripe payment intent
    const payment = await createPaymentIntent({
      userId,
      amountCents,
      type: 'tip',
      metadata: { tip_id: tip.id, message: message || '' },
    });

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        tipId: tip.id,
        clientSecret: payment.clientSecret,
        paymentIntentId: payment.paymentIntentId,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create tip');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * POST /api/monetization/tip/complete
 * Confirm tip payment succeeded
 */
export async function completeTip(ctx: RequestContext): Promise<ResponseContext> {
  const { paymentIntentId } = ctx.body as { paymentIntentId?: string };

  if (!paymentIntentId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'paymentIntentId is required' },
    };
  }

  try {
    const result = await verifyPayment(paymentIntentId);

    if (result.succeeded) {
      const thankYou = tipJar.getThankYou();
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          thankYouMessage: thankYou,
        },
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, message: 'Payment not yet completed' },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to verify tip');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to verify payment' },
    };
  }
}

// ============================================================================
// VALUE CAPTURE ENDPOINTS
// ============================================================================

/**
 * POST /api/monetization/value/detect
 * Detect if a message indicates a value event
 */
export async function detectValue(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, message, conversationId } = ctx.body as {
    userId?: string;
    message?: string;
    conversationId?: string;
  };

  if (!userId || !message) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and message are required' },
    };
  }

  const event = await valueCapture.detect({
    userId,
    message,
    conversationId: conversationId || '',
  });

  if (event) {
    const prompt = valueCapture.getPrompt(event);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        detected: true,
        event: {
          id: event.id,
          type: event.type,
          estimatedValueCents: event.estimatedValueCents,
          suggestedContributionCents: event.suggestedContributionCents,
        },
        prompt,
      },
    };
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { detected: false },
  };
}

/**
 * POST /api/monetization/value/contribute
 * Create a value capture contribution
 */
export async function contributeValue(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, eventId, amountCents } = ctx.body as {
    userId?: string;
    eventId?: string;
    amountCents?: number;
  };

  if (!userId || !eventId || !amountCents) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId, eventId, and amountCents are required' },
    };
  }

  try {
    const payment = await createPaymentIntent({
      userId,
      amountCents,
      type: 'value_capture',
      metadata: { event_id: eventId },
    });

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        clientSecret: payment.clientSecret,
        paymentIntentId: payment.paymentIntentId,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create value contribution');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}
