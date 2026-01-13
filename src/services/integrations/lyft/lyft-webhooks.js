/**
 * Lyft Webhook Handler
 *
 * Handles webhook events from Lyft for ride status updates.
 * Events: ride.status, ride.receipt_ready
 *
 * @module services/integrations/lyft/lyft-webhooks
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getWebhookRouter } from '../webhook-router.js';
import { createHmac, timingSafeEqual } from 'crypto';
const log = createLogger({ module: 'lyft-webhooks' });
// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================
/**
 * Verify Lyft webhook signature
 */
function verifySignature(payload, signature, secret) {
    if (!signature || !secret) {
        return false;
    }
    try {
        const expectedSignature = createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
        // Use timing-safe comparison
        const signatureBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        if (signatureBuffer.length !== expectedBuffer.length) {
            return false;
        }
        return timingSafeEqual(signatureBuffer, expectedBuffer);
    }
    catch (error) {
        log.error({ error: String(error) }, 'Lyft webhook signature verification error');
        return false;
    }
}
// ============================================================================
// EVENT HANDLERS
// ============================================================================
const handlers = {};
/**
 * Register handlers for Lyft webhook events
 */
export function registerLyftWebhookHandlers(newHandlers) {
    Object.assign(handlers, newHandlers);
    log.info('Lyft webhook handlers registered');
}
/**
 * Process incoming Lyft webhook event
 */
async function processLyftWebhook(event) {
    const { event: eventType, event_id, ride_id, status, user_id } = event;
    log.debug({ eventId: event_id, eventType, rideId: ride_id }, 'Processing Lyft webhook');
    try {
        switch (eventType) {
            case 'ride.status': {
                if (handlers.onStatusChange && status && user_id) {
                    await handlers.onStatusChange(user_id, ride_id, status);
                }
                return {
                    success: true,
                    message: `Processed status change: ${status}`,
                };
            }
            case 'ride.receipt_ready': {
                if (handlers.onReceiptReady && user_id) {
                    await handlers.onReceiptReady(user_id, ride_id, {});
                }
                return {
                    success: true,
                    message: 'Processed receipt ready event',
                };
            }
            default:
                log.warn({ eventType }, 'Unknown Lyft webhook event type');
                return {
                    success: true,
                    message: `Unknown event type: ${eventType}`,
                };
        }
    }
    catch (error) {
        log.error({ error: String(error), eventId: event_id }, 'Lyft webhook processing error');
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
 * Initialize Lyft webhooks by registering handlers with the webhook router
 */
export function initializeLyftWebhooks() {
    const webhookRouter = getWebhookRouter();
    // Register handler for status changes
    webhookRouter.registerHandler({
        integrationId: 'lyft',
        eventType: 'ride.status',
        handler: async (event) => {
            const lyftEvent = event.payload;
            await processLyftWebhook(lyftEvent);
        },
    });
    // Register handler for receipts
    webhookRouter.registerHandler({
        integrationId: 'lyft',
        eventType: 'ride.receipt_ready',
        handler: async (event) => {
            const lyftEvent = event.payload;
            await processLyftWebhook(lyftEvent);
        },
    });
    // Register catch-all handler
    webhookRouter.registerHandler({
        integrationId: 'lyft',
        eventType: '*',
        handler: async (event) => {
            log.info({ eventType: event.eventType }, 'Received Lyft webhook event');
        },
    });
    log.info('Lyft webhooks initialized');
}
/**
 * Express route handler for Lyft webhooks
 * POST /webhooks/lyft
 */
export async function handleLyftWebhook(req, res) {
    try {
        const signature = req.headers['x-lyft-signature'];
        const webhookSecret = process.env.LYFT_WEBHOOK_SECRET;
        // Verify signature if secret is configured
        if (webhookSecret) {
            const rawBody = JSON.stringify(req.body);
            if (!verifySignature(rawBody, signature, webhookSecret)) {
                log.warn('Invalid Lyft webhook signature');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
        }
        const event = req.body;
        const result = await processLyftWebhook(event);
        if (result.success) {
            res.status(200).json({ received: true, message: result.message });
        }
        else {
            res.status(500).json({ error: result.message });
        }
    }
    catch (error) {
        log.error({ error: String(error) }, 'Lyft webhook handler error');
        res.status(500).json({ error: 'Internal server error' });
    }
}
// ============================================================================
// STATUS CHANGE NOTIFICATIONS
// ============================================================================
/**
 * Default status change handler
 */
export async function defaultStatusChangeHandler(userId, rideId, status) {
    log.info({ userId, rideId, status }, 'Lyft ride status changed');
    const statusMessages = {
        pending: 'Finding you a Lyft driver...',
        accepted: 'A driver accepted your ride!',
        arrived: 'Your Lyft has arrived.',
        pickedUp: 'You\'re on your way!',
        droppedOff: 'You\'ve arrived! Hope you enjoyed the ride.',
        canceled: 'Your Lyft was cancelled.',
        unknown: 'Checking your ride status...',
    };
    const message = statusMessages[status];
    log.debug({ userId, message }, 'Lyft status notification prepared');
}
// Register default handlers
registerLyftWebhookHandlers({
    onStatusChange: defaultStatusChangeHandler,
    onReceiptReady: async (userId, rideId) => {
        log.info({ userId, rideId }, 'Lyft receipt ready');
    },
});
//# sourceMappingURL=lyft-webhooks.js.map