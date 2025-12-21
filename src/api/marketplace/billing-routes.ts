/**
 * Marketplace Billing Routes
 *
 * Handles usage tracking and billing:
 * - GET  /api/marketplace/usage/:itemId - Get usage for specific item
 * - GET  /api/marketplace/usage/summary - Get overall usage summary
 * - GET  /api/marketplace/usage/history - Get usage history
 * - GET  /api/marketplace/quota/check/:itemId - Check if user can execute
 * - GET  /api/marketplace/billing/payouts - Get pending payouts (for publishers)
 * - POST /api/marketplace/webhook - Stripe webhook endpoint
 * - POST /api/marketplace/checkout - Create checkout session
 * - GET  /api/marketplace/payment/config - Get payment configuration
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  checkQuota,
  getPendingPayouts,
  getUsageHistory,
  getUsageSummary,
} from '../../marketplace/billing/index.js';
import {
  createMarketplaceCheckout,
  handleWebhookEvent,
  isStripeConfigured,
  verifyWebhookSignature,
} from '../../marketplace/billing/stripe-webhooks.js';
import { getAgent, getTool, listInstallations } from '../../marketplace/index.js';
import type { MarketplaceId, UserId } from '../../marketplace/schema/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  parseBody,
  parseRawBody,
  sendJson,
  getUserId,
  getPublisher,
  getSubscriptionTier,
} from './helpers.js';

const log = getLogger().child({ module: 'marketplace-billing-routes' });

/**
 * Handle usage/billing routes
 */
export async function handleUsageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // GET /api/marketplace/usage/:itemId - Get usage for specific item
  if (pathname.match(/^\/api\/marketplace\/usage\/[^/]+$/) && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[4];
    const tier = getSubscriptionTier(req);

    try {
      const summary = getUsageSummary(userId, itemId, tier);
      sendJson(res, 200, summary);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/usage/summary - Get overall usage summary
  if (pathname === '/api/marketplace/usage/summary' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const tier = getSubscriptionTier(req);

    try {
      const installations = listInstallations(userId);
      const summaries = installations.map((inst) => getUsageSummary(userId, inst.itemId, tier));

      const totalExecutions = summaries.reduce((sum, s) => sum + s.totals.executions, 0);
      const totalTimeMs = summaries.reduce((sum, s) => sum + s.totals.executionTimeMs, 0);

      sendJson(res, 200, {
        period: summaries[0]?.period || new Date().toISOString().slice(0, 7),
        userId,
        tier,
        aggregate: {
          totalExecutions,
          totalTimeMs,
          itemCount: installations.length,
        },
        items: summaries,
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/usage/history - Get usage history
  if (pathname === '/api/marketplace/usage/history' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const records = getUsageHistory(userId, { limit: 100 });
      sendJson(res, 200, { records, totalCount: records.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/quota/check/:itemId - Check if user can execute
  if (pathname.match(/^\/api\/marketplace\/quota\/check\/[^/]+$/) && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[5];
    const tier = getSubscriptionTier(req);

    try {
      const result = checkQuota(userId, itemId, tier);
      sendJson(res, 200, result);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/billing/payouts - Get pending payouts (for publishers)
  if (pathname === '/api/marketplace/billing/payouts' && method === 'GET') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    try {
      const payouts = getPendingPayouts(publisher.publisherId);
      sendJson(res, 200, { payouts, totalCount: payouts.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

/**
 * Handle payment/webhook routes
 */
export async function handlePaymentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/webhook - Stripe webhook endpoint
  if (pathname === '/api/marketplace/webhook' && method === 'POST') {
    if (!isStripeConfigured()) {
      sendJson(res, 503, { error: 'Stripe not configured' });
      return true;
    }

    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      sendJson(res, 400, { error: 'Missing stripe-signature header' });
      return true;
    }

    try {
      const rawBody = await parseRawBody(req);
      const event = verifyWebhookSignature(rawBody, signature);
      await handleWebhookEvent(event);

      log.info({ eventType: event.type, eventId: event.id }, 'Marketplace webhook processed');
      sendJson(res, 200, { received: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Webhook processing failed');
      sendJson(res, 400, { error: 'Webhook verification failed' });
      return true;
    }
  }

  // POST /api/marketplace/checkout - Create checkout session
  if (pathname === '/api/marketplace/checkout' && method === 'POST') {
    if (!isStripeConfigured()) {
      sendJson(res, 503, { error: 'Stripe not configured' });
      return true;
    }

    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{
        itemId: string;
        itemType: 'tool' | 'agent';
        purchaseType?: 'one-time' | 'subscription';
        successUrl?: string;
        cancelUrl?: string;
        email?: string;
      }>(req);

      if (!body.itemId || !body.itemType) {
        sendJson(res, 400, { error: 'itemId and itemType are required' });
        return true;
      }

      const item = body.itemType === 'tool' ? getTool(body.itemId) : getAgent(body.itemId);
      if (!item) {
        sendJson(res, 404, { error: `${body.itemType} not found` });
        return true;
      }

      type ItemPricing =
        | { model: 'free' }
        | { model: 'one-time' | 'subscription'; priceInCents: number };
      const pricing: ItemPricing =
        'pricing' in item && item.pricing ? (item.pricing as ItemPricing) : { model: 'free' };
      if (pricing.model === 'free') {
        sendJson(res, 400, { error: 'This item is free, no checkout required' });
        return true;
      }

      const session = await createMarketplaceCheckout({
        userId: userId as UserId,
        itemId: body.itemId as MarketplaceId,
        itemType: body.itemType,
        itemName: item.name,
        publisherId: item.publisher.id,
        priceInCents: pricing.priceInCents,
        purchaseType:
          body.purchaseType || (pricing.model === 'subscription' ? 'subscription' : 'one-time'),
        successUrl: body.successUrl || 'https://ferni.ai/marketplace/success',
        cancelUrl: body.cancelUrl || 'https://ferni.ai/marketplace',
        email: body.email,
      });

      log.info(
        { userId, itemId: body.itemId, sessionId: session.sessionId },
        'Checkout session created'
      );
      sendJson(res, 200, session);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Checkout creation failed');
      sendJson(res, 500, { error: 'Failed to create checkout session' });
      return true;
    }
  }

  // GET /api/marketplace/payment/config - Get payment configuration
  if (pathname === '/api/marketplace/payment/config' && method === 'GET') {
    sendJson(res, 200, {
      enabled: isStripeConfigured(),
      currency: 'usd',
      platformFeePercent: 20,
      minPayoutCents: 1000,
      payoutSchedule: 'monthly',
    });
    return true;
  }

  return false;
}
