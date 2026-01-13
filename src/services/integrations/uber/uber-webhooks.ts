/**
 * Uber Webhook Handler
 *
 * Handles webhook events from Uber for ride status updates.
 * Events: requests.status_changed, requests.receipt_ready
 *
 * @module services/integrations/uber/uber-webhooks
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getWebhookRouter } from '../webhook-router.js';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberRide, UberRideStatus, UberReceipt } from './uber-client.js';

const log = createLogger({ module: 'uber-webhooks' });

// ============================================================================
// TYPES
// ============================================================================

export interface UberWebhookEvent {
  event_type: 'requests.status_changed' | 'requests.receipt_ready';
  event_id: string;
  event_time: number;
  resource_href: string;
  meta: {
    user_id: string;
    resource_id: string;
    status?: UberRideStatus;
  };
}

export interface UberWebhookHandlers {
  onStatusChange?: (userId: string, requestId: string, status: UberRideStatus, ride?: UberRide) => Promise<void>;
  onReceiptReady?: (userId: string, requestId: string, receipt: UberReceipt) => Promise<void>;
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify Uber webhook signature
 */
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    log.error({ error: String(error) }, 'Webhook signature verification error');
    return false;
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

const handlers: UberWebhookHandlers = {};

/**
 * Register handlers for Uber webhook events
 */
export function registerUberWebhookHandlers(newHandlers: UberWebhookHandlers): void {
  Object.assign(handlers, newHandlers);
  log.info('Uber webhook handlers registered');
}

/**
 * Process incoming Uber webhook event
 */
async function processUberWebhook(
  event: UberWebhookEvent
): Promise<{ success: boolean; message: string }> {
  const { event_type, event_id, meta } = event;

  log.debug(
    { eventId: event_id, eventType: event_type, resourceId: meta.resource_id },
    'Processing Uber webhook'
  );

  try {
    switch (event_type) {
      case 'requests.status_changed': {
        if (handlers.onStatusChange && meta.status) {
          await handlers.onStatusChange(
            meta.user_id,
            meta.resource_id,
            meta.status
          );
        }
        return {
          success: true,
          message: `Processed status change: ${meta.status}`,
        };
      }

      case 'requests.receipt_ready': {
        if (handlers.onReceiptReady) {
          // Receipt details would be fetched separately
          await handlers.onReceiptReady(meta.user_id, meta.resource_id, {} as UberReceipt);
        }
        return {
          success: true,
          message: 'Processed receipt ready event',
        };
      }

      default:
        log.warn({ eventType: event_type }, 'Unknown Uber webhook event type');
        return {
          success: true,
          message: `Unknown event type: ${event_type}`,
        };
    }
  } catch (error) {
    log.error({ error: String(error), eventId: event_id }, 'Uber webhook processing error');
    return {
      success: false,
      message: String(error),
    };
  }
}

// ============================================================================
// WEBHOOK ROUTE REGISTRATION
// ============================================================================

/**
 * Initialize Uber webhooks by registering handlers with the webhook router
 * Note: Webhook config is already in WEBHOOK_CONFIGS in webhook-router.ts
 */
export function initializeUberWebhooks(): void {
  const webhookRouter = getWebhookRouter();

  // Register handler for status changes
  webhookRouter.registerHandler({
    integrationId: 'uber',
    eventType: 'requests.status_changed',
    handler: async (event) => {
      const uberEvent = event.payload as UberWebhookEvent;
      await processUberWebhook(uberEvent);
    },
  });

  // Register handler for receipts
  webhookRouter.registerHandler({
    integrationId: 'uber',
    eventType: 'requests.receipt_ready',
    handler: async (event) => {
      const uberEvent = event.payload as UberWebhookEvent;
      await processUberWebhook(uberEvent);
    },
  });

  // Register catch-all handler
  webhookRouter.registerHandler({
    integrationId: 'uber',
    eventType: '*',
    handler: async (event) => {
      log.info({ eventType: event.eventType }, 'Received Uber webhook event');
    },
  });

  log.info('Uber webhooks initialized');
}

// ============================================================================
// EXPRESS ROUTE HANDLER
// ============================================================================

import type { Request, Response } from 'express';

/**
 * Express route handler for Uber webhooks
 * POST /webhooks/uber
 */
export async function handleUberWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-uber-signature'] as string;
    const webhookSecret = process.env.UBER_WEBHOOK_SECRET;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const rawBody = JSON.stringify(req.body);
      if (!verifySignature(rawBody, signature, webhookSecret)) {
        log.warn('Invalid Uber webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const event = req.body as UberWebhookEvent;
    const result = await processUberWebhook(event);

    if (result.success) {
      res.status(200).json({ received: true, message: result.message });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Uber webhook handler error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// STATUS CHANGE NOTIFICATIONS
// ============================================================================

/**
 * Default status change handler - logs and can trigger notifications
 */
export async function defaultStatusChangeHandler(
  userId: string,
  requestId: string,
  status: UberRideStatus
): Promise<void> {
  log.info({ userId, requestId, status }, 'Uber ride status changed');

  // Map status to user-friendly messages
  const statusMessages: Record<UberRideStatus, string> = {
    processing: 'Finding you a driver...',
    no_drivers_available: 'No drivers available right now. Try again?',
    accepted: 'A driver accepted your ride!',
    arriving: 'Your driver is on the way.',
    in_progress: 'You\'re on your way! Enjoy the ride.',
    driver_canceled: 'Your driver had to cancel. Finding another...',
    rider_canceled: 'Your ride was cancelled.',
    completed: 'You\'ve arrived! Hope it was a great ride.',
  };

  const message = statusMessages[status];
  
  // This would trigger a notification to the user
  // await notificationService.send(userId, { title: 'Uber', body: message });
  
  log.debug({ userId, message }, 'Status notification prepared');
}

// Register default handlers
registerUberWebhookHandlers({
  onStatusChange: defaultStatusChangeHandler,
  onReceiptReady: async (userId, requestId) => {
    log.info({ userId, requestId }, 'Uber receipt ready');
  },
});
