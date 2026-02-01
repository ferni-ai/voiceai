/**
 * Instacart Webhook Handler
 *
 * Handles webhook events from Instacart for order status updates.
 * Note: Requires business partnership with Instacart.
 *
 * @module services/integrations/instacart/instacart-webhooks
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getWebhookRouter } from '../webhook-router.js';
import { createHmac, timingSafeEqual } from 'crypto';
import type { InstacartOrder } from './instacart-client.js';

const log = createLogger({ module: 'instacart-webhooks' });

// ============================================================================
// TYPES
// ============================================================================

export type InstacartOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shopping'
  | 'delivering'
  | 'delivered'
  | 'cancelled';

export interface InstacartWebhookEvent {
  event_type: 'order.status_changed' | 'order.item_substituted' | 'order.delivered';
  event_id: string;
  timestamp: string;
  order_id: string;
  user_id?: string;
  status?: InstacartOrderStatus;
  data?: {
    original_item?: { id: string; name: string };
    substituted_item?: { id: string; name: string };
    delivered_at?: string;
    shopper_name?: string;
  };
}

export interface InstacartWebhookHandlers {
  onOrderStatusChange?: (
    userId: string,
    orderId: string,
    status: InstacartOrderStatus,
    order?: InstacartOrder
  ) => Promise<void>;
  onItemSubstituted?: (
    userId: string,
    orderId: string,
    originalItem: string,
    newItem: string
  ) => Promise<void>;
  onOrderDelivered?: (userId: string, orderId: string, deliveredAt: Date) => Promise<void>;
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    log.error({ error: String(error) }, 'Instacart webhook signature verification error');
    return false;
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

const handlers: InstacartWebhookHandlers = {};

export function registerInstacartWebhookHandlers(newHandlers: InstacartWebhookHandlers): void {
  Object.assign(handlers, newHandlers);
  log.info('Instacart webhook handlers registered');
}

async function processInstacartWebhook(
  event: InstacartWebhookEvent
): Promise<{ success: boolean; message: string }> {
  const { event_type, event_id, order_id, status, user_id, data } = event;

  log.debug(
    { eventId: event_id, eventType: event_type, orderId: order_id },
    'Processing Instacart webhook'
  );

  try {
    switch (event_type) {
      case 'order.status_changed': {
        if (handlers.onOrderStatusChange && status && user_id) {
          await handlers.onOrderStatusChange(user_id, order_id, status);
        }
        return { success: true, message: `Processed status change: ${status}` };
      }

      case 'order.item_substituted': {
        if (
          handlers.onItemSubstituted &&
          user_id &&
          data?.original_item &&
          data?.substituted_item
        ) {
          await handlers.onItemSubstituted(
            user_id,
            order_id,
            data.original_item.name,
            data.substituted_item.name
          );
        }
        return { success: true, message: 'Processed item substitution' };
      }

      case 'order.delivered': {
        if (handlers.onOrderDelivered && user_id && data?.delivered_at) {
          await handlers.onOrderDelivered(user_id, order_id, new Date(data.delivered_at));
        }
        return { success: true, message: 'Processed order delivered' };
      }

      default:
        log.warn({ eventType: event_type }, 'Unknown Instacart webhook event type');
        return { success: true, message: `Unknown event type: ${event_type}` };
    }
  } catch (error) {
    log.error({ error: String(error), eventId: event_id }, 'Instacart webhook processing error');
    return { success: false, message: String(error) };
  }
}

// ============================================================================
// WEBHOOK ROUTE REGISTRATION
// ============================================================================

export function initializeInstacartWebhooks(): void {
  const webhookRouter = getWebhookRouter();

  webhookRouter.registerHandler({
    integrationId: 'instacart',
    eventType: 'order.status_changed',
    handler: async (event) => {
      const instacartEvent = event.payload as InstacartWebhookEvent;
      await processInstacartWebhook(instacartEvent);
    },
  });

  webhookRouter.registerHandler({
    integrationId: 'instacart',
    eventType: 'order.item_substituted',
    handler: async (event) => {
      const instacartEvent = event.payload as InstacartWebhookEvent;
      await processInstacartWebhook(instacartEvent);
    },
  });

  webhookRouter.registerHandler({
    integrationId: 'instacart',
    eventType: 'order.delivered',
    handler: async (event) => {
      const instacartEvent = event.payload as InstacartWebhookEvent;
      await processInstacartWebhook(instacartEvent);
    },
  });

  webhookRouter.registerHandler({
    integrationId: 'instacart',
    eventType: '*',
    handler: async (event) => {
      log.info({ eventType: event.eventType }, 'Received Instacart webhook event');
    },
  });

  log.info('Instacart webhooks initialized');
}

// ============================================================================
// EXPRESS ROUTE HANDLER
// ============================================================================

import type { Request, Response } from 'express';

export async function handleInstacartWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-instacart-signature'] as string;
    const webhookSecret = process.env.INSTACART_WEBHOOK_SECRET;

    if (webhookSecret) {
      const rawBody = JSON.stringify(req.body);
      if (!verifySignature(rawBody, signature, webhookSecret)) {
        log.warn('Invalid Instacart webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const event = req.body as InstacartWebhookEvent;
    const result = await processInstacartWebhook(event);

    if (result.success) {
      res.status(200).json({ received: true, message: result.message });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Instacart webhook handler error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// DEFAULT HANDLERS
// ============================================================================

async function defaultStatusChangeHandler(
  userId: string,
  orderId: string,
  status: InstacartOrderStatus
): Promise<void> {
  log.info({ userId, orderId, status }, 'Instacart order status changed');

  const statusMessages: Record<InstacartOrderStatus, string> = {
    pending: 'Your order is being processed.',
    confirmed: 'Your order has been confirmed!',
    shopping: 'A shopper is picking up your items.',
    delivering: 'Your groceries are on the way!',
    delivered: 'Your groceries have been delivered. Enjoy!',
    cancelled: 'Your order was cancelled.',
  };

  const message = statusMessages[status];
  log.debug({ userId, message }, 'Instacart status notification prepared');
}

registerInstacartWebhookHandlers({
  onOrderStatusChange: defaultStatusChangeHandler,
  onItemSubstituted: async (userId, orderId, originalItem, newItem) => {
    log.info({ userId, orderId, originalItem, newItem }, 'Instacart item substituted');
  },
  onOrderDelivered: async (userId, orderId, deliveredAt) => {
    log.info({ userId, orderId, deliveredAt }, 'Instacart order delivered');
  },
});
